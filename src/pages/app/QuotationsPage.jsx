import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRightLeft,
  CalendarClock,
  Eye,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
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
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  SearchInput,
  Select,
  Spinner,
  TableWrapper,
  Textarea,
} from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { LineItemsEditor, newLine } from '@/components/domain/LineItemsEditor'
import { DocumentActions } from '@/components/domain/DocumentActions'
import { payloadFromQuotation } from '@/lib/documents'
import {
  PAYMENT_METHODS,
  downloadCsv,
  formatDate,
  formatMoney,
  formatNumber,
  formatQuantity,
  matchesSearch,
  titleCase,
  toDateInput,
} from '@/lib/utils'

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected']

function emptyQuote() {
  return {
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    status: 'draft',
    issue_date: toDateInput(new Date()),
    valid_until: '',
    discount: '',
    tax_rate: '',
    include_tax: false,
    notes: '',
    items: [newLine('unit_price')],
  }
}

function daysUntil(value) {
  if (!value) return null
  const end = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Math.round((end - start) / 86400000)
}

function QuotationFormModal({ open, onClose, editing, customers, products, repo, onSaved }) {
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [form, setForm] = useState(emptyQuote())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        customer_id: editing.customer_id || '',
        customer_name: editing.customer_name || '',
        customer_phone: editing.customer_phone || '',
        customer_email: editing.customer_email || '',
        customer_address: editing.customer_address || '',
        status: editing.status || 'draft',
        issue_date: toDateInput(editing.issue_date),
        valid_until: toDateInput(editing.valid_until),
        discount: editing.discount ?? '',
        tax_rate: editing.tax_rate ?? String(company?.tax_rate ?? 15.5),
        include_tax: editing.include_tax ?? true,
        notes: editing.notes || '',
        items:
          editing.items?.length > 0
            ? editing.items.map((item) => ({
                product_id: item.product_id || '',
                description: item.description || '',
                quantity: item.quantity ?? '',
                unit_price: item.unit_price ?? '',
                is_manual: !item.product_id,
              }))
            : [newLine('unit_price')],
      })
    } else {
      setForm({ ...emptyQuote(), tax_rate: String(company?.tax_rate ?? 15.5) })
    }
    setError('')
  }, [open, editing, company?.tax_rate])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const totals = useMemo(() => {
    const subtotal = form.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
      0,
    )
    const discount = Math.min(Number(form.discount) || 0, subtotal)
    const taxable = subtotal - discount
    const tax = form.include_tax ? (taxable * (Number(form.tax_rate) || 0)) / 100 : 0
    return { subtotal, discount, tax, total: taxable + tax }
  }, [form.items, form.discount, form.tax_rate, form.include_tax])

  async function save(event) {
    event.preventDefault()
    setError('')
    const usable = (item) =>
      (item.product_id || String(item.description || '').trim()) && Number(item.quantity) > 0
    if (!form.items.some(usable)) {
      setError('Add at least one product or manual item and a quantity.')
      return
    }
    if (form.items.some((item) => usable(item) && item.is_manual && !(Number(item.unit_price) > 0))) {
      setError('Enter a price for each manual item.')
      return
    }
    if (!form.customer_id && !form.customer_name.trim()) {
      setError('Choose a customer or enter the customer name.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        ...form,
        discount: Number(form.discount) || 0,
        tax_rate: form.include_tax ? Number(form.tax_rate) || 0 : 0,
        include_tax: form.include_tax,
        items: form.items
          .filter(usable)
          .map((item) => ({
            product_id: item.product_id || null,
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price) || 0,
          })),
      }
      const quotation = editing
        ? await repo.quotations.update({ id: editing.id, ...payload })
        : await repo.quotations.create(payload)
      toast.success(editing ? 'Quotation updated.' : 'Quotation created.')
      onSaved(quotation)
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
      title={editing ? `Edit ${editing.quote_number}` : 'New quotation'}
      description="Quotations reserve no stock and create no accounting entries."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save changes' : 'Create quotation'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Customer" hint="Leave blank for a one-off customer.">
            <Select value={form.customer_id} onChange={set('customer_id')}>
              <option value="">One-off customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>
              {QUOTE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Issue date">
            <Input type="date" value={form.issue_date} onChange={set('issue_date')} />
          </Field>
          <Field label="Valid until">
            <Input type="date" value={form.valid_until} onChange={set('valid_until')} />
          </Field>
        </div>

        {!form.customer_id && (
          <div className="grid gap-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3 sm:grid-cols-2">
            <Field label="Customer name" required>
              <Input value={form.customer_name} onChange={set('customer_name')} placeholder="Customer name" />
            </Field>
            <Field label="Phone">
              <Input value={form.customer_phone} onChange={set('customer_phone')} placeholder="+263..." />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.customer_email} onChange={set('customer_email')} placeholder="customer@email.com" />
            </Field>
            <Field label="Address">
              <Input value={form.customer_address} onChange={set('customer_address')} placeholder="Address" />
            </Field>
          </div>
        )}

        <div>
          <p className="field-label">Quoted items</p>
          <LineItemsEditor
            items={form.items}
            onChange={(items) => setForm((current) => ({ ...current, items }))}
            products={products}
            priceKey="unit_price"
            priceLabel="Quoted price"
            allowManual
            currency={currency}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Discount">
            <Input type="number" min="0" step="0.01" value={form.discount} onChange={set('discount')} placeholder="0.00" />
          </Field>
          <div className="space-y-2">
            <Checkbox
              label="Include tax"
              description="Tick to add tax to this quotation."
              checked={form.include_tax}
              onChange={(event) => setForm((current) => ({ ...current, include_tax: event.target.checked }))}
            />
            <Field
              label="Tax rate (%)"
              hint={form.include_tax ? 'Applied from company settings.' : 'Tax is not included in this quotation.'}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.include_tax ? form.tax_rate : ''}
                readOnly
                disabled={!form.include_tax}
                placeholder="—"
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Terms, lead time, delivery..." />
          </Field>
        </div>

        <div className="ml-auto w-full max-w-sm rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-ink-600">Subtotal</span>
            <span className="font-medium tabular-nums">{formatMoney(totals.subtotal, currency)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-ink-600">Discount</span>
              <span className="font-medium tabular-nums">- {formatMoney(totals.discount, currency)}</span>
            </div>
          )}
          {form.include_tax && (
            <div className="flex justify-between py-1">
              <span className="text-ink-600">Tax</span>
              <span className="font-medium tabular-nums">{formatMoney(totals.tax, currency)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-ink-300 pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function ConvertModal({ open, onClose, quotation, locations, repo, currency, onConverted }) {
  const toast = useToast()
  const [form, setForm] = useState({ location_id: '', due_date: '', amount_paid: '', payment_method: 'cash' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const walkIn = !quotation?.customer_id

  useEffect(() => {
    if (!open) return
    const available = locations || []
    const defaultLocation = available.find((location) => location.is_default) || available[0]
    setForm({
      location_id: defaultLocation?.id || '',
      due_date: '',
      amount_paid: '',
      payment_method: 'cash',
    })
    setError('')
  }, [open, locations])

  useEffect(() => {
    if (!open || !walkIn) return
    const next = Number(quotation?.total_amount) > 0 ? Number(quotation.total_amount).toFixed(2) : ''
    setForm((current) =>
      current.amount_paid === next ? current : { ...current, amount_paid: next },
    )
  }, [open, walkIn, quotation?.total_amount])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function convert(event) {
    event.preventDefault()
    setError('')
    if (!form.location_id) {
      setError('Choose the location the stock will leave from.')
      return
    }
    setBusy(true)
    try {
      const invoice = await repo.quotations.convert({
        id: quotation.id,
        location_id: form.location_id,
        due_date: walkIn ? '' : form.due_date,
        amount_paid: Number(form.amount_paid) || 0,
        payment_method: form.payment_method,
      })
      toast.success(`Converted to invoice ${invoice.invoice_number}.`)
      onConverted(invoice)
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
      title={`Convert ${quotation?.quote_number || 'quotation'} to invoice`}
      description="Stock will be deducted and a journal posted. This cannot be undone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={convert} loading={busy}>
            <ArrowRightLeft size={15} />
            Convert to invoice
          </Button>
        </>
      }
    >
      <form onSubmit={convert} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="rounded-lg bg-ink-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-600">Customer</span>
            <span className="font-medium">{quotation?.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-600">Quotation total</span>
            <span className="font-medium tabular-nums">{formatMoney(quotation?.total_amount || 0, currency)}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sell from" required>
            <Select value={form.location_id} onChange={set('location_id')} required>
              <option value="">Choose a location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
          {!walkIn && (
            <Field label="Due date" hint="Leave blank for payment on receipt.">
              <Input type="date" value={form.due_date} onChange={set('due_date')} />
            </Field>
          )}
          <Field
            label="Payment received now"
            hint={walkIn ? 'Walk-in quotations are paid in full on conversion.' : undefined}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount_paid}
              onChange={set('amount_paid')}
              placeholder="0.00"
              readOnly={walkIn}
              className={walkIn ? 'bg-ink-50' : undefined}
            />
          </Field>
          <Field label="Payment method">
            <Select value={form.payment_method} onChange={set('payment_method')}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {titleCase(method)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  )
}

function QuotationDetailModal({ open, onClose, quotationId, repo, onChanged, onEdit, onConverted, currency, company }) {
  const toast = useToast()
  const [convertOpen, setConvertOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const { data, loading, error, reload } = useAsyncData(
    () => (repo && quotationId ? repo.quotations.get(quotationId) : null),
    [repo, quotationId, open],
    { enabled: Boolean(open && repo && quotationId) },
  )

  async function remove() {
    setDeleteBusy(true)
    try {
      await repo.quotations.remove({ id: quotationId })
      toast.success('Quotation deleted.')
      setConfirmDelete(false)
      onChanged()
      onClose()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  const payload = data ? payloadFromQuotation(data, company) : null
  const converted = Boolean(data?.converted_invoice_id)
  const canConvert = data && !converted && !['rejected', 'expired'].includes(data.status)
  const canEdit = data && !converted && !['accepted', 'expired'].includes(data.status)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={data?.quote_number ? `Quotation ${data.quote_number}` : 'Quotation'}
        description={data?.customer_name}
        size="xl"
        footer={
          data ? (
            <>
              <Button variant="secondary" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} />
                Delete
              </Button>
              {canEdit && (
                <Button variant="secondary" onClick={() => onEdit(data)}>
                  <Pencil size={15} />
                  Edit
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {canConvert && (
                <Button onClick={() => setConvertOpen(true)}>
                  <ArrowRightLeft size={15} />
                  Convert to invoice
                </Button>
              )}
            </>
          ) : null
        }
      >
        {loading ? (
          <Spinner />
        ) : error ? (
          <Alert tone="danger">{error}</Alert>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              <Badge tone="neutral">Issued {formatDate(data.issue_date)}</Badge>
              {data.valid_until && (
                <Badge tone={daysUntil(data.valid_until) < 0 ? 'danger' : 'info'}>
                  Valid until {formatDate(data.valid_until)}
                </Badge>
              )}
              {converted && <Badge tone="purple">Invoice created</Badge>}
              <div className="ml-auto">
                <DocumentActions payload={payload} defaultEmail={data.customer_email || ''} size="sm" />
              </div>
            </div>

            <div className="grid gap-3 rounded-lg bg-ink-50 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Customer</p>
                <p className="mt-1 font-medium text-ink-900">{data.customer_name}</p>
                <p className="text-ink-600">{data.customer_phone || '—'}</p>
                <p className="text-ink-600">{data.customer_email || '—'}</p>
                <p className="text-ink-600">{data.customer_address || '—'}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Quotation value</p>
                <p className="mt-1 text-2xl font-semibold text-brand-700 tabular-nums">
                  {formatMoney(data.total_amount, currency)}
                </p>
                <p className="text-xs text-ink-500">{data.items.length} line items</p>
              </div>
            </div>

            <TableWrapper className="rounded-lg border border-ink-200">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Unit price</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <p className="font-medium text-ink-800">{item.product_name || item.description || 'Item'}</p>
                      {item.sku && <p className="text-[11px] text-ink-500">{item.sku}</p>}
                      {!item.product_id && <p className="text-[11px] text-ink-500">Manual item</p>}
                    </td>
                    <td className="text-right tabular-nums">{formatQuantity(item.quantity)}</td>
                    <td className="text-right tabular-nums">{formatMoney(item.unit_price, currency)}</td>
                    <td className="text-right tabular-nums">{formatMoney(item.line_total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Subtotal</span>
                <span className="tabular-nums">{formatMoney(data.subtotal, currency)}</span>
              </div>
              {Number(data.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-500">Discount</span>
                  <span className="tabular-nums">- {formatMoney(data.discount, currency)}</span>
                </div>
              )}
              {Number(data.tax_rate) > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-500">Tax ({data.tax_rate}%)</span>
                  <span className="tabular-nums">{formatMoney(data.tax_amount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(data.total_amount, currency)}</span>
              </div>
            </div>

            {data.notes && (
              <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
                <span className="font-medium text-ink-700">Notes: </span>
                {data.notes}
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
        title="Delete this quotation?"
        message={
          converted
            ? 'This quotation was converted to an invoice. Deleting the quotation will not affect the invoice.'
            : 'This quotation will be permanently deleted.'
        }
        confirmLabel="Delete quotation"
      />

      {convertOpen && (
        <ConvertModalWithLocations
          open={convertOpen}
          onClose={() => {
            setConvertOpen(false)
            reload()
          }}
          quotation={data}
          repo={repo}
          currency={currency}
          onConverted={(invoice) => {
            reload()
            onChanged()
            onClose()
            onConverted?.(invoice)
          }}
        />
      )}
    </>
  )
}

function ConvertModalWithLocations({ repo, ...props }) {
  const locations = useAsyncData(() => (repo ? repo.locations.list() : null), [repo], { enabled: Boolean(repo) })
  return <ConvertModal {...props} locations={locations.data} repo={repo} />
}

export default function QuotationsPage() {
  const repo = useRepository()
  const { company } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currency = company?.currency || 'USD'
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  const quotations = useAsyncData(() => (repo ? repo.quotations.list() : null), [repo], { enabled: Boolean(repo) })
  const customers = useAsyncData(() => (repo ? repo.customers.list({ status: 'active' }) : null), [repo], {
    enabled: Boolean(repo),
  })
  const products = useAsyncData(() => (repo ? repo.products.list({ status: 'active' }) : null), [repo], {
    enabled: Boolean(repo),
  })

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(null)
      setFormOpen(true)
    }
  }, [searchParams])

  const list = quotations.data || []
  const visible = useMemo(
    () =>
      list.filter((quotation) => {
        if (filters.status && quotation.status !== filters.status) return false
        return matchesSearch([quotation.quote_number, quotation.customer_name].join(' '), filters.search)
      }),
    [list, filters],
  )

  const stats = useMemo(() => {
    const accepted = list.filter((quotation) => quotation.status === 'accepted')
    const open = list.filter((quotation) => ['draft', 'sent'].includes(quotation.status))
    const expiring = open.filter((quotation) => {
      const days = daysUntil(quotation.valid_until)
      return days !== null && days >= 0 && days <= 7
    })
    const converted = list.filter((quotation) => quotation.converted_invoice_id).length
    return {
      count: list.length,
      quoted: list.reduce((sum, quotation) => sum + Number(quotation.total_amount || 0), 0),
      acceptedValue: accepted.reduce((sum, quotation) => sum + Number(quotation.total_amount || 0), 0),
      openValue: open.reduce((sum, quotation) => sum + Number(quotation.total_amount || 0), 0),
      expiring: expiring.length,
      converted,
    }
  }, [list])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(quotation) {
    setEditing(quotation)
    setViewing(null)
    setFormOpen(true)
  }

  function exportCsv() {
    downloadCsv(
      'quotations',
      [
        { label: 'Quotation', value: (row) => row.quote_number },
        { label: 'Customer', value: (row) => row.customer_name },
        { label: 'Status', value: (row) => row.status },
        { label: 'Issued', value: (row) => row.issue_date },
        { label: 'Valid until', value: (row) => row.valid_until },
        { label: 'Items', value: (row) => row.item_count },
        { label: 'Total', value: (row) => row.total_amount },
        { label: 'Converted', value: (row) => (row.converted_invoice_id ? 'Yes' : 'No') },
      ],
      visible,
    )
  }

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Price jobs and orders, then convert the accepted ones into invoices."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={() => quotations.reload()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} />
              New quotation
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Quotations" value={formatNumber(stats.count)} hint="All quotations" icon={FileText} />
        <StatCard label="Open pipeline" value={formatMoney(stats.openValue, currency)} hint="Draft and sent quotes" icon={CalendarClock} tone="amber" />
        <StatCard label="Accepted" value={formatMoney(stats.acceptedValue, currency)} hint={`${stats.converted} converted to invoices`} icon={ArrowRightLeft} tone="green" />
        <StatCard label="Expiring soon" value={formatNumber(stats.expiring)} hint="Open quotes due within 7 days" icon={CalendarClock} tone="sky" />
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Search quote number or customer..."
            className="w-full sm:w-80"
          />
          <Select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="w-full sm:w-44"
          >
            <option value="">All statuses</option>
            {QUOTE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </Select>
          <span className="ml-auto text-xs text-ink-500">{visible.length} quotations</span>
        </div>

        {quotations.error ? (
          <div className="p-6">
            <Alert tone="danger">{quotations.error}</Alert>
          </div>
        ) : quotations.loading && !quotations.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={list.length ? 'No quotations match these filters' : 'No quotations yet'}
            message={list.length ? 'Try a different search or status.' : 'Create your first quotation to send pricing to a customer.'}
            action={
              <Button onClick={openCreate}>
                <Plus size={16} />
                New quotation
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Quotation</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Valid until</th>
                <th className="text-right">Items</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((quotation) => {
                const days = daysUntil(quotation.valid_until)
                return (
                  <tr key={quotation.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setViewing(quotation.id)}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {quotation.quote_number}
                      </button>
                      {quotation.converted_invoice_id && <p className="text-[11px] text-ink-500">Converted</p>}
                    </td>
                    <td>{quotation.customer_name}</td>
                    <td>{formatDate(quotation.issue_date)}</td>
                    <td>
                      {quotation.valid_until ? (
                        <span className={days !== null && days < 0 ? 'text-red-600' : ''}>
                          {formatDate(quotation.valid_until)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-right tabular-nums">{quotation.item_count}</td>
                    <td className="text-right font-medium tabular-nums">{formatMoney(quotation.total_amount, currency)}</td>
                    <td>
                      <StatusBadge status={quotation.status} />
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon" title="View" onClick={() => setViewing(quotation.id)}>
                          <Eye size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <QuotationFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        editing={editing}
        customers={customers.data || []}
        products={products.data || []}
        repo={repo}
        onSaved={(quotation) => {
          quotations.reload()
          setViewing(quotation.id)
        }}
      />

      <QuotationDetailModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        quotationId={viewing}
        repo={repo}
        currency={currency}
        company={company}
        onChanged={() => quotations.reload()}
        onEdit={openEdit}
        onConverted={(invoice) => navigate(`/app/sales?invoice=${invoice.id}`)}
      />
    </div>
  )
}
