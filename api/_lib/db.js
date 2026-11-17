import { createPool, neonTransport, applyNetworkFixes } from './pool.js'

/**
 * Server-only Postgres access. The connection string is read inside the
 * function, so it never reaches a browser bundle.
 */
const CANDIDATE_VARS = ['DATABASE_URL', 'NEON_DATABASE_URL', 'POSTGRES_URL', 'PGDATABASE_URL']

export function connectionString() {
  for (const name of CANDIDATE_VARS) {
    const value = process.env[name]
    if (value && value.trim()) return value.trim()
  }
  throw new Error(
    `No database connection string found. Set one of ${CANDIDATE_VARS.join(', ')}.`,
  )
}

function httpUrl(value) {
  try {
    const parsed = new URL(value)
    parsed.searchParams.delete('channel_binding')
    parsed.searchParams.set('sslmode', 'verify-full')
    return parsed.toString()
  } catch {
    return value
  }
}

const POOL_SIZE = 4
const CONNECT_TIMEOUT_MS = 60_000
const STATEMENT_TIMEOUT_MS = 30_000

function parseDates(setTypeParser) {
  // `date` columns stay as YYYY-MM-DD text, not a Date at midnight in UTC.
  setTypeParser(1082, (value) => (value === null || value === undefined ? value : String(value)))
}

let poolPromise = null
let neonPromise = null

/**
 * Neon over HTTPS. Ordinary queries use a fresh fetch request each time, so
 * there are no long-lived sockets to go stale on restrictive networks.
 */
async function neon() {
  if (!neonPromise) {
    neonPromise = (async () => {
      applyNetworkFixes()
      const mod = await import('@neondatabase/serverless')
      parseDates(mod.types.setTypeParser)
      const baseFetch = globalThis.fetch
      // The driver's default fetch does not honour Node's IPv4 preference.
      mod.neonConfig.fetchFunction = (url, options) => baseFetch(url, options)
      return {
        sql: mod.neon(httpUrl(connectionString()), { fullResults: true }),
        Client: mod.Client,
      }
    })()
    neonPromise.catch(() => {
      neonPromise = null
    })
  }
  return neonPromise
}

async function client() {
  if (!poolPromise) {
    poolPromise = createPool({
      connectionString: httpUrl(connectionString()),
      max: POOL_SIZE,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 30_000,
      ssl: { sslmode: 'verify-full' },
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      allowExitOnIdle: true,
    }).then((pool) => {
      pool.on('error', (error) => console.error('[api/db] pool error', error.message))
      return pool
    })
    poolPromise.catch(() => {
      poolPromise = null
    })
  }
  return poolPromise
}

export async function warmPool() {
  if (neonTransport) {
    try {
      await query('SELECT 1')
      console.log('[api/db] neon http ready')
    } catch (error) {
      console.error('[api/db] warm-up failed', error.message)
    }
    return
  }

  const pool = await client()
  const attempts = Array.from({ length: POOL_SIZE }, async () => {
    try {
      const connection = await pool.connect()
      connection.release()
      return true
    } catch {
      return false
    }
  })
  const ready = (await Promise.all(attempts)).filter(Boolean).length
  if (ready) console.log(`[api/db] pool warmed: ${ready}/${POOL_SIZE}`)
}

export async function query(text, params = []) {
  if (neonTransport) {
    const { sql } = await neon()
    const result = await sql.query(text, params)
    return result?.rows ?? []
  }

  const pool = await client()
  const result = await pool.query({
    text,
    values: params,
    query_timeout: STATEMENT_TIMEOUT_MS,
  })
  return result?.rows ?? []
}

export async function one(text, params = []) {
  return (await query(text, params))[0] ?? null
}

/**
 * Runs `fn(tx)` inside a transaction. `tx` exposes `query` and `one` bound to
 * one connection, so multi-step stock and accounting writes are atomic.
 */
export async function withTransaction(fn) {
  let connection
  let release

  if (neonTransport) {
    const { Client } = await neon()
    connection = new Client({ connectionString: httpUrl(connectionString()) })
    await connection.connect()
    release = () => connection.end()
  } else {
    const pool = await client()
    connection = await pool.connect()
    release = () => connection.release()
  }

  const tx = {
    async query(text, params = []) {
      const result = await connection.query({
        text,
        values: params,
        ...(neonTransport ? {} : { query_timeout: STATEMENT_TIMEOUT_MS }),
      })
      return result?.rows ?? []
    },
    async one(text, params = []) {
      const rows = await tx.query(text, params)
      return rows[0] ?? null
    },
  }

  try {
    await connection.query('BEGIN')
    const result = await fn(tx)
    await connection.query('COMMIT')
    return result
  } catch (error) {
    try {
      await connection.query('ROLLBACK')
    } catch {
      // ignore rollback failures
    }
    throw error
  } finally {
    await release()
  }
}

export async function closePool() {
  if (!poolPromise) return
  const pool = await poolPromise.catch(() => null)
  poolPromise = null
  if (pool) await pool.end()
}

export async function rowBelongsTo(table, id, companyId) {
  if (!id || !companyId) return false
  const allowed = new Set(['users', 'customers', 'suppliers', 'products', 'invoices', 'quotations', 'purchase_orders'])
  if (!allowed.has(table)) return false
  const row = await one(`SELECT 1 AS ok FROM ${table} WHERE id = $1 AND company_id = $2`, [id, companyId])
  return Boolean(row)
}

export async function countRows(table) {
  const allowed = new Set(['companies', 'users'])
  if (!allowed.has(table)) return 0
  const row = await one('SELECT count(*)::int AS count FROM ' + table)
  return Number(row?.count ?? 0)
}
