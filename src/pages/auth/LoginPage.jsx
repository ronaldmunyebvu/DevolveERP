import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, MailCheck, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Alert, Button, Field, Input, Tabs } from '@/components/ui'
import { AuthShell } from './AuthShell'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function LoginPage() {
  const { signIn, requestSetup, completeSetup } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [role, setRole] = useState('admin')
  const [step, setStep] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const destination = location.state?.from || '/app'

  function chooseRole(next) {
    setRole(next)
    setStep('login')
    setPassword('')
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setNotice('')
  }

  function validEmail() {
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.')
      return false
    }
    return true
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!validEmail()) return
    if (!password) {
      setError('Enter your password.')
      return
    }
    setBusy(true)
    try {
      await signIn({ email: email.trim(), password, role })
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  async function sendCode(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!validEmail()) return
    setBusy(true)
    try {
      await requestSetup(email.trim(), 'member')
      setStep('verify')
      setNotice(
        `If ${email.trim()} is an active team account, a 6-digit code was emailed to your administrator. Ask them for the code.`,
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
    if (newPassword.length < 8) {
      setError('Choose a password of at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await completeSetup({
        email: email.trim(),
        code: code.trim(),
        password: newPassword,
        confirmPassword,
      })
      navigate(destination, { replace: true })
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
      await requestSetup(email.trim(), 'member')
      setNotice('A new code was sent to your administrator. The previous one no longer works.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const subtitle =
    step === 'verify'
      ? 'Enter the code your administrator received and choose your password.'
      : role === 'admin'
        ? 'Sign in with the administrator email and password.'
        : 'Use the email your administrator added and the password you set with their code.'

  return (
    <AuthShell
      title="Sign in"
      subtitle={subtitle}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            First time here?{' '}
            <Link to="/setup" className="font-medium text-brand-700 hover:text-brand-800">
              Set up your account
            </Link>
          </span>
          <Link to="/forgot-password" className="font-medium text-ink-500 hover:text-ink-700">
            Forgot password?
          </Link>
        </div>
      }
    >
      {step === 'login' && (
        <Tabs
          className="mb-5"
          value={role}
          onChange={chooseRole}
          tabs={[
            { value: 'admin', label: 'Administrator', icon: ShieldCheck },
            { value: 'member', label: 'Member', icon: UserRound },
          ]}
        />
      )}

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

      {step === 'verify' ? (
        <form onSubmit={verify} className="space-y-4">
          <Field label="6-digit code" required hint="Ask your administrator for the code we emailed them.">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="text-center text-lg font-semibold tracking-[0.5em]"
              required
              autoFocus
            />
          </Field>
          <Field label="New password" required hint="At least 8 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
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
            <KeyRound size={16} />
            Set password and sign in
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('login')
                setCode('')
                setNewPassword('')
                setConfirmPassword('')
                setError('')
                setNotice('')
              }}
              className="inline-flex items-center gap-1 font-medium text-ink-500 hover:text-ink-700"
            >
              <ArrowLeft size={14} />
              Back
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
      ) : (
        <div className="space-y-4">
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Email address"
              required
              hint={
                role === 'member'
                  ? 'Use the exact email your administrator added for your staff account.'
                  : undefined
              }
            >
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={role === 'admin' ? 'admin@business.com' : 'you@business.com'}
                required
                autoFocus
              />
            </Field>
            <Field label="Password" required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={role === 'member' ? 'Password set with your admin code' : 'Your password'}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Button type="submit" loading={busy} className="w-full" size="lg">
              <LogIn size={16} />
              Sign in as {role === 'admin' ? 'administrator' : 'member'}
            </Button>
          </form>

          {role === 'member' && (
            <div className="border-t border-ink-200 pt-4">
              <p className="mb-2 text-sm text-ink-500">
                First time here? We will email a setup code to your administrator.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={sendCode}
                disabled={busy}
              >
                <MailCheck size={16} />
                Email setup code to administrator
              </Button>
              <Link
                to="/forgot-password"
                className="mt-3 block text-center text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                Forgot password? Send a reset code to your administrator
              </Link>
            </div>
          )}
        </div>
      )}
    </AuthShell>
  )
}
