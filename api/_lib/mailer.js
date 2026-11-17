/**
 * Outgoing mail (nodemailer over Gmail). Credentials stay in the server
 * environment and never reach the browser.
 */
import nodemailer from 'nodemailer'

export function appOrigin() {
  const explicit = process.env.APP_URL
  if (explicit) return String(explicit).trim().replace(/\/+$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:5173'
}

export function mailEnabled() {
  if (process.env.MAILER_DISABLE === 'true') return false
  return Boolean(process.env.MAIL_USER && process.env.MAIL_APP_PASSWORD)
}

let transport = null

function transporter() {
  if (!mailEnabled()) return null
  if (!transport) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_APP_PASSWORD },
    })
  }
  return transport
}

function layout({ preheader, heading, body, action, note, footer }) {
  const logo = `${appOrigin()}/logo.jpg`
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#151518;">
    <p style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:14px;border:1px solid #e5e5e8;overflow:hidden;">
          <tr><td style="background:#0b0b0d;padding:18px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;"><img src="${logo}" width="34" height="34" alt="Devolve" style="border-radius:8px;display:block;" /></td>
              <td>
                <span style="font-size:16px;font-weight:bold;color:#ffffff;display:block;line-height:1.2;">Devolve</span>
                <span style="font-size:11px;color:#d4d4d8;display:block;">Motor Spares ERP</span>
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="height:4px;background:#c1121f;"></td></tr>
          <tr><td style="padding:26px 24px 8px;">
            <h1 style="margin:0;font-size:21px;line-height:1.3;">${heading}</h1>
          </td></tr>
          <tr><td style="padding:0 24px;font-size:14px;line-height:1.65;color:#3f3f46;">${body}</td></tr>
          ${
            action
              ? `<tr><td align="center" style="padding:22px 24px 6px;">
                  <a href="${action.href}" style="display:inline-block;background:#c1121f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:8px;">${action.label}</a>
                </td></tr>`
              : ''
          }
          ${note ? `<tr><td style="padding:14px 24px 0;font-size:12px;line-height:1.6;color:#71717a;text-align:center;">${note}</td></tr>` : ''}
          <tr><td style="padding:22px 24px 26px;font-size:12px;line-height:1.6;color:#71717a;">${footer}</td></tr>
        </table>
        <p style="font-size:12px;color:#a1a1aa;margin-top:16px;text-align:center;">Devolve Motor Spares &middot; Sourcing, importation, distribution and selling of motor spares</p>
      </td></tr>
    </table>
  </body>
</html>`
}

function codeBlock(code) {
  return `<p style="margin:0;letter-spacing:7px;font-size:32px;font-weight:bold;color:#c1121f;">${code}</p>`
}

function memberLabel(account, accountName) {
  if (!account) return ''
  return accountName ? `${accountName} (${account})` : account
}

export async function sendSetupCodeMail({ to, name, code, account, accountName }) {
  const send = transporter()
  if (!send) return false
  const member = memberLabel(account, accountName)
  const forMember = Boolean(member) && String(account).toLowerCase() !== String(to).toLowerCase()
  const intro = forMember
    ? `${member} asked to set up their Devolve ERP account. Share this code with them:`
    : 'Use this code to set up your Devolve ERP account:'
  try {
    await send.sendMail({
      from: `"Devolve" <${process.env.MAIL_USER}>`,
      to,
      subject: forMember
        ? `Devolve setup code for ${account}: ${code}`
        : `Your Devolve account setup code: ${code}`,
      text: [
        `Hi ${name || 'there'},`,
        '',
        intro,
        '',
        `   ${code}`,
        '',
        'The code expires in 10 minutes and can only be used once.',
        'If you were not expecting this email you can safely ignore it.',
      ].join('\n'),
      html: layout({
        preheader: `${forMember ? `Devolve setup code for ${account}` : 'Your Devolve setup code'}: ${code}`,
        heading: forMember ? 'Devolve account setup code' : 'Set up your Devolve account',
        body: `<p style="margin:0 0 14px;">Hi ${name || 'there'},</p>
               <p style="margin:0 0 10px;">${intro}</p>
               ${codeBlock(code)}`,
        note: 'The code expires in 10 minutes and can only be used once.',
        footer: 'If you were not expecting this account you can safely ignore this message.',
      }),
    })
    return true
  } catch (error) {
    console.error('[mail] setup code failed', error?.message)
    return false
  }
}

export async function sendResetCodeMail({ to, name, code, account, accountName }) {
  const send = transporter()
  if (!send) return false
  const member = memberLabel(account, accountName)
  const forMember = Boolean(member) && String(account).toLowerCase() !== String(to).toLowerCase()
  const intro = forMember
    ? `${member} asked to reset their Devolve ERP password. Share this code with them:`
    : 'Use this code to reset your Devolve ERP password:'
  try {
    await send.sendMail({
      from: `"Devolve" <${process.env.MAIL_USER}>`,
      to,
      subject: forMember
        ? `Devolve password reset code for ${account}: ${code}`
        : `Your Devolve password reset code: ${code}`,
      text: [
        `Hi ${name || 'there'},`,
        '',
        intro,
        '',
        `   ${code}`,
        '',
        'The code expires in 10 minutes and can only be used once.',
      ].join('\n'),
      html: layout({
        preheader: `${forMember ? `Devolve reset code for ${account}` : 'Your Devolve reset code'}: ${code}`,
        heading: forMember ? 'Password reset code' : 'Reset your password',
        body: `<p style="margin:0 0 14px;">Hi ${name || 'there'},</p>
               <p style="margin:0 0 10px;">${intro}</p>
               ${codeBlock(code)}`,
        note: 'The code expires in 10 minutes and can only be used once.',
        footer: 'If you did not ask for this code you can safely ignore this message.',
      }),
    })
    return true
  } catch (error) {
    console.error('[mail] reset code failed', error?.message)
    return false
  }
}

export async function sendDocumentMail({
  to,
  customerName,
  company,
  type,
  number,
  message,
  pdfBase64,
  filename,
}) {
  const send = transporter()
  if (!send) return false
  const label = type === 'invoice' ? 'Invoice' : 'Quotation'
  try {
    await send.sendMail({
      from: `"${company?.name || 'Devolve'}" <${process.env.MAIL_USER}>`,
      to,
      replyTo: company?.email || process.env.MAIL_USER,
      subject: `${label} ${number} from ${company?.name || 'Devolve'}`,
      text: [
        `Dear ${customerName || 'customer'},`,
        '',
        message || `Please find attached ${label.toLowerCase()} ${number}.`,
        '',
        'Kind regards,',
        company?.name || 'Devolve',
        company?.phone ? `Tel: ${company.phone}` : '',
        company?.email ? `Email: ${company.email}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      html: layout({
        preheader: `${label} ${number} from ${company?.name || 'Devolve'}`,
        heading: `${label} ${number}`,
        body: `<p style="margin:0 0 12px;">Dear ${customerName || 'customer'},</p>
               <p style="margin:0 0 12px;">${(message || `Please find your ${label.toLowerCase()} attached as a PDF.`).replace(/\n/g, '<br />')}</p>
               <p style="margin:0;">Kind regards,<br /><strong>${company?.name || 'Devolve'}</strong>${
                 company?.phone ? `<br />Tel: ${company.phone}` : ''
               }${company?.email ? `<br />Email: ${company.email}` : ''}</p>`,
        action: null,
        note: null,
        footer: 'This message was sent from Devolve ERP.',
      }),
      attachments: pdfBase64
        ? [{ filename: filename || `${number}.pdf`, content: Buffer.from(pdfBase64, 'base64') }]
        : [],
    })
    return true
  } catch (error) {
    console.error('[mail] document email failed', error?.message)
    return false
  }
}

export const mail = {
  enabled: mailEnabled,
  setupCode: sendSetupCodeMail,
  resetCode: sendResetCodeMail,
  document: sendDocumentMail,
}
