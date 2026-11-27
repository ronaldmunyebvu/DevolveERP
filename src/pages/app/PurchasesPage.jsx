import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  PackageCheck,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
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
import {
  downloadCsv,
  formatDate,
  formatMoney,
  formatQuantity,
  matchesSearch,
  toDateInput,
} from '@/lib/utils'

function emptyPurchase(locationId = '') {
  return {
    supplier_id: '',
    location_id: locationId,
    status: 'ordered',
    order_date: toDateInput(new Date()),
    expected_date: '',
    shipping_cost: '',
    tax_rate: '',
    include_tax: false,
    notes: '',
    items: [newLine('unit_cost')],
  }
}

function PurchaseFormModal({ open, onClose, suppliers, products, locations, repo, onSaved }) {
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [form, setForm] = useState(emptyPurchase())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const defaultLocation = locations.find((location) => location.is_default) || locations[0]
    setForm({ ...emptyPurchase(defaultLocation?.id || ''), tax_rate: String(company?.tax_rate ?? 15.5) })
    setError('')
  }, [open, locations, company?.tax_rate])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const totals = useMemo(() => {
    const subtotal = form.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0),
      0,
    )
    const shipping = Number(form.shipping_cost) || 0
    const tax = form.include_tax ? ((subtotal + shipping) * (Number(form.tax_rate) || 0)) / 100 : 0
    return { subtotal, shipping, tax, total: subtotal + shipping + tax }
  }, [form.items, form.shipping_cost, form.tax_rate, form.include_tax])

  async function save(event) {
    event.preventDefault()
    setError('')
    const usable = (item) =>
      (item.product_id || (item.is_manual && String(item.name || '').trim())) &&
      Number(item.quantity) > 0
    if (!form.items.some(usable)) {
      setError('Add at least one product or manual item and a quantity.')
      return
    }
    if (form.items.some((item) => usable(item) && item.is_manual && !(Number(item.unit_cost) > 0))) {
      setError('Enter a cost for each manual item.')
      return
    }
    setBusy(true)
    try {
      await repo.purchases.create({
        ...form,
        shipping_cost: Number(form.shipping_cost) || 0,
        tax_rate: form.include_tax ? Number(form.tax_rate) || 0 : 0,
        include_tax: form.include_tax,
        items: form.items
          .filter(usable)
          .map((item) => ({
            product_id: item.product_id || null,
            item_name: item.is_manual ? String(item.name || '').trim() : '',
            description: item.description,
            quantity: Number(item.quantity),
            unit_cost: Number(item.unit_cost) || 0,
            expiry_date: item.expiry_date || null,
          })),
      })
      toast.success(form.status === 'received' ? 'Purchase saved and stock received.' : 'Purchase order saved.')
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
      title="New purchase"
      description="Record stock and manual items bought from a supplier. Receiving it posts product stock and the journal."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save purchase
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier">
            <Select value={form.supplier_id} onChange={set('supplier_id')}>
              <option value="">No supplier / cash purchase</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Receive into" required>
            <Select value={form.location_id} onChange={set('location_id')} required>
              <option value="">Choose a location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>
              <option value="draft">Draft — not ordered</option>
              <option value="ordered">Ordered — awaiting delivery</option>
              <option value="received">Received — add to stock now</option>
            </Select>
          </Field>
          <Field label="Order date">
            <Input type="date" value={form.order_date} onChange={set('order_date')} />
          </Field>
          <Field label="Expected date">
            <Input type="date" value={form.expected_date} onChange={set('expected_date')} />
          </Field>
          <Field label="Shipping / clearing cost">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.shipping_cost}
              onChange={set('shipping_cost')}
              placeholder="0.00"
            />
          </Field>
        </div>

        {form.status === 'received' && (
          <Alert tone="warning" icon={AlertTriangle}>
            Saving as received will add product quantities to stock and post the purchase journal.
          </Alert>
        )}

        <div>
          <p className="field-label">Items</p>
          <LineItemsEditor
            items={form.items}
            onChange={(items) => setForm((current) => ({ ...current, items }))}
            products={products}
            priceKey="unit_cost"
            priceLabel="Unit cost"
            showExpiry
            allowManual
            currency={currency}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Checkbox
              label="Include tax"
              description="Tick to add tax to this purchase."
              checked={form.include_tax}
              onChange={(event) => setForm((current) => ({ ...current, include_tax: event.target.checked }))}
            />
            <Field
              label="Tax rate (%)"
              hint={form.include_tax ? 'Applied from company settings.' : 'Tax is not included in this purchase.'}
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
            <Textarea value={form.notes} onChange={set('notes')} placeholder="Supplier invoice number, clearing details..." rows={2} />
          </Field>
        </div>

        <div className="ml-auto w-full max-w-sm rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-ink-600">Subtotal</span>
            <span className="font-medium tabular-nums">{formatMoney(totals.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-600">Shipping / clearing</span>
            <span className="font-medium tabular-nums">{formatMoney(totals.shipping, currency)}</span>
          </div>
          {form.include_tax && (
            <div className="flex justify-between py-1">
              <span className="text-ink-600">Tax</span>
              <span className="font-medium tabular-nums">{formatMoney(totals.tax, currency)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-ink-300 pt-2">
            <span className="font-semibold">Total</span>
            <span className="font-semibold tabular-nums">{formatMoney(totals.total, currency)}</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function PurchaseDetailModal({ open, onClose, purchaseId, repo, onChanged, onDelete, currency }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useAsyncData(
    () => (repo && purchaseId ? repo.purchases.get(purchaseId) : null),
    [repo, purchaseId, open],
    { enabled: Boolean(open && repo && purchaseId) },
  )

  async function receive() {
    setBusy(true)
    try {
      await repo.purchases.receive({ id: purchaseId })
      toast.success('Purchase received. Stock and journals updated.')
      reload()
      onChanged()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data?.po_number ? `Purchase ${data.po_number}` : 'Purchase order'}
      description={data?.supplier_name || 'No supplier'}
      size="lg"
      footer={
        data ? (
          <>
            {data.status !== 'received' && (
              <Button variant="secondary" onClick={() => onDelete(data)} className="text-red-600">
                <Trash2 size={15} />
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {data.status !== 'received' && (
              <Button variant="success" onClick={receive} loading={busy}>
                <PackageCheck size={16} />
                Receive stock
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={data.status} />
            <Badge tone="neutral">Ordered {formatDate(data.order_date)}</Badge>
            {data.expected_date && <Badge tone="info">Expected {formatDate(data.expected_date)}</Badge>}
            {data.received_at && <Badge tone="success">Received {formatDate(data.received_at)}</Badge>}
            <span className="ml-auto text-xs text-ink-500">{data.location_name}</span>
          </div>

          <TableWrapper className="rounded-lg border border-ink-200">
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit cost</th>
                <th>Expiry</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                const detail = item.item_description ?? item.description
                return (
                  <tr key={item.id}>
                    <td>
                      <p className="font-medium text-ink-800">{item.product_name || detail || 'Item'}</p>
                      {item.sku && <p className="text-[11px] text-ink-500">{item.sku}</p>}
                      {detail && detail !== item.product_name && (
                        <p className="text-[11px] text-ink-500">{detail}</p>
                      )}
                      {!item.product_id && <p className="text-[11px] text-ink-500">Manual item</p>}
                    </td>
                    <td className="text-right tabular-nums">{formatQuantity(item.quantity)}</td>
                    <td className="text-right tabular-nums">{formatMoney(item.unit_cost, currency)}</td>
                    <td>{item.expiry_date ? formatDate(item.expiry_date) : '—'}</td>
                    <td className="text-right tabular-nums">{formatMoney(item.line_total, currency)}</td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrapper>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Subtotal</span>
              <span className="tabular-nums">{formatMoney(data.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Shipping / clearing</span>
              <span className="tabular-nums">{formatMoney(data.shipping_cost, currency)}</span>
            </div>
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
  )
}

export default function PurchasesPage() {
  const repo = useRepository()
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const purchases = useAsyncData(() => (repo ? repo.purchases.list() : null), [repo], { enabled: Boolean(repo) })
  const suppliers = useAsyncData(() => (repo ? repo.suppliers.list() : null), [repo], { enabled: Boolean(repo) })
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
  }, [searchParams, setSearchParams])

  const list = purchases.data || []
  const visible = useMemo(
    () =>
      list.filter((purchase) => {
        if (filters.status && purchase.status !== filters.status) return false
        return matchesSearch([purchase.po_number, purchase.supplier_name].join(' '), filters.search)
      }),
    [list, filters],
  )

  const stats = useMemo(() => {
    const received = list.filter((purchase) => purchase.status === 'received')
    const pending = list.filter((purchase) => purchase.status !== 'received' && purchase.status !== 'cancelled')
    return {
      receivedValue: received.reduce((sum, purchase) => sum + Number(purchase.total_amount || 0), 0),
      pendingValue: pending.reduce((sum, purchase) => sum + Number(purchase.total_amount || 0), 0),
      pendingCount: pending.length,
      receivedCount: received.length,
    }
  }, [list])

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await repo.purchases.remove({ id: deleting.id })
      toast.success('Purchase order deleted.')
      setDeleting(null)
      setViewing(null)
      purchases.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  function exportCsv() {
    downloadCsv(
      'purchases',
      [
        { label: 'PO number', value: (row) => row.po_number },
        { label: 'Supplier', value: (row) => row.supplier_name },
        { label: 'Order date', value: (row) => row.order_date },
        { label: 'Expected', value: (row) => row.expected_date },
        { label: 'Status', value: (row) => row.status },
        { label: 'Items', value: (row) => row.item_count },
        { label: 'Subtotal', value: (row) => row.subtotal },
        { label: 'Shipping', value: (row) => row.shipping_cost },
        { label: 'Tax', value: (row) => row.tax_amount },
        { label: 'Total', value: (row) => row.total_amount },
        { label: 'Location', value: (row) => row.location_name },
      ],
      visible,
    )
  }

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Supplier orders, importation costs and stock receipts."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={purchases.reload}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              New purchase
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Received spend"
          value={formatMoney(stats.receivedValue, currency)}
          hint={`${stats.receivedCount} received order${stats.receivedCount === 1 ? '' : 's'}`}
          icon={PackageCheck}
          tone="green"
        />
        <StatCard
          label="On order"
          value={formatMoney(stats.pendingValue, currency)}
          hint={`${stats.pendingCount} open order${stats.pendingCount === 1 ? '' : 's'}`}
          icon={Truck}
          tone="amber"
        />
        <StatCard label="Suppliers" value={formatQuantity((suppliers.data || []).length)} hint="Active supplier accounts" icon={Truck} tone="sky" />
        <StatCard label="Products" value={formatQuantity((products.data || []).length)} hint="Available to purchase" icon={Plus} tone="ink" />
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Search PO number or supplier..."
            className="w-full sm:w-80"
          />
          <Select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="w-full sm:w-44"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="ordered">Ordered</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <span className="ml-auto text-xs text-ink-500">{visible.length} orders</span>
        </div>

        {purchases.error ? (
          <div className="p-6">
            <Alert tone="danger">{purchases.error}</Alert>
          </div>
        ) : purchases.loading && !purchases.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={list.length ? 'No orders match these filters' : 'No purchases yet'}
            message={
              list.length
                ? 'Try a different search or status.'
                : 'Record an order to track stock coming in from suppliers.'
            }
            action={
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={16} />
                New purchase
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>PO number</th>
                <th>Supplier</th>
                <th>Order date</th>
                <th>Expected</th>
                <th className="text-right">Items</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((purchase) => (
                <tr key={purchase.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setViewing(purchase.id)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {purchase.po_number}
                    </button>
                  </td>
                  <td>{purchase.supplier_name || 'Cash purchase'}</td>
                  <td>{formatDate(purchase.order_date)}</td>
                  <td>{purchase.expected_date ? formatDate(purchase.expected_date) : '—'}</td>
                  <td className="text-right tabular-nums">{purchase.item_count}</td>
                  <td className="text-right font-medium tabular-nums">{formatMoney(purchase.total_amount, currency)}</td>
                  <td>
                    <StatusBadge status={purchase.status} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="View" onClick={() => setViewing(purchase.id)}>
                        <Eye size={16} />
                      </Button>
                      {purchase.status !== 'received' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setDeleting(purchase)}
                        >
                          <Trash2 size={16} />
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

      <PurchaseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        suppliers={suppliers.data || []}
        products={products.data || []}
        locations={locations.data || []}
        repo={repo}
        onSaved={() => {
          purchases.reload()
          products.reload()
        }}
      />

      <PurchaseDetailModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        purchaseId={viewing}
        repo={repo}
        currency={currency}
        onChanged={() => {
          purchases.reload()
          products.reload()
        }}
        onDelete={(purchase) => setDeleting(purchase)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete purchase order?"
        message={deleting ? `Delete ${deleting.po_number}? Received purchases cannot be deleted.` : ''}
        confirmLabel="Delete order"
      />
    </div>
  )
}
