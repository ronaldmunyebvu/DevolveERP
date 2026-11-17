import { useState } from 'react'
import { Download, Mail, Printer, Send } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { Button, Field, Input, Modal, Textarea } from '@/components/ui'
import { downloadDocumentPdf, emailDocument, printDocument } from '@/lib/documents'

export function DocumentActions({ payload, defaultEmail = '', size = 'md' }) {
  const toast = useToast()
  const [emailOpen, setEmailOpen] = useState(false)
  const [to, setTo] = useState(defaultEmail)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!payload) return null

  async function download() {
    try {
      await downloadDocumentPdf(payload)
      toast.success('PDF downloaded.')
    } catch (cause) {
      toast.error(cause.message)
    }
  }

  function print() {
    try {
      printDocument(payload)
    } catch (cause) {
      toast.error(cause.message)
    }
  }

  function openEmail() {
    setTo(defaultEmail || '')
    setMessage('')
    setError('')
    setEmailOpen(true)
  }

  async function sendEmail(event) {
    event.preventDefault()
    setError('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    try {
      await emailDocument(payload, to.trim(), message.trim())
      toast.success(`Email sent to ${to.trim()}.`)
      setEmailOpen(false)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size={size} onClick={print}>
          <Printer size={15} />
          Print
        </Button>
        <Button variant="secondary" size={size} onClick={download}>
          <Download size={15} />
          PDF
        </Button>
        <Button variant="secondary" size={size} onClick={openEmail}>
          <Mail size={15} />
          Email
        </Button>
      </div>

      <Modal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title={`Email ${payload.type}`}
        description={`${payload.number} will be attached as a PDF.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmailOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={sendEmail} loading={busy}>
              <Send size={15} />
              Send email
            </Button>
          </>
        }
      >
        <form onSubmit={sendEmail} className="space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <Field label="Send to" required>
            <Input type="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="customer@email.com" />
          </Field>
          <Field label="Message" hint="Optional note added to the email body.">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={`Hi ${payload.customer?.name || 'there'}, please find ${payload.number} attached.`}
            />
          </Field>
        </form>
      </Modal>
    </>
  )
}
