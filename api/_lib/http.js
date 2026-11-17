import { sessionTtl } from './auth.js'

export const SESSION_COOKIE = 'devolve.session'
const BASE_SECONDS = sessionTtl()

export function json(body, status = 200, headers = {}) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(body),
  }
}

export function fail(message, status = 400) {
  return json({ error: message }, status)
}

export function readBody(event) {
  if (!event?.body) return {}
  try {
    return JSON.parse(event.body) ?? {}
  } catch {
    throw Object.assign(new Error('Request body was not valid JSON.'), { statusCode: 400 })
  }
}

export function parseCookies(event) {
  const header = event?.headers?.cookie || event?.headers?.Cookie || ''
  const jar = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    jar[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return jar
}

function forwardedProto(event) {
  const headers = event?.headers || {}
  const forwarded = headers['x-forwarded-proto']
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
}

export function isSecureRequest(event) {
  const proto = forwardedProto(event)
  if (proto) return proto === 'https'
  const host = String(event?.headers?.host || event?.headers?.Host || '')
  return host.endsWith('vercel.app') || process.env.NODE_ENV === 'production'
}

export function sessionCookie(event, token, ttlSeconds = BASE_SECONDS) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${Math.floor(ttlSeconds)}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (isSecureRequest(event)) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(event) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (isSecureRequest(event)) parts.push('Secure')
  return parts.join('; ')
}

export { BASE_SECONDS }
