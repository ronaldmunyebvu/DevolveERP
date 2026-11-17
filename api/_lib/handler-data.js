import { createRepository } from './repo.js'
import { OPERATIONS, groupOf, methodOf } from '../../src/db/operations.js'
import { query, one, withTransaction } from './db.js'
import { recordActivity } from './activity.js'
import { mail } from './mailer.js'
import { currentSession } from './auth.js'
import { SESSION_COOKIE, fail, json, parseCookies, readBody } from './http.js'

const repository = createRepository({ query, one, withTransaction }, mail)

function sanitize(value, depth = 0) {
  if (depth > 8) throw Object.assign(new Error('Request arguments nested too deeply.'), { statusCode: 400 })
  if (value === null || value === undefined) return value
  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, depth + 1))
  if (type === 'object') {
    const out = {}
    for (const [key, entry] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      out[key] = sanitize(entry, depth + 1)
    }
    return out
  }
  return null
}

export default async function handler(event) {
  if (event.httpMethod !== 'POST') return fail('Method not allowed.', 405)

  let body
  try {
    body = readBody(event)
  } catch (cause) {
    return fail(cause.message, cause.statusCode || 400)
  }

  const operation = typeof body.operation === 'string' ? body.operation : ''
  const spec = OPERATIONS[operation]
  if (!spec) return fail('Unknown operation.', 404)

  try {
    const session = await currentSession(parseCookies(event)[SESSION_COOKIE])
    if (!session) return fail('Sign in to continue.', 401)
    if (spec.auth === 'admin' && session.role !== 'admin') {
      return fail('You do not have permission to do that.', 403)
    }

    const group = groupOf(operation)
    const method = methodOf(operation)
    const fn = repository[group]?.[method]
    if (typeof fn !== 'function') return fail('Misconfigured operation.', 500)

    const args = sanitize(Array.isArray(body.args) ? body.args : [])
    const ctx = {
      companyId: session.companyId,
      userId: session.userId,
      role: session.role,
    }
    const result = await fn(ctx, ...args)
    await recordActivity(ctx, operation, args, result)
    return json({ data: result ?? null })
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500
    if (status >= 500) console.error('[api/data]', error)
    return fail(
      status < 500 ? error.message : 'The request could not be completed.',
      status,
    )
  }
}
