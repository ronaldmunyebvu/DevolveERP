import dns from 'node:dns'
import net from 'node:net'

/**
 * Chooses how the API reaches Postgres.
 *
 * The default (`pg`) speaks the Postgres wire protocol over TCP port 5432 and
 * is used in production. Set DB_DRIVER=neon to use Neon's WebSocket transport
 * over port 443 instead, which works on networks that block 5432.
 */
export const neonTransport = /^(neon|ws|websocket)$/i.test((process.env.DB_DRIVER || '').trim())

let networkFixed = false

/**
 * This network black-holes IPv6, so make Node prefer IPv4 before any driver
 * opens a socket or makes a fetch request.
 */
export function applyNetworkFixes() {
  if (networkFixed) return
  networkFixed = true
  dns.setDefaultResultOrder('ipv4first')
  net.setDefaultAutoSelectFamily(false)
}

let typesReady = false

function applyDateParser(setTypeParser) {
  if (typesReady) return
  typesReady = true
  // `date` columns stay as YYYY-MM-DD text, not a Date at midnight in UTC.
  setTypeParser(1082, (value) => (value === null || value === undefined ? value : String(value)))
}

export async function createPool(options) {
  if (neonTransport) {
    applyNetworkFixes()

    const { Pool, neonConfig, types } = await import('@neondatabase/serverless')
    applyDateParser(types.setTypeParser)
    neonConfig.fetchFunction = (...args) => fetch(...args)

    if (!globalThis.WebSocket) {
      const { default: WS } = await import('ws')
      neonConfig.webSocketConstructor = WS
    }

    return new Pool({
      connectionString: options.connectionString,
      max: options.max,
      idleTimeoutMillis: options.idleTimeoutMillis,
      allowExitOnIdle: true,
    })
  }

  const { default: pg } = await import('pg')
  applyDateParser(pg.types.setTypeParser)
  return new pg.Pool(options)
}
