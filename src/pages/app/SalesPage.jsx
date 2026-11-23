import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Banknote,
  CreditCard,
  Eye,
  Plus,
  ReceiptText,
  RefreshCw,
  Trash2,
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
  Textarea,
} from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { LineItemsEditor, newLine } from '@/components/domain/LineItemsEditor'
import { DocumentActions } from '@/components/domain/DocumentActions'
import { payloadFromInvoice } from '@/lib/documents'
import {
  PAYMENT_METHODS,
  downloadCsv,
  formatDate,
  formatMoney,
  formatQuantity,
  matchesSearch,
  titleCase,
  toDateInput,
} from '@/lib/utils'

function emptySale(locationId = '') {
  return {
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    location_id: locationId,
    purchase_order_number: '',
    issue_date: toDateInput(new Date()),
    due_date: '',
    payment_method: 'cash',
    amount_paid: '',
    discount: '',
    tax_rate: '',
    notes: '',
    items: [newLine('unit_price')],
  }
}

function SaleFormModal({ open, onClose, customers, products, locations, repo, onCreated }) {
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [form, setForm] = useState(emptySale())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const defaultLocation = locations.find((location) => location.is_default) || locations[0]
    setForm({ ...emptySale(defaultLocation?.id || ''), tax_rate: String(company?.tax_rate ?? 15.5) })
    setError('')
  }, [open, locations, company?.tax_rate])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const totals = useMemo(() => {
    const subtotal = form.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
      0,
    )
    const discount = Math.min(Number(form.discount) || 0, subtotal)
    const taxable = subtotal - discount
    const tax = (taxable * (Number(form.tax_rate) || 0)) / 100
    const total = taxable + tax
    const paid = Math.min(Number(form.amount_paid) || 0, total)
    return { subtotal, discount, tax, total, paid, balance: total - paid }
  }, [form.items, form.discount, form.tax_rate, form.amount_paid])

  const walkIn = !form.customer_id

  useEffect(() => {
    if (!open || !walkIn) return
    const next = totals.total > 0 ? totals.total.toFixed(2) : ''
    setForm((current) =>
      current.amount_paid === next ? current : { ...current, amount_paid: next },
    )
  }, [open, walkIn, totals.total])

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.items.some((item) => item.product_id && Number(item.quantity) > 0)) {
      setError('Add at least one product and quantity.')
      return
    }
    if (!form.customer_id && !form.customer_name.trim()) {
      setError('Choose a customer or enter the walk-in customer name.')
      return
    }
    if (!form.location_id) {
      setError('Choose the location the goods leave from.')
      return
    }
    setBusy(true)
    try {
      const invoice = await repo.sales.create({
        ...form,
        due_date: walkIn ? form.issue_date : form.due_date || form.issue_date,
        discount: Number(form.discount) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        amount_paid: Number(form.amount_paid) || 0,
        items: form.items
          .filter((item) => item.product_id && Number(item.quantity) > 0)
          .map((item) => ({
            product_id: item.product_id,
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price) || 0,
          })),
      })
      toast.success(totals.balance > 0 ? 'Credit invoice created.' : 'Invoice created and paid.')
      onCreated(invoice.id)
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
      title="New sale"
      description="Create a cash or credit invoice. Stock is deducted immediately."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Create invoice
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Customer" hint="Leave blank for a walk-in.">
            <Select value={form.customer_id} onChange={set('customer_id')}>
              <option value="">Walk-in / one-off customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.company_name ? ` · ${customer.company_name}` : ''}
                </option>
              ))}
            </Select>
          </Field>
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
          <Field label="Issue date">
            <Input type="date" value={form.issue_date} onChange={set('issue_date')} />
          </Field>
          <Field label="Purchase order number" hint="Optional">
            <Input
              value={form.purchase_order_number}
              onChange={set('purchase_order_number')}
              placeholder="e.g. PO-1234"
            />
          </Field>
        </div>

        {!form.customer_id && (
          <div className="grid gap-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3 sm:grid-cols-2">
            <Field label="Customer name" required>
              <Input value={form.customer_name} onChange={set('customer_name')} placeholder="Walk-in customer name" />
            </Field>
            <Field label="Phone">
              <Input value={form.customer_phone} onChange={set('customer_phone')} placeholder="+263..." />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.customer_email} onChange={set('customer_email')} placeholder="customer@email.com" />
            </Field>
            <Field label="Address">
              <Input value={form.customer_address} onChange={set('customer_address')} placeholder="Delivery or billing address" />
            </Field>
          </div>
        )}

        <div>
          <p className="field-label">Items sold</p>
          <LineItemsEditor
            items={form.items}
            onChange={(items) => setForm((current) => ({ ...current, items }))}
            products={products}
            priceKey="unit_price"
            priceLabel="Selling price"
            currency={currency}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Discount">
            <Input type="number" min="0" step="0.01" value={form.discount} onChange={set('discount')} placeholder="0.00" />
          </Field>
          <Field label="Tax rate (%)" hint="Applied automatically from company settings.">
            <Input type="number" min="0" step="0.01" value={form.tax_rate} readOnly />
          </Field>
          {!walkIn && (
            <Field label="Due date" hint="Leave blank for payment on receipt.">
              <Input type="date" value={form.due_date} onChange={set('due_date')} />
            </Field>
          )}
          <Field
            label="Payment received now"
            hint={
              walkIn
                ? 'Walk-in sales are paid in full now. The amount follows the invoice total.'
                : undefined
            }
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
          <Field label="Notes">
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Delivery instructions, order reference..." />
          </Field>
        </div>

        {totals.balance > 0 && (
          <Alert tone="warning" icon={CreditCard}>
            This is a credit sale. The customer will owe {formatMoney(totals.balance, currency)} after the payment entered.
          </Alert>
        )}

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
          <div className="flex justify-between py-1">
            <span className="text-ink-600">Tax</span>
            <span className="font-medium tabular-nums">{formatMoney(totals.tax, currency)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-ink-300 pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
          </div>
          <div className="flex justify-between py-1 text-emerald-700">
            <span>Paid now</span>
            <span className="tabular-nums">{formatMoney(totals.paid, currency)}</span>
          </div>
          <div className="flex justify-between font-semibold text-brand-700">
            <span>Balance</span>
            <span className="tabular-nums">{formatMoney(totals.balance, currency)}</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function PaymentModal({ open, onClose, invoice, repo, onSaved, currency }) {
  const toast = useToast()
  const [form, setForm] = useState({ amount: '', method: 'cash', reference: '', payment_date: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !invoice) return
    setForm({
      amount: String(invoice.balance ?? ''),
      method: 'cash',
      reference: '',
      payment_date: toDateInput(new Date()),
      notes: '',
    })
    setError('')
  }, [open, invoice])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!(Number(form.amount) > 0)) {
      setError('Enter a payment amount.')
      return
    }
    setBusy(true)
    try {
      await repo.sales.addPayment({ invoice_id: invoice.id, ...form, amount: Number(form.amount) })
      toast.success('Payment recorded.')
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
      title="Record payment"
      description={invoice ? `${invoice.invoice_number} · balance ${formatMoney(invoice.balance, currency)}` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Record payment
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount" required>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required />
          </Field>
          <Field label="Method">
            <Select value={form.method} onChange={set('method')}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {titleCase(method)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment date">
            <Input type="date" value={form.payment_date} onChange={set('payment_date')} />
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={set('reference')} placeholder="Receipt / transaction reference" />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Optional note" />
        </Field>
      </form>
    </Modal>
  )
}

function SaleDetailModal({ open, onClose, invoiceId, repo, onChanged, onVoid, currency, company }) {
  const toast = useToast()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [voidBusy, setVoidBusy] = useState(false)
  const { data, loading, error, reload } = useAsyncData(
    () => (repo && invoiceId ? repo.sales.get(invoiceId) : null),
    [repo, invoiceId, open],
    { enabled: Boolean(open && repo && invoiceId) },
  )

  async function voidInvoice() {
    setVoidBusy(true)
    try {
      await repo.sales.remove({ id: invoiceId })
      toast.success('Invoice voided and stock returned.')
      setConfirmVoid(false)
      onVoid()
      onClose()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setVoidBusy(false)
    }
  }

  const payload = data ? payloadFromInvoice(data, company) : null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={data?.invoice_number ? `Invoice ${data.invoice_number}` : 'Invoice'}
        description={data?.customer_name}
        size="xl"
        footer={
          data ? (
            <>
              {data.status !== 'void' && Number(data.amount_paid) <= 0 && (
                <Button variant="secondary" className="text-red-600" onClick={() => setConfirmVoid(true)}>
                  <Trash2 size={15} />
                  Void
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {data.status !== 'void' && Number(data.balance) > 0 && (
                <Button variant="success" onClick={() => setPaymentOpen(true)}>
                  <Wallet size={16} />
                  Add payment
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
              {data.due_date && <Badge tone={Number(data.balance) > 0 ? 'warning' : 'info'}>Due {formatDate(data.due_date)}</Badge>}
              <Badge tone="info">{data.location_name}</Badge>
              {data.purchase_order_number && (
                <Badge tone="neutral">P.O. {data.purchase_order_number}</Badge>
              )}
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
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Balance</p>
                <p className="mt-1 text-2xl font-semibold text-brand-700 tabular-nums">
                  {formatMoney(data.balance, currency)}
                </p>
                <p className="text-xs text-ink-500">
                  of {formatMoney(data.total_amount, currency)} · paid {formatMoney(data.amount_paid, currency)}
                </p>
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
                      <p className="font-medium text-ink-800">{item.product_name}</p>
                      <p className="text-[11px] text-ink-500">{item.sku}</p>
                    </td>
                    <td className="text-right tabular-nums">{formatQuantity(item.quantity)}</td>
                    <td className="text-right tabular-nums">{formatMoney(item.unit_price, currency)}</td>
                    <td className="text-right tabular-nums">{formatMoney(item.line_total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Payments</p>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-ink-500">No payments recorded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-ink-800">{formatMoney(payment.amount, currency)}</p>
                          <p className="text-[11px] text-ink-500">
                            {titleCase(payment.method)} · {formatDate(payment.payment_date)} · {payment.payment_number}
                          </p>
                        </div>
                        <Badge tone="success" size="sm">
                          Receipt
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
                <div className="flex justify-between">
                  <span className="text-ink-500">Tax ({data.tax_rate}%)</span>
                  <span className="tabular-nums">{formatMoney(data.tax_amount, currency)}</span>
                </div>
                <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(data.total_amount, currency)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Paid</span>
                  <span className="tabular-nums">{formatMoney(data.amount_paid, currency)}</span>
                </div>
                <div className="flex justify-between font-semibold text-brand-700">
                  <span>Balance</span>
                  <span className="tabular-nums">{formatMoney(data.balance, currency)}</span>
                </div>
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

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoice={data}
        repo={repo}
        currency={currency}
        onSaved={() => {
          reload()
          onChanged()
        }}
      />

      <ConfirmDialog
        open={confirmVoid}
        onClose={() => setConfirmVoid(false)}
        onConfirm={voidInvoice}
        loading={voidBusy}
        title="Void this invoice?"
        message="The invoice will be marked void, the stock will be returned and a reversing journal posted. Invoices with payments cannot be voided."
        confirmLabel="Void invoice"
      />
    </>
  )
}

export default function SalesPage() {
  const repo = useRepository()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [viewing, setViewing] = useState(null)

  const sales = useAsyncData(() => (repo ? repo.sales.list() : null), [repo], { enabled: Boolean(repo) })
  const customers = useAsyncData(() => (repo ? repo.customers.list({ status: 'active' }) : null), [repo], {
    enabled: Boolean(repo),
  })
  const products = useAsyncData(() => (repo ? repo.products.list({ status: 'active' }) : null), [repo], {
    enabled: Boolean(repo),
  })
  const locations = useAsyncData(() => (repo ? repo.locations.list() : null), [repo], { enabled: Boolean(repo) })

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setFormOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    const invoiceId = searchParams.get('invoice')
    if (invoiceId) setViewing(invoiceId)
  }, [searchParams, setSearchParams])

  const list = sales.data || []
  const visible = useMemo(
    () =>
      list.filter((sale) => {
        if (filters.status && sale.status !== filters.status) return false
        return matchesSearch([sale.invoice_number, sale.customer_name].join(' '), filters.search)
      }),
    [list, filters],
  )

  const stats = useMemo(() => {
    const valid = list.filter((sale) => sale.status !== 'void')
    return {
      invoiced: valid.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0),
      paid: valid.reduce((sum, sale) => sum + Number(sale.amount_paid || 0), 0),
      outstanding: valid.reduce((sum, sale) => sum + Number(sale.balance || 0), 0),
      count: valid.length,
    }
  }, [list])

  function closeDetail() {
    setViewing(null)
    if (searchParams.get('invoice')) {
      const next = new URLSearchParams(searchParams)
      next.delete('invoice')
      setSearchParams(next, { replace: true })
    }
  }

  function refreshAll() {
    sales.reload()
    customers.reload()
    products.reload()
  }

  function exportCsv() {
    downloadCsv(
      'sales',
      [
        { label: 'Invoice', value: (row) => row.invoice_number },
        { label: 'Purchase order number', value: (row) => row.purchase_order_number },
        { label: 'Customer', value: (row) => row.customer_name },
        { label: 'Issue date', value: (row) => row.issue_date },
        { label: 'Due date', value: (row) => row.due_date },
        { label: 'Status', value: (row) => row.status },
        { label: 'Subtotal', value: (row) => row.subtotal },
        { label: 'Discount', value: (row) => row.discount },
        { label: 'Tax', value: (row) => row.tax_amount },
        { label: 'Total', value: (row) => row.total_amount },
        { label: 'Paid', value: (row) => row.amount_paid },
        { label: 'Balance', value: (row) => row.balance },
      ],
      visible,
    )
  }

  return (
    <div>
      <PageHeader
        title="Sales & invoices"
        description="Cash sales and credit sales, with payments and customer balances."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={refreshAll}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              New sale
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invoiced" value={formatMoney(stats.invoiced, currency)} hint={`${stats.count} invoices`} icon={ReceiptText} />
        <StatCard label="Collected" value={formatMoney(stats.paid, currency)} hint="Payments received" icon={Banknote} tone="green" />
        <StatCard label="Outstanding" value={formatMoney(stats.outstanding, currency)} hint="Credit sales still owed" icon={CreditCard} tone="amber" />
        <StatCard
          label="Average invoice"
          value={formatMoney(stats.count ? stats.invoiced / stats.count : 0, currency)}
          hint="Across all valid invoices"
          icon={Wallet}
          tone="sky"
        />
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Search invoice number or customer..."
            className="w-full sm:w-80"
          />
          <Select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="w-full sm:w-44"
          >
            <option value="">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Part paid</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </Select>
          <span className="ml-auto text-xs text-ink-500">{visible.length} invoices</span>
        </div>

        {sales.error ? (
          <div className="p-6">
            <Alert tone="danger">{sales.error}</Alert>
          </div>
        ) : sales.loading && !sales.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={list.length ? 'No invoices match these filters' : 'No sales yet'}
            message={list.length ? 'Try a different search or status.' : 'Create your first invoice to start selling.'}
            action={
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={16} />
                New sale
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setViewing(sale.id)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {sale.invoice_number}
                    </button>
                  </td>
                  <td>{sale.customer_name}</td>
                  <td>{formatDate(sale.issue_date)}</td>
                  <td>{sale.due_date ? formatDate(sale.due_date) : '—'}</td>
                  <td className="text-right font-medium tabular-nums">{formatMoney(sale.total_amount, currency)}</td>
                  <td className="text-right tabular-nums text-emerald-700">{formatMoney(sale.amount_paid, currency)}</td>
                  <td className="text-right tabular-nums font-medium text-brand-700">{formatMoney(sale.balance, currency)}</td>
                  <td>
                    <StatusBadge status={sale.status} />
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" title="View" onClick={() => setViewing(sale.id)}>
                        <Eye size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <SaleFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customers={customers.data || []}
        products={products.data || []}
        locations={locations.data || []}
        repo={repo}
        onCreated={(id) => {
          refreshAll()
          setViewing(id)
        }}
      />

      <SaleDetailModal
        open={Boolean(viewing)}
        onClose={closeDetail}
        invoiceId={viewing}
        repo={repo}
        currency={currency}
        company={company}
        onChanged={refreshAll}
        onVoid={refreshAll}
      />
    </div>
  )
}
