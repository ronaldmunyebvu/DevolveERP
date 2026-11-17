import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, MailCheck, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Alert, Button, Field, Input } from '@/components/ui'
import { AuthShell } from './AuthShell'

export function SetupFlow({ mode = 'setup' }) {
  const isReset = mode === 'reset'
  const { requestSetup, completeSetup, requestPasswordReset, completePasswordReset } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const request = isReset ? requestPasswordReset : requestSetup
  const complete = isReset ? completePasswordReset : completeSetup

  async function sendCode(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    try {
      await request(email.trim())
      setStep('verify')
      setNotice(
        `If ${email.trim()} belongs to an account, the 6-digit code was emailed to your administrator.`,
      )
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(event) {
    event.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code.trim())) {
      setError('The code is six digits.')
      return
    }
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await complete({ email: email.trim(), code: code.trim(), password, confirmPassword })
      navigate('/app', { replace: true })
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    setError('')
    try {
      await request(email.trim())
      setNotice('A new code was sent to your administrator. The previous one no longer works.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={isReset ? 'Reset your password' : 'Set up your account'}
      subtitle={
        step === 'email'
          ? isReset
            ? 'Enter the email address on your Devolve account. We will send a 6-digit code to your administrator.'
            : 'Enter the email address your Devolve owner set up for you. We will send a 6-digit code to your administrator.'
          : 'Enter the code your administrator received and choose a password.'
      }
      footer={
        <span>
          <Link to="/login" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </span>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="info" className="mb-4" icon={MailCheck}>
          {notice}
        </Alert>
      )}

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Field label="Email address" required>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@business.com"
              required
            />
          </Field>
          <Button type="submit" loading={busy} className="w-full" size="lg">
            Email my code
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <Field label="6-digit code" required hint="The code expires after 10 minutes.">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="text-center text-lg font-semibold tracking-[0.5em]"
              required
            />
          </Field>
          <Field label="New password" required hint="At least 8 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Choose a strong password"
              required
            />
          </Field>
          <Field label="Confirm password" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Type it again"
              required
            />
          </Field>
          <Button type="submit" loading={busy} className="w-full" size="lg">
            <ShieldCheck size={16} />
            Verify and continue
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setCode('')
                setError('')
                setNotice('')
              }}
              className="font-medium text-ink-500 hover:text-ink-700"
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={busy}
              className="font-medium text-brand-700 hover:text-brand-800 disabled:opacity-60"
            >
              Send a new code
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
