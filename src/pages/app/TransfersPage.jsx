import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowRightLeft, Eye, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
import { downloadCsv, formatDate, formatQuantity, matchesSearch, toDateInput } from '@/lib/utils'

function TransferItemsEditor({ items, onChange, products }) {
  function update(index, patch) {
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)))
  }

  return (
    <div>
      <TableWrapper className="rounded-lg border border-ink-200">
        <thead>
          <tr>
            <th className="min-w-[240px]">Product</th>
            <th className="w-32">Quantity</th>
            <th className="w-32 text-right">On hand</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const product = products.find((entry) => entry.id === item.product_id)
            return (
              <tr key={index}>
                <td>
                  <Select
                    value={item.product_id}
                    onChange={(event) => update(index, { product_id: event.target.value })}
                  >
                    <option value="">Choose a product</option>
                    {products.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.sku} · {entry.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                    placeholder="0"
                    className="text-right"
                  />
                </td>
                <td className="text-right tabular-nums text-ink-500">
                  {product ? formatQuantity(product.quantity_on_hand) : '—'}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:bg-red-50"
                    title="Remove line"
                    onClick={() =>
                      onChange(
                        items.length > 1
                          ? items.filter((_, position) => position !== index)
                          : [{ product_id: '', quantity: '' }],
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </TableWrapper>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...items, { product_id: '', quantity: '' }])}
      >
        <Plus size={14} />
        Add line
      </Button>
    </div>
  )
}

function TransferFormModal({ open, onClose, locations, products, repo, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState({
    from_location_id: '',
    to_location_id: '',
    transfer_date: toDateInput(new Date()),
    notes: '',
    items: [{ product_id: '', quantity: '' }],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const first = locations[0]?.id || ''
    const second = locations.find((location) => location.id !== first)?.id || ''
    setForm({
      from_location_id: first,
      to_location_id: second,
      transfer_date: toDateInput(new Date()),
      notes: '',
      items: [{ product_id: '', quantity: '' }],
    })
    setError('')
  }, [open, locations])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.from_location_id || !form.to_location_id) {
      setError('Choose both the source and destination locations.')
      return
    }
    if (form.from_location_id === form.to_location_id) {
      setError('Source and destination must be different.')
      return
    }
    if (!form.items.some((item) => item.product_id && Number(item.quantity) > 0)) {
      setError('Add at least one product and quantity.')
      return
    }
    setBusy(true)
    try {
      await repo.transfers.create({
        ...form,
        items: form.items
          .filter((item) => item.product_id && Number(item.quantity) > 0)
          .map((item) => ({ product_id: item.product_id, quantity: Number(item.quantity) })),
      })
      toast.success('Stock transfer completed.')
      onCreated()
      onClose()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const totalUnits = form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New stock transfer"
      description="Move stock between branches or stores. The transfer posts immediately."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            <ArrowRightLeft size={15} />
            Complete transfer
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From location" required>
            <Select value={form.from_location_id} onChange={set('from_location_id')} required>
              <option value="">Source location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To location" required>
            <Select value={form.to_location_id} onChange={set('to_location_id')} required>
              <option value="">Destination location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Transfer date">
            <Input type="date" value={form.transfer_date} onChange={set('transfer_date')} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Reason, vehicle, driver..." />
          </Field>
        </div>

        <div>
          <p className="field-label">Items to move</p>
          <TransferItemsEditor
            items={form.items}
            onChange={(items) => setForm((current) => ({ ...current, items }))}
            products={products}
          />
        </div>

        <p className="text-xs text-ink-500">
          {formatQuantity(totalUnits)} units will be deducted from the source location and added to the destination.
          Total on hand shown is company-wide; the transfer will fail if the source location does not hold enough stock.
        </p>
      </form>
    </Modal>
  )
}

function TransferDetailModal({ open, onClose, transferId, repo, onDeleted }) {
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data, loading, error } = useAsyncData(
    () => (repo && transferId ? repo.transfers.get(transferId) : null),
    [repo, transferId, open],
    { enabled: Boolean(open && repo && transferId) },
  )

  async function remove() {
    setBusy(true)
    try {
      await repo.transfers.remove({ id: transferId })
      toast.success('Transfer deleted.')
      setConfirmDelete(false)
      onDeleted()
      onClose()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={data?.transfer_number ? `Transfer ${data.transfer_number}` : 'Stock transfer'}
        description={data ? `${data.from_location_name} to ${data.to_location_name}` : ''}
        size="lg"
        footer={
          data ? (
            <>
              {data.status !== 'completed' && (
                <Button variant="secondary" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} />
                  Delete
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
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
              <Badge tone="neutral">{formatDate(data.transfer_date)}</Badge>
              {data.created_by_name && <Badge tone="info">By {data.created_by_name}</Badge>}
            </div>

            <div className="flex items-center justify-center gap-4 rounded-lg bg-ink-50 p-4 text-center text-sm">
              <div className="flex-1">
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">From</p>
                <p className="mt-1 font-semibold text-ink-900">{data.from_location_name}</p>
              </div>
              <ArrowRight size={20} className="text-brand-600" />
              <div className="flex-1">
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">To</p>
                <p className="mt-1 font-semibold text-ink-900">{data.to_location_name}</p>
              </div>
            </div>

            <TableWrapper className="rounded-lg border border-ink-200">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Quantity</th>
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
                  </tr>
                ))}
              </tbody>
            </TableWrapper>

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
        loading={busy}
        title="Delete this transfer?"
        message="Only transfers that are not completed can be deleted."
        confirmLabel="Delete transfer"
      />
    </>
  )
}

