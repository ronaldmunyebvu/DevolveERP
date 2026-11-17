import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, KeyRound, LogOut, Pencil, ShieldCheck, UserCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useRepository } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
} from '@/components/ui'
import { initialsOf, titleCase } from '@/lib/utils'

function ChangePasswordCard() {
  const { changePassword } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ currentPassword: '', password: '', confirmPassword: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setError('')
    setDone(false)
    if (form.password.length < 8) {
      setError('The new password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('The new passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await changePassword(form)
      setForm({ currentPassword: '', password: '', confirmPassword: '' })
      setDone(true)
      toast.success('Password changed.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Password" description="Use at least 8 characters. You will stay signed in." icon={KeyRound} />
      <form onSubmit={submit} className="space-y-3 p-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {done && <Alert tone="success">Your password was updated.</Alert>}
        <Field label="Current password" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={set('currentPassword')}
            required
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm new password" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              minLength={8}
              required
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ProfileEditModal({ open, onClose }) {
  const repo = useRepository()
  const toast = useToast()
  const { user, refresh } = useAuth()
  const [form, setForm] = useState({ full_name: user?.full_name || '', email: user?.email || '', phone: user?.phone || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await repo.users.update({
        id: user.id,
        ...form,
        role: user.role,
        status: user.status,
      })
      await refresh()
      toast.success('Profile updated.')
      onClose()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      description="Your name and contact details."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save changes
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Full name" required>
          <Input value={form.full_name} onChange={set('full_name')} required />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={set('phone')} placeholder="+263..." />
        </Field>
      </form>
    </Modal>
  )
}

export default function AccountPage() {
  const { user, company, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const address = [company?.address, company?.city, company?.country].filter(Boolean).join(', ')

  return (
    <div>
      <PageHeader
        title="My account"
        description="Your profile, password and company details."
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil size={15} />
                Edit profile
              </Button>
            )}
            <Button variant="secondary" className="text-red-600" onClick={handleSignOut}>
              <LogOut size={15} />
              Sign out
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Profile" description="The account you are signed in with." icon={UserCircle} />
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-50 text-xl font-semibold text-brand-700">
              {initialsOf(user?.full_name || '')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-ink-900">{user?.full_name}</p>
              <p className="text-sm text-ink-500">{user?.email}</p>
              <p className="text-sm text-ink-500">{user?.phone || 'No phone number'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={isAdmin ? 'brand' : 'neutral'}>
                  <ShieldCheck size={12} />
                  {titleCase(user?.role || 'member')}
                </Badge>
                <Badge tone={user?.status === 'active' ? 'success' : 'neutral'}>{titleCase(user?.status || 'active')}</Badge>
                {user?.must_setup && <Badge tone="warning">Setup pending</Badge>}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Company" description="Signed-in business account." icon={Building2} />
          <div className="space-y-2 p-4 text-sm">
            <p className="font-semibold text-ink-900">{company?.name || '—'}</p>
            {company?.legal_name && <p className="text-ink-500">{company.legal_name}</p>}
            <p className="text-ink-600">{address || 'No address on file'}</p>
            <p className="text-ink-600">{company?.phone || 'No phone'}</p>
            <p className="text-ink-600">{company?.email || 'No email'}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge tone="info">{company?.currency || 'USD'}</Badge>
              {Number(company?.tax_rate) > 0 && <Badge tone="neutral">Tax {company.tax_rate}%</Badge>}
            </div>
            {company?.tax_number && <p className="text-xs text-ink-500">Tax number: {company.tax_number}</p>}
            {isAdmin && (
              <ButtonLink to="/app/settings" variant="secondary" size="sm" className="mt-2">
                Company settings
              </ButtonLink>
            )}
          </div>
        </Card>

        <div className="lg:col-span-2">
          <ChangePasswordCard />
        </div>

        <Card>
          <CardHeader title="At a glance" />
          <div className="space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Role</span>
              <span className="font-medium text-ink-800">{titleCase(user?.role || 'member')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Status</span>
              <span className="font-medium text-ink-800">{titleCase(user?.status || 'active')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Currency</span>
              <span className="font-medium text-ink-800">{company?.currency || 'USD'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Default tax</span>
              <span className="font-medium text-ink-800">{Number(company?.tax_rate) || 0}%</span>
            </div>
          </div>
        </Card>
      </div>

      {isAdmin && <ProfileEditModal open={editOpen} onClose={() => setEditOpen(false)} />}
    </div>
  )
}
