import { one, query } from './db.js'
import {
  currentSession,
  generateCode,
  hashCode,
  hashPassword,
  issueSession,
  publicAccount,
  verifyPassword,
} from './auth.js'
import { mail } from './mailer.js'
import {
  SESSION_COOKIE,
  clearSessionCookie,
  fail,
  json,
  parseCookies,
  readBody,
  sessionCookie,
} from './http.js'

class ApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function accountPayload(session) {
  return { account: publicAccount(session.user, session.company) }
}

async function findUserByEmail(email) {
  return one(
    `SELECT u.*, c.id AS company_ref FROM users u
     JOIN companies c ON c.id = u.company_id
     WHERE lower(u.email) = lower($1)`,
    [email],
  )
}

async function adminRecipient(user) {
  const admin = await one(
    `SELECT full_name, email FROM users
     WHERE company_id = $1 AND role = 'admin' AND status = 'active'
     ORDER BY created_at LIMIT 1`,
    [user.company_id],
  )
  return {
    email: admin?.email || user.email,
    name: admin?.full_name || user.full_name,
  }
}

function requestedRole(value) {
  if (value === 'admin') return 'admin'
  if (value === 'member') return 'member'
  return null
}

async function issueCode(userId, purpose) {
  const code = generateCode()
  await query(
    `UPDATE auth_codes SET used_at = now()
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  )
  await query(
    `INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1,$2,$3, now() + interval '10 minutes')`,
    [userId, purpose, hashCode(code)],
  )
  return code
}

async function consumeCode(userId, code) {
  const rows = await query(
    `SELECT * FROM auth_codes
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  const record = rows[0]
  if (!record) throw new ApiError('That code has expired. Request a new one.', 400)
  if (record.code_hash !== hashCode(code)) {
    throw new ApiError('That code is not correct.', 400)
  }
  await query('UPDATE auth_codes SET used_at = now() WHERE id = $1', [record.id])
}

async function sessionFrom(userId, companyId, role, event) {
  const { token, maxAge } = issueSession({ userId, companyId, role })
  return { cookie: sessionCookie(event, token, maxAge) }
}

const ACTIONS = {
  async session(_payload, event) {
    const session = await currentSession(parseCookies(event)[SESSION_COOKIE])
    if (!session) return { account: null }
    return accountPayload(session)
  },

  async signIn(payload, event) {
    const email = String(payload.email || '').trim()
    const password = String(payload.password || '')
    const role = requestedRole(payload.role)
    if (!email || !password) throw new ApiError('Enter your email address and password.')

    const user = await findUserByEmail(email)
    if (!user) throw new ApiError('Incorrect email address or password.', 401)
    if (user.status !== 'active') throw new ApiError('This account has been deactivated.', 403)
    if (!user.password_hash) {
      throw new ApiError('This account has not been set up yet. Use the account setup page.', 400)
    }
    if (!verifyPassword(password, user.password_hash)) {
      throw new ApiError('Incorrect email address or password.', 401)
    }
    if (role && user.role !== role) {
      throw new ApiError('Incorrect email address or password.', 401)
    }

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id])
    const company = await one('SELECT * FROM companies WHERE id = $1', [user.company_id])
    return {
      account: publicAccount(user, company),
      ...(await sessionFrom(user.id, user.company_id, user.role, event)),
    }
  },

  async requestSetup(payload) {
    const email = String(payload.email || '').trim()
    const role = requestedRole(payload.role)
    if (!EMAIL_RE.test(email)) throw new ApiError('Enter a valid email address.')
    const user = await findUserByEmail(email)
    if (!user || user.status !== 'active') {
      // Same response whether or not the account exists.
      return { sent: true }
    }
    if (role && user.role !== role) {
      // Do not reveal whether the address exists under another role.
      return { sent: true }
    }
    const purpose = user.must_setup ? 'setup' : 'reset'
    const code = await issueCode(user.id, purpose)
    const recipient = await adminRecipient(user)
    const send = purpose === 'reset' ? mail.resetCode : mail.setupCode
    const sent = await send({
      to: recipient.email,
      name: recipient.name,
      code,
      account: user.email,
      accountName: user.full_name,
    })
    if (!sent) {
      console.log(`[auth] ${purpose} code for ${user.email} (admin ${recipient.email}): ${code}`)
      throw new ApiError(
        'We could not send the email right now. Check the mail settings and try again.',
        502,
      )
    }
    return { sent: true }
  },

  async completeSetup(payload, event) {
    const email = String(payload.email || '').trim()
    const code = String(payload.code || '').trim()
    const password = String(payload.password || '')
    const confirm = String(payload.confirmPassword || '')
    if (!EMAIL_RE.test(email)) throw new ApiError('Enter a valid email address.')
    if (!code) throw new ApiError('Enter the code we emailed you.')
    if (password.length < 8) throw new ApiError('Choose a password of at least 8 characters.')
    if (password !== confirm) throw new ApiError('The two passwords do not match.')

    const user = await findUserByEmail(email)
    if (!user) throw new ApiError('We could not verify that account.', 400)
    await consumeCode(user.id, code)
    await query(
      `UPDATE users
       SET password_hash = $2, must_setup = false, status = 'active', last_login_at = now(), updated_at = now()
       WHERE id = $1`,
      [user.id, hashPassword(password)],
    )
    const updated = await one('SELECT * FROM users WHERE id = $1', [user.id])
    const company = await one('SELECT * FROM companies WHERE id = $1', [user.company_id])
    return {
      account: publicAccount(updated, company),
      ...(await sessionFrom(user.id, user.company_id, user.role, event)),
    }
  },

  async requestPasswordReset(payload) {
    return ACTIONS.requestSetup(payload)
  },

  async completePasswordReset(payload, event) {
    return ACTIONS.completeSetup(payload, event)
  },

  async changePassword(payload, event) {
    const session = await currentSession(parseCookies(event)[SESSION_COOKIE])
    if (!session) throw new ApiError('Sign in to continue.', 401)
    const current = String(payload.currentPassword || '')
    const password = String(payload.password || '')
    const confirm = String(payload.confirmPassword || '')
    if (!verifyPassword(current, session.user.password_hash)) {
      throw new ApiError('Your current password is not correct.', 400)
    }
    if (password.length < 8) throw new ApiError('Choose a password of at least 8 characters.')
    if (password !== confirm) throw new ApiError('The two passwords do not match.')
    await query(
      'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
      [session.userId, hashPassword(password)],
    )
    return { changed: true }
  },

  async signOut() {
    return {}
  },
}

export default async function handler(event) {
  if (event.httpMethod !== 'POST') return fail('Method not allowed.', 405)

  let payload
  try {
    payload = readBody(event)
  } catch (cause) {
    return fail(cause.message, cause.statusCode || 400)
  }

  const action = typeof payload.action === 'string' ? payload.action : ''
  const run = ACTIONS[action]
  if (!run) return fail('Unknown action.', 404)

  try {
    const result = await run(payload, event)
    const { cookie, ...body } = result
    const headers = {}
    if (cookie) headers['set-cookie'] = cookie
    if (action === 'signOut') headers['set-cookie'] = clearSessionCookie(event)
    return json({ ...body, signedIn: Boolean(body.account) }, 200, headers)
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.statusCode)
    console.error('[api/auth]', error)
    return fail('The request could not be completed.', 500)
  }
}