export default function TransfersPage() {
  const repo = useRepository()
  const [filters, setFilters] = useState({ search: '', from: '', to: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [viewing, setViewing] = useState(null)

  const transfers = useAsyncData(
    () => (repo ? repo.transfers.list({ from: filters.from || undefined, to: filters.to || undefined }) : null),
    [repo, filters.from, filters.to],
    { enabled: Boolean(repo) },
  )
  const locations = useAsyncData(() => (repo ? repo.locations.list() : null), [repo], { enabled: Boolean(repo) })
  const products = useAsyncData(() => (repo ? repo.products.list({ status: 'active' }) : null), [repo], {
    enabled: Boolean(repo),
  })

  const list = transfers.data || []
  const visible = useMemo(
    () =>
      list.filter((transfer) =>
        matchesSearch(
          [transfer.transfer_number, transfer.from_location_name, transfer.to_location_name].join(' '),
          filters.search,
        ),
      ),
    [list, filters.search],
  )

  const stats = useMemo(() => {
    const completed = list.filter((transfer) => transfer.status === 'completed')
    const items = list.reduce((sum, transfer) => sum + Number(transfer.item_count || 0), 0)
    const thisMonth = list.filter(
      (transfer) => String(transfer.transfer_date).slice(0, 7) === toDateInput(new Date()).slice(0, 7),
    )
    const routes = new Set(list.map((transfer) => `${transfer.from_location_id}-${transfer.to_location_id}`))
    return { total: list.length, completed: completed.length, items, thisMonth: thisMonth.length, routes: routes.size }
  }, [list])

  function exportCsv() {
    downloadCsv(
      'stock-transfers',
      [
        { label: 'Transfer', value: (row) => row.transfer_number },
        { label: 'Date', value: (row) => row.transfer_date },
        { label: 'From', value: (row) => row.from_location_name },
        { label: 'To', value: (row) => row.to_location_name },
        { label: 'Items', value: (row) => row.item_count },
        { label: 'Status', value: (row) => row.status },
        { label: 'Notes', value: (row) => row.notes },
      ],
      visible,
    )
  }

  return (
    <div>
      <PageHeader
        title="Stock transfers"
        description="Move inventory between branches and keep per-location stock accurate."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={() => transfers.reload()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              New transfer
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Transfers" value={formatQuantity(stats.total)} hint={`${stats.completed} completed`} icon={ArrowRightLeft} />
        <StatCard label="This month" value={formatQuantity(stats.thisMonth)} hint="Transfers in the current month" icon={ArrowRightLeft} tone="sky" />
        <StatCard label="Line items moved" value={formatQuantity(stats.items)} hint="Across all transfers" icon={ArrowRight} tone="amber" />
        <StatCard label="Active routes" value={formatQuantity(stats.routes)} hint="Unique source to destination pairs" icon={ArrowRight} tone="green" />
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-end gap-2 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Search transfer number or location..."
            className="w-full sm:w-72"
          />
          <Field label="From" className="w-full sm:w-40">
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            />
          </Field>
          <Field label="To" className="w-full sm:w-40">
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            />
          </Field>
          {(filters.from || filters.to) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters((current) => ({ ...current, from: '', to: '' }))}>
              Clear dates
            </Button>
          )}
          <span className="ml-auto text-xs text-ink-500">{visible.length} transfers</span>
        </div>

        {transfers.error ? (
          <div className="p-6">
            <Alert tone="danger">{transfers.error}</Alert>
          </div>
        ) : transfers.loading && !transfers.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ArrowRightLeft}
            title={list.length ? 'No transfers match this view' : 'No stock transfers yet'}
            message={list.length ? 'Try a different search or date range.' : 'Move stock between locations when goods are shifted.'}
            action={
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={16} />
                New transfer
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Transfer</th>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th className="text-right">Items</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((transfer) => (
                <tr key={transfer.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setViewing(transfer.id)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {transfer.transfer_number}
                    </button>
                  </td>
                  <td>{formatDate(transfer.transfer_date)}</td>
                  <td>{transfer.from_location_name}</td>
                  <td>{transfer.to_location_name}</td>
                  <td className="text-right tabular-nums">{transfer.item_count}</td>
                  <td>
                    <StatusBadge status={transfer.status} />
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" title="View" onClick={() => setViewing(transfer.id)}>
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

      <TransferFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        locations={locations.data || []}
        products={products.data || []}
        repo={repo}
        onCreated={() => {
          transfers.reload()
          products.reload()
        }}
      />

      <TransferDetailModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        transferId={viewing}
        repo={repo}
        onDeleted={() => {
          transfers.reload()
          products.reload()
        }}
      />
    </div>
  )
}
