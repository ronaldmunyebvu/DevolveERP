import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  Users,
  Wallet,
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
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  SearchInput,
  Select,
  Spinner,
  TableWrapper,
  Tabs,
  Textarea,
} from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import { StatusBadge } from '@/components/domain/StatusBadge'
import {
  CUSTOMER_TYPES,
  downloadCsv,
  formatDate,
  formatMoney,
  formatNumber,
  matchesSearch,
  titleCase,
} from '@/lib/utils'

const EMPTY_CUSTOMER = {
  name: '',
  company_name: '',
  email: '',
  phone: '',
  city: '',
  address: '',
  customer_type: 'retail',
  credit_limit: '',
  status: 'active',
  notes: '',
}

const EMPTY_SUPPLIER = {
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  city: '',
  country: '',
  address: '',
  status: 'active',
  notes: '',
}

function ContactFormModal({ open, onClose, kind, editing, repo, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(kind === 'customer' ? EMPTY_CUSTOMER : EMPTY_SUPPLIER)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isCustomer = kind === 'customer'

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? { ...(isCustomer ? EMPTY_CUSTOMER : EMPTY_SUPPLIER), ...editing }
        : isCustomer
          ? EMPTY_CUSTOMER
          : EMPTY_SUPPLIER,
    )
    setError('')
  }, [open, editing, isCustomer])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError(`${isCustomer ? 'Customer' : 'Supplier'} name is required.`)
      return
    }
    setBusy(true)
    try {
      const payload = isCustomer ? { ...form, credit_limit: Number(form.credit_limit) || 0 } : form
      const saved = editing
        ? await repo[isCustomer ? 'customers' : 'suppliers'].update({ id: editing.id, ...payload })
        : await repo[isCustomer ? 'customers' : 'suppliers'].create(payload)
      toast.success(`${isCustomer ? 'Customer' : 'Supplier'} ${editing ? 'updated' : 'created'}.`)
      onSaved(saved)
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
      title={`${editing ? 'Edit' : 'New'} ${isCustomer ? 'customer' : 'supplier'}`}
      description={
        isCustomer
          ? 'Customers are used on invoices and quotations.'
          : 'Suppliers are used on purchase orders.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save changes' : `Create ${isCustomer ? 'customer' : 'supplier'}`}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={isCustomer ? 'Customer name' : 'Supplier name'} required>
            <Input value={form.name} onChange={set('name')} placeholder={isCustomer ? 'John Moyo' : 'ABC Auto Parts'} />
          </Field>
          <Field label={isCustomer ? 'Company / trading as' : 'Contact person'}>
            {isCustomer ? (
              <Input value={form.company_name} onChange={set('company_name')} placeholder="Company name" />
            ) : (
              <Input value={form.contact_name} onChange={set('contact_name')} placeholder="Contact person" />
            )}
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="name@email.com" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="+263..." />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set('city')} placeholder="Harare" />
          </Field>
          {isCustomer ? (
            <>
              <Field label="Customer type">
                <Select value={form.customer_type} onChange={set('customer_type')}>
                  {CUSTOMER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {titleCase(type)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Credit limit" hint="0 means cash only.">
                <Input type="number" min="0" step="0.01" value={form.credit_limit} onChange={set('credit_limit')} placeholder="0.00" />
              </Field>
            </>
          ) : (
            <Field label="Country">
              <Input value={form.country} onChange={set('country')} placeholder="Zimbabwe" />
            </Field>
          )}
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <Field label="Address">
          <Input value={form.address} onChange={set('address')} placeholder="Street address" />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Payment terms, delivery preferences..." />
        </Field>
      </form>
    </Modal>
  )
}

