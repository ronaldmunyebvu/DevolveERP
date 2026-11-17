import { one } from './db.js'
import { currentSession } from './auth.js'
import { mail } from './mailer.js'
import { SESSION_COOKIE, fail, json, parseCookies, readBody } from './http.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_ATTACHMENT = 8 * 1024 * 1024

export default async function handler(event) {
  if (event.httpMethod !== 'POST') return fail('Method not allowed.', 405)

  let body
  try {
    body = readBody(event)
  } catch (cause) {
    return fail(cause.message, cause.statusCode || 400)
  }
  if (body.action !== 'sendDocument') return fail('Unknown action.', 404)

  try {
    const session = await currentSession(parseCookies(event)[SESSION_COOKIE])
    if (!session) return fail('Sign in to continue.', 401)

    const to = String(body.to || '').trim()
    if (!EMAIL_RE.test(to)) return fail('Enter a valid customer email address.')
    const type = body.type === 'invoice' ? 'invoice' : 'quotation'
    const number = String(body.number || '').trim()
    if (!number) return fail('The document number is missing.')

    const pdfBase64 = String(body.pdfBase64 || '')
    if (pdfBase64.length > MAX_ATTACHMENT) return fail('The PDF is too large to email.', 413)

    const company = await one('SELECT * FROM companies WHERE id = $1', [session.companyId])
    const sent = await mail.document({
      to,
      customerName: String(body.customerName || ''),
      company,
      type,
      number,
      message: String(body.message || ''),
      pdfBase64,
      filename: `${number.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`,
    })
    if (!sent) {
      return fail(
        'The email could not be sent. Check the MAIL_USER / MAIL_APP_PASSWORD settings.',
        502,
      )
    }
    return json({ sent: true })
  } catch (error) {
    console.error('[api/mail]', error)
    return fail('The email could not be sent.', 500)
  }
}
