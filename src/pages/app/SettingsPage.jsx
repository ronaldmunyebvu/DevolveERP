import { useEffect, useState } from 'react'
import {
  Building2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Tags,
  Trash2,
  Users,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useAsyncData, useRepository } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  TableWrapper,
  Tabs,
  Textarea,
} from '@/components/ui'
import { formatDate, titleCase } from '@/lib/utils'
import { MODULES } from '@/lib/permissions'

const CURRENCIES = [
  'USD',
  'ZAR',
  'ZWL',
  'GBP',
  'EUR',
  'KES',
  'NGN',
  'GHS',
  'ZMW',
  'TZS',
  'UGX',
  'BWP',
  'MWK',
  'AUD',
  'CAD',
]

const LOCATION_TYPES = ['shop', 'warehouse', 'store', 'office']

const EMPTY_COMPANY = {
  name: '',
  legal_name: '',
  email: '',
  phone: '',
  phone_alt: '',
  address: '',
  city: '',
  country: '',
  website: '',
  tax_number: '',
  currency: 'USD',
  tax_rate: 15.5,
  logo_url: '/logo2.jpg',
  quotation_terms: '',
  invoice_terms: '',
}

function CompanyTab() {
  const repo = useRepository()
  const toast = useToast()
  const { company, setCompany } = useAuth()
  const [form, setForm] = useState(EMPTY_COMPANY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!company) return
    setForm({ ...EMPTY_COMPANY, ...company })
    setLoaded(true)
  }, [company])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Company name is required.')
      return
    }
    setBusy(true)
    try {
      const updated = await repo.company.update(form)
      setCompany(updated)
      toast.success('Company settings saved.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <Spinner />

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <CardHeader
          title="Company identity"
          description="Appears on invoices, quotations and PDF documents."
          icon={Building2}
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Trading name" required>
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Legal name">
            <Input value={form.legal_name} onChange={set('legal_name')} placeholder="Registered company name" />
          </Field>
          <Field label="Tax / VAT number">
            <Input value={form.tax_number} onChange={set('tax_number')} placeholder="VAT number" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="accounts@company.com" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="+263..." />
          </Field>
          <Field label="Alt phone">
            <Input value={form.phone_alt} onChange={set('phone_alt')} placeholder="+263..." />
          </Field>
          <Field label="Website">
            <Input value={form.website} onChange={set('website')} placeholder="https://..." />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set('city')} placeholder="Harare" />
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={set('country')} placeholder="Zimbabwe" />
          </Field>
          <Field label="Address" className="sm:col-span-2 lg:col-span-3">
            <Input value={form.address} onChange={set('address')} placeholder="Street address" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Billing & documents" description="Currency, tax defaults and the terms printed on documents." icon={Save} />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Currency">
            <Select value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default tax rate (%)">
            <Input type="number" min="0" step="0.01" value={form.tax_rate ?? ''} onChange={set('tax_rate')} placeholder="0" />
          </Field>
          <Field label="Logo URL" hint="Used on the PDF documents. Defaults to /logo2.jpg.">
            <Input value={form.logo_url} onChange={set('logo_url')} placeholder="/logo2.jpg" />
          </Field>
          <Field label="Quotation terms" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              value={form.quotation_terms || ''}
              onChange={set('quotation_terms')}
              placeholder="Validity, lead times, payment terms..."
            />
          </Field>
          <Field label="Invoice terms" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              value={form.invoice_terms || ''}
              onChange={set('invoice_terms')}
              placeholder="Payment terms, banking details, thanks..."
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          <Save size={16} />
          Save settings
        </Button>
      </div>
    </form>
  )
}