function CustomerDetail({ open, onClose, customerId, repo, currency, onEdit, onChanged }) {
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const { data, loading, error } = useAsyncData(
    () => (repo && customerId ? repo.customers.statement(customerId) : null),
    [repo, customerId, open],
    { enabled: Boolean(open && repo && customerId) },
  )
  const customer = data?.customer
  const invoices = data?.invoices || []
  const balance = invoices.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0)
  const sales = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)

  async function remove() {
    setDeleteBusy(true)
    try {
      await repo.customers.remove({ id: customerId })
      toast.success('Customer deleted.')
      setConfirmDelete(false)
      onChanged()
      onClose()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={customer?.name || 'Customer'}
        description={customer?.company_name}
        size="lg"
        footer={
          customer ? (
            <>
              <Button variant="secondary" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} />
                Delete
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => onEdit(customer)}>
                <Pencil size={15} />
                Edit customer
              </Button>
            </>
          ) : null
        }
      >
        {loading ? (
          <Spinner />
        ) : error ? (
          <Alert tone="danger">{error}</Alert>
        ) : customer ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg bg-ink-50 p-3 text-sm sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Contact</p>
                <p className="font-medium text-ink-900">{customer.name}</p>
                {customer.company_name && <p className="text-ink-600">{customer.company_name}</p>}
                <p className="text-ink-600">{customer.phone || '—'}</p>
                <p className="text-ink-600">{customer.email || '—'}</p>
                <p className="text-ink-600">{[customer.address, customer.city].filter(Boolean).join(', ') || '—'}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Outstanding balance</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${balance > 0 ? 'text-brand-700' : 'text-emerald-700'}`}>
                  {formatMoney(balance, currency)}
                </p>
                <p className="text-xs text-ink-500">
                  {formatMoney(sales, currency)} sold across {invoices.length} invoices
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Credit limit: {formatMoney(customer.credit_limit || 0, currency)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={customer.status} />
              <Badge tone="info">{titleCase(customer.customer_type)}</Badge>
              {Number(customer.credit_limit) > 0 && balance > Number(customer.credit_limit) && (
                <Badge tone="danger">Over credit limit</Badge>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Invoice history</p>
              {invoices.length === 0 ? (
                <p className="rounded-lg border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-500">
                  No invoices for this customer yet.
                </p>
              ) : (
                <TableWrapper className="rounded-lg border border-ink-200">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Issued</th>
                      <th>Due</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="font-medium text-ink-800">{invoice.invoice_number}</td>
                        <td>{formatDate(invoice.issue_date)}</td>
                        <td>{invoice.due_date ? formatDate(invoice.due_date) : '—'}</td>
                        <td className="text-right tabular-nums">{formatMoney(invoice.total_amount, currency)}</td>
                        <td className="text-right tabular-nums">{formatMoney(invoice.balance, currency)}</td>
                        <td>
                          <StatusBadge status={invoice.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrapper>
              )}
            </div>

            {customer.notes && (
              <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
                <span className="font-medium text-ink-700">Notes: </span>
                {customer.notes}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete this customer?"
        message="Purchase history will remain but the customer will no longer appear on new invoices. Customers with invoices cannot be deleted."
        confirmLabel="Delete customer"
      />
    </>
  )
}

function SupplierDetail({ open, onClose, supplier, repo, currency, onEdit, onChanged }) {
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function remove() {
    setDeleteBusy(true)
    try {
      await repo.suppliers.remove({ id: supplier.id })
      toast.success('Supplier deleted.')
      setConfirmDelete(false)
      onChanged()
      onClose()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  if (!supplier) return null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={supplier.name}
        description={supplier.contact_name}
        footer={
          <>
            <Button variant="secondary" className="text-red-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
              Delete
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => onEdit(supplier)}>
              <Pencil size={15} />
              Edit supplier
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg bg-ink-50 p-3 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Contact</p>
              <p className="font-medium text-ink-900">{supplier.contact_name || supplier.name}</p>
              <p className="text-ink-600">{supplier.phone || '—'}</p>
              <p className="text-ink-600">{supplier.email || '—'}</p>
              <p className="text-ink-600">{[supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ') || '—'}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Purchased to date</p>
              <p className="mt-1 text-2xl font-semibold text-ink-900 tabular-nums">
                {formatMoney(supplier.purchased_total || 0, currency)}
              </p>
              <p className="text-xs text-ink-500">{supplier.order_count || 0} purchase orders</p>
            </div>
          </div>
          <StatusBadge status={supplier.status} />
          {supplier.notes && (
            <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
              <span className="font-medium text-ink-700">Notes: </span>
              {supplier.notes}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete this supplier?"
        message="Purchase history will remain but the supplier will no longer appear on new purchase orders."
        confirmLabel="Delete supplier"
      />
    </>
  )
}

export default function ContactsPage() {
  const repo = useRepository()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [tab, setTab] = useState('customers')
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewingCustomer, setViewingCustomer] = useState(null)
  const [viewingSupplier, setViewingSupplier] = useState(null)

  const customers = useAsyncData(() => (repo ? repo.customers.list() : null), [repo], { enabled: Boolean(repo) })
  const suppliers = useAsyncData(() => (repo ? repo.suppliers.list() : null), [repo], { enabled: Boolean(repo) })

  const customerList = customers.data || []
  const supplierList = suppliers.data || []
  const isCustomer = tab === 'customers'

  const visible = useMemo(() => {
    const list = isCustomer ? customerList : supplierList
    return list.filter((contact) => {
      if (filters.status && contact.status !== filters.status) return false
      return matchesSearch(
        [contact.name, contact.company_name, contact.contact_name, contact.email, contact.phone].join(' '),
        filters.search,
      )
    })
  }, [isCustomer, customerList, supplierList, filters])

  const customerStats = useMemo(() => {
    const active = customerList.filter((customer) => customer.status === 'active')
    const outstanding = customerList.reduce((sum, customer) => sum + Number(customer.balance || 0), 0)
    const overLimit = customerList.filter(
      (customer) => Number(customer.credit_limit) > 0 && Number(customer.balance) > Number(customer.credit_limit),
    ).length
    return { active: active.length, outstanding, overLimit, total: customerList.length }
  }, [customerList])

  const supplierStats = useMemo(() => {
    const active = supplierList.filter((supplier) => supplier.status === 'active')
    return {
      active: active.length,
      total: supplierList.length,
      purchased: supplierList.reduce((sum, supplier) => sum + Number(supplier.purchased_total || 0), 0),
      orders: supplierList.reduce((sum, supplier) => sum + Number(supplier.order_count || 0), 0),
    }
  }, [supplierList])

  function refresh() {
    customers.reload()
    suppliers.reload()
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(contact) {
    setEditing(contact)
    setViewingCustomer(null)
    setViewingSupplier(null)
    setFormOpen(true)
  }

  function exportCsv() {
    if (isCustomer) {
      downloadCsv(
        'customers',
        [
          { label: 'Name', value: (row) => row.name },
          { label: 'Company', value: (row) => row.company_name },
          { label: 'Type', value: (row) => row.customer_type },
          { label: 'Phone', value: (row) => row.phone },
          { label: 'Email', value: (row) => row.email },
          { label: 'City', value: (row) => row.city },
          { label: 'Credit limit', value: (row) => row.credit_limit },
          { label: 'Balance', value: (row) => row.balance },
          { label: 'Total sales', value: (row) => row.total_sales },
          { label: 'Status', value: (row) => row.status },
        ],
        visible,
      )
    } else {
      downloadCsv(
        'suppliers',
        [
          { label: 'Name', value: (row) => row.name },
          { label: 'Contact', value: (row) => row.contact_name },
          { label: 'Phone', value: (row) => row.phone },
          { label: 'Email', value: (row) => row.email },
          { label: 'City', value: (row) => row.city },
          { label: 'Country', value: (row) => row.country },
          { label: 'Orders', value: (row) => row.order_count },
          { label: 'Purchased', value: (row) => row.purchased_total },
          { label: 'Status', value: (row) => row.status },
        ],
        visible,
      )
    }
  }

  const activeData = isCustomer ? customers : suppliers

  return (
    <div>
      <PageHeader
        title="Customers & suppliers"
        description="Your trading contacts, credit limits, balances and account history."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} />
              New {isCustomer ? 'customer' : 'supplier'}
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(value) => {
            setTab(value)
            setFilters({ search: '', status: '' })
          }}
          tabs={[
            { value: 'customers', label: 'Customers', count: customerList.length },
            { value: 'suppliers', label: 'Suppliers', count: supplierList.length },
          ]}
        />
      </div>

      {isCustomer ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Customers" value={formatNumber(customerStats.total)} hint={`${customerStats.active} active`} icon={Users} />
          <StatCard label="Outstanding" value={formatMoney(customerStats.outstanding, currency)} hint="Across all customer accounts" icon={Wallet} tone="amber" />
          <StatCard
            label="Average account"
            value={formatMoney(customerStats.total ? customerStats.outstanding / customerStats.total : 0, currency)}
            hint="Average balance per customer"
            icon={Building2}
            tone="sky"
          />
          <StatCard
            label="Over credit limit"
            value={formatNumber(customerStats.overLimit)}
            hint="Accounts needing collection"
            icon={Wallet}
            tone={customerStats.overLimit ? 'red' : 'green'}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Suppliers" value={formatNumber(supplierStats.total)} hint={`${supplierStats.active} active`} icon={Truck} />
          <StatCard label="Purchased" value={formatMoney(supplierStats.purchased, currency)} hint="Received purchase orders" icon={Wallet} tone="green" />
          <StatCard label="Purchase orders" value={formatNumber(supplierStats.orders)} hint="All time" icon={Building2} tone="sky" />
          <StatCard
            label="Average order"
            value={formatMoney(supplierStats.orders ? supplierStats.purchased / supplierStats.orders : 0, currency)}
            hint="Per purchase order"
            icon={Truck}
            tone="amber"
          />
        </div>
      )}

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder={`Search ${isCustomer ? 'customers' : 'suppliers'}...`}
            className="w-full sm:w-80"
          />
          <Select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="w-full sm:w-44"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <span className="ml-auto text-xs text-ink-500">{visible.length} contacts</span>
        </div>

        {activeData.error ? (
          <div className="p-6">
            <Alert tone="danger">{activeData.error}</Alert>
          </div>
        ) : activeData.loading && !activeData.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={isCustomer ? Users : Truck}
            title={`No ${isCustomer ? 'customers' : 'suppliers'} match this view`}
            message={
              (isCustomer ? customerList : supplierList).length
                ? 'Try a different search or status.'
                : `Add your first ${isCustomer ? 'customer' : 'supplier'} to get started.`
            }
            action={
              <Button onClick={openCreate}>
                <Plus size={16} />
                New {isCustomer ? 'customer' : 'supplier'}
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            {isCustomer ? (
              <>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Type</th>
                    <th className="text-right">Invoices</th>
                    <th className="text-right">Sales</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setViewingCustomer(customer.id)}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {customer.name}
                        </button>
                        {customer.company_name && <p className="text-[11px] text-ink-500">{customer.company_name}</p>}
                      </td>
                      <td>
                        <p className="text-ink-700">{customer.phone || '—'}</p>
                        <p className="text-[11px] text-ink-500">{customer.email || '—'}</p>
                      </td>
                      <td>{titleCase(customer.customer_type)}</td>
                      <td className="text-right tabular-nums">{customer.invoice_count}</td>
                      <td className="text-right tabular-nums">{formatMoney(customer.total_sales, currency)}</td>
                      <td className={`text-right font-medium tabular-nums ${Number(customer.balance) > 0 ? 'text-brand-700' : 'text-ink-600'}`}>
                        {formatMoney(customer.balance, currency)}
                      </td>
                      <td>
                        <StatusBadge status={customer.status} />
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View" onClick={() => setViewingCustomer(customer.id)}>
                            <Eye size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(customer)}>
                            <Pencil size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Purchased</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setViewingSupplier(supplier)}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {supplier.name}
                        </button>
                        {supplier.contact_name && <p className="text-[11px] text-ink-500">{supplier.contact_name}</p>}
                      </td>
                      <td>
                        <p className="text-ink-700">{supplier.phone || '—'}</p>
                        <p className="text-[11px] text-ink-500">{supplier.email || '—'}</p>
                      </td>
                      <td>{[supplier.city, supplier.country].filter(Boolean).join(', ') || '—'}</td>
                      <td className="text-right tabular-nums">{supplier.order_count}</td>
                      <td className="text-right tabular-nums">{formatMoney(supplier.purchased_total, currency)}</td>
                      <td>
                        <StatusBadge status={supplier.status} />
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View" onClick={() => setViewingSupplier(supplier)}>
                            <Eye size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(supplier)}>
                            <Pencil size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </TableWrapper>
        )}
      </Card>

      <ContactFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        kind={isCustomer ? 'customer' : 'supplier'}
        editing={editing}
        repo={repo}
        onSaved={() => refresh()}
      />

      <CustomerDetail
        open={Boolean(viewingCustomer)}
        onClose={() => setViewingCustomer(null)}
        customerId={viewingCustomer}
        repo={repo}
        currency={currency}
        onEdit={openEdit}
        onChanged={refresh}
      />

      <SupplierDetail
        open={Boolean(viewingSupplier)}
        onClose={() => setViewingSupplier(null)}
        supplier={viewingSupplier}
        repo={repo}
        currency={currency}
        onEdit={openEdit}
        onChanged={refresh}
      />
    </div>
  )
}
