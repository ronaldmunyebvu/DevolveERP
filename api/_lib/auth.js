import {
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { one } from './db.js'

const DEFAULT_TTL_SECONDS = 60 * 60 * 12

function secret() {
  const name = ['JWT_SECRET', 'SESSION_SECRET'].find(
    (key) => typeof process.env[key] === 'string' && process.env[key].trim(),
  )
  const value = name ? process.env[name].trim() : ''
  if (value.length < 32) {
    throw new Error(`${name ?? 'JWT_SECRET'} is missing or shorter than 32 characters.`)
  }
  return value
}

function sessionTtl() {
  const raw = (process.env.JWT_EXPIRES_IN ?? '').trim().toLowerCase()
  if (!raw) return DEFAULT_TTL_SECONDS
  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)?$/.exec(raw)
  if (!match) return DEFAULT_TTL_SECONDS
  const amount = Number(match[1])
  const unit = match[2] ?? 's'
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit]
  const seconds = Math.floor(amount * multiplier)
  if (!Number.isFinite(seconds) || seconds < 300 || seconds > 2_592_000) return DEFAULT_TTL_SECONDS
  return seconds
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(payloadB64) {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url')
}

export function issueSession({ userId, companyId, role }, ttlSeconds = sessionTtl()) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { userId, companyId, role, iat: now, exp: now + ttlSeconds }
  const body = base64url(JSON.stringify(payload))
  return { token: `${body}.${sign(body)}`, maxAge: ttlSeconds }
}

export function readSession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  let expected
  try {
    expected = sign(body)
  } catch {
    return null
  }
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload?.exp || payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function currentSession(token) {
  const payload = readSession(token)
  if (!payload?.userId) return null

  const user = await one(
    `SELECT id, company_id, full_name, email, phone, role, status, permissions,
            last_login_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [payload.userId],
  )
  if (!user || user.status !== 'active') return null

  if (payload.companyId && payload.companyId !== user.company_id) return null

  const company = await one('SELECT * FROM companies WHERE id = $1', [user.company_id])
  if (!company) return null

  return {
    user,
    company,
    companyId: user.company_id,
    userId: user.id,
    role: user.role,
  }
}

export function actorFor(session) {
  return {
    id: session.userId,
    company_id: session.companyId,
    role: session.role,
    full_name: session.user.full_name,
    email: session.user.email,
  }
}

/* ------------------------------------------------------------- passwords */

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(password), salt, 64)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export function verifyPassword(password, stored) {
  if (!stored) return false
  const [scheme, salt, hash] = String(stored).split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  try {
    const candidate = scryptSync(String(password), Buffer.from(salt, 'base64url'), 64)
    const expected = Buffer.from(hash, 'base64url')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------ email codes */

export function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashCode(code) {
  return createHmac('sha256', secret()).update(String(code)).digest('hex')
}

export function publicAccount(user, company) {
  if (!user) return null
  const { password_hash, must_setup, ...safe } = user
  void password_hash
  void must_setup
  return { user: safe, company }
}

export { DEFAULT_TTL_SECONDS, sessionTtl }