function StaffTab() {
  const repo = useRepository()
  const toast = useToast()
  const { user } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [sending, setSending] = useState(null)
  const users = useAsyncData(() => (repo ? repo.users.list() : null), [repo], { enabled: Boolean(repo) })

  const list = users.data || []

  async function sendCode(member) {
    setSending(member.id)
    try {
      const result = await repo.users.sendSetupCode(member.id)
      toast.success(result?.sent ? `Setup code for ${member.email} emailed to ${result.email}.` : 'Mail is not configured; the setup code was written to the server log.')
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setSending(null)
    }
  }

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await repo.users.remove({ id: deleting.id })
      toast.success('Staff member removed.')
      setDeleting(null)
      users.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Staff accounts"
          description="Staff can trade; only administrators can change settings and staff."
          icon={Users}
          actions={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus size={15} />
              Add staff
            </Button>
          }
        />
        {users.error ? (
          <div className="p-6">
            <Alert tone="danger">{users.error}</Alert>
          </div>
        ) : users.loading && !users.data ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState icon={Users} title="No staff yet" message="Add a staff member and they will receive a setup code by email." />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((member) => (
                <tr key={member.id}>
                  <td>
                    <p className="font-medium text-ink-800">{member.full_name}</p>
                    {member.id === user?.id && <p className="text-[11px] text-ink-500">You</p>}
                  </td>
                  <td>{member.email}</td>
                  <td>{member.phone || '—'}</td>
                  <td>
                    <Badge tone={member.role === 'admin' ? 'brand' : 'neutral'} size="sm">
                      {titleCase(member.role)}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={member.status === 'active' ? 'success' : 'neutral'} size="sm">
                      {member.must_setup ? 'Setup pending' : titleCase(member.status)}
                    </Badge>
                  </td>
                  <td>{member.last_login_at ? formatDate(member.last_login_at) : '—'}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Send setup code"
                        onClick={() => sendCode(member)}
                        loading={sending === member.id}
                      >
                        <Send size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => {
                          setEditing(member)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil size={15} />
                      </Button>
                      {member.id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:bg-red-50"
                          title="Remove"
                          onClick={() => setDeleting(member)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <StaffFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        editing={editing}
        repo={repo}
        onSaved={() => users.reload()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Remove this staff member?"
        message={`${deleting?.full_name || 'This user'} will lose access immediately. You cannot remove the last active administrator.`}
        confirmLabel="Remove staff"
      />
    </>
  )
}

function StaffFormModal({ open, onClose, editing, repo, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'member',
    status: 'active',
    permissions: [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? {
            full_name: editing.full_name || '',
            email: editing.email || '',
            phone: editing.phone || '',
            role: editing.role || 'member',
            status: editing.status || 'active',
            permissions: Array.isArray(editing.permissions) ? editing.permissions : [],
          }
        : {
            full_name: '',
            email: '',
            phone: '',
            role: 'member',
            status: 'active',
            permissions: [],
          },
    )
    setError('')
  }, [open, editing])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const togglePermission = (key) =>
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((entry) => entry !== key)
        : [...current.permissions, key],
    }))

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Name and email are required.')
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await repo.users.update({ id: editing.id, ...form })
        toast.success('Staff member updated.')
      } else {
        await repo.users.create(form)
        toast.success('Staff member added. A setup code was emailed to the administrator.')
      }
      onSaved()
      onClose()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit staff member' : 'Add staff member'}
      description={editing ? 'Update access and contact details.' : 'They will receive a one-time setup code by email.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save changes' : 'Add staff'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required>
            <Input value={form.full_name} onChange={set('full_name')} placeholder="Staff member name" required />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" required />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="+263..." />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={set('role')}>
              <option value="member">Member · selected modules</option>
              <option value="admin">Administrator · full access</option>
            </Select>
          </Field>
          {editing && (
            <Field label="Status">
              <Select value={form.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          )}
        </div>

        {form.role === 'member' && (
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-800">Modules this member can see</p>
                <p className="text-xs text-ink-500">Tick the pages that belong to this member. Dashboard is always included.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setForm((current) => ({ ...current, permissions: MODULES.map((module) => module.key) }))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm((current) => ({ ...current, permissions: [] }))}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULES.map((module) => (
                <Checkbox
                  key={module.key}
                  label={module.label}
                  description={module.description}
                  checked={form.permissions.includes(module.key)}
                  onChange={() => togglePermission(module.key)}
                />
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}

function CategoriesTab() {
  const repo = useRepository()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const categories = useAsyncData(() => (repo ? repo.categories.list() : null), [repo], { enabled: Boolean(repo) })
  const list = categories.data || []

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await repo.categories.remove({ id: deleting.id })
      toast.success('Category deleted.')
      setDeleting(null)
      categories.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Product categories"
          description="Group inventory for reporting and faster product entry."
          icon={Tags}
          actions={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus size={15} />
              Add category
            </Button>
          }
        />
        {categories.error ? (
          <div className="p-6">
            <Alert tone="danger">{categories.error}</Alert>
          </div>
        ) : categories.loading && !categories.data ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState icon={Tags} title="No categories yet" message="Create categories like Brakes, Filters, Engine or Electrical." />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th className="text-right">Products</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((category) => (
                <tr key={category.id}>
                  <td className="font-medium text-ink-800">{category.name}</td>
                  <td className="text-ink-600">{category.description || '—'}</td>
                  <td className="text-right tabular-nums">{category.product_count}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => {
                          setEditing(category)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:bg-red-50"
                        title="Delete"
                        onClick={() => setDeleting(category)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <CategoryFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        editing={editing}
        repo={repo}
        onSaved={() => categories.reload()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete this category?"
        message={`${deleting?.name || 'This category'} can only be deleted when no products use it.`}
        confirmLabel="Delete category"
      />
    </>
  )
}

function CategoryFormModal({ open, onClose, editing, repo, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({ name: editing?.name || '', description: editing?.description || '' })
    setError('')
  }, [open, editing])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Enter a category name.')
      return
    }
    setBusy(true)
    try {
      if (editing) await repo.categories.update({ id: editing.id, ...form })
      else await repo.categories.create(form)
      toast.success(`Category ${editing ? 'updated' : 'created'}.`)
      onSaved()
      onClose()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit category' : 'Add category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save changes' : 'Add category'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Name" required>
          <Input value={form.name} onChange={set('name')} placeholder="Brakes" required />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={set('description')} placeholder="Optional description" />
        </Field>
      </form>
    </Modal>
  )
}

function LocationsTab() {
  const repo = useRepository()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const locations = useAsyncData(() => (repo ? repo.locations.list() : null), [repo], { enabled: Boolean(repo) })
  const list = locations.data || []

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await repo.locations.remove({ id: deleting.id })
      toast.success('Location deleted.')
      setDeleting(null)
      locations.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Stock locations"
          description="Shops, warehouses and stores that hold inventory."
          icon={MapPin}
          actions={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus size={15} />
              Add location
            </Button>
          }
        />
        {locations.error ? (
          <div className="p-6">
            <Alert tone="danger">{locations.error}</Alert>
          </div>
        ) : locations.loading && !locations.data ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState icon={MapPin} title="No locations yet" message="Add at least one shop or warehouse to hold stock." />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>Address</th>
                <th className="text-right">Products</th>
                <th>Default</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((location) => (
                <tr key={location.id}>
                  <td className="font-medium text-ink-800">{location.name}</td>
                  <td>{titleCase(location.type || '')}</td>
                  <td className="text-ink-600">{location.address || '—'}</td>
                  <td className="text-right tabular-nums">{location.product_count}</td>
                  <td>{location.is_default ? <Badge tone="brand" size="sm">Default</Badge> : '—'}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => {
                          setEditing(location)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:bg-red-50"
                        title="Delete"
                        onClick={() => setDeleting(location)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <LocationFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        editing={editing}
        repo={repo}
        onSaved={() => locations.reload()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete this location?"
        message={`${deleting?.name || 'This location'} can only be deleted when it holds no stock and is not linked to transactions.`}
        confirmLabel="Delete location"
      />
    </>
  )
}

function LocationFormModal({ open, onClose, editing, repo, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', type: 'shop', address: '', is_default: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: editing?.name || '',
      type: editing?.type || 'shop',
      address: editing?.address || '',
      is_default: Boolean(editing?.is_default),
    })
    setError('')
  }, [open, editing])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Enter a location name.')
      return
    }
    setBusy(true)
    try {
      if (editing) await repo.locations.update({ id: editing.id, ...form })
      else await repo.locations.create(form)
      toast.success(`Location ${editing ? 'updated' : 'created'}.`)
      onSaved()
      onClose()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit location' : 'Add location'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save changes' : 'Add location'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={set('name')} placeholder="Main shop" required />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={set('type')}>
              {LOCATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={set('address')} placeholder="Street address" />
          </Field>
        </div>
        <Checkbox
          label="Default location"
          description="New products and transactions will default to this location."
          checked={form.is_default}
          onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))}
        />
      </form>
    </Modal>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('company')
  const { isAdmin } = useAuth()

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Settings" description="Administrator access is required." />
        <Alert tone="danger">Only administrators can open settings.</Alert>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company details, staff access, categories and stock locations."
        actions={
          <Badge tone="neutral">
            <RefreshCw size={12} />
            Changes apply immediately
          </Badge>
        }
      />
      <Tabs
        tabs={[
          { value: 'company', label: 'Company', icon: Building2 },
          { value: 'staff', label: 'Staff', icon: Users },
          { value: 'categories', label: 'Categories', icon: Tags },
          { value: 'locations', label: 'Locations', icon: MapPin },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />
      {tab === 'company' ? <CompanyTab /> : null}
      {tab === 'staff' ? <StaffTab /> : null}
      {tab === 'categories' ? <CategoriesTab /> : null}
      {tab === 'locations' ? <LocationsTab /> : null}
    </div>
  )
}
