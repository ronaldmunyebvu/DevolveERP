import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Barcode,
  Boxes,
  Download,
  Eye,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
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
import {
  PRODUCT_UNITS,
  cn,
  downloadCsv,
  formatDate,
  formatMoney,
  formatQuantity,
  matchesSearch,
  titleCase,
} from '@/lib/utils'

const EMPTY_PRODUCT = {
  name: '',
  sku: '',
  barcode: '',
  category_id: '',
  brand: '',
  unit: 'pc',
  cost_price: '',
  selling_price: '',
  reorder_level: '',
  opening_quantity: '',
  location_id: '',
  tags: '',
  status: 'active',
  description: '',
}

function ProductFormModal({ open, onClose, product, categories, locations, repo, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_PRODUCT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    if (product) {
      setForm({
        ...EMPTY_PRODUCT,
        ...product,
        tags: Array.isArray(product.tags) ? product.tags.join(', ') : product.tags || '',
      })
    } else {
      const defaultLocation = locations.find((location) => location.is_default) || locations[0]
      setForm({ ...EMPTY_PRODUCT, location_id: defaultLocation?.id || '' })
    }
  }, [open, product, locations])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function generateSku() {
    if (!repo) return
    setGenerating(true)
    try {
      const sku = await repo.products.nextSku({ category_id: form.category_id || undefined })
      setForm((current) => ({ ...current, sku }))
    } catch (cause) {
      setError(cause.message)
    } finally {
      setGenerating(false)
    }
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Enter the product name.')
      return
    }
    if (!form.sku.trim()) {
      setError('Give the product an SKU or generate one.')
      return
    }
    if (!form.location_id) {
      setError('Choose the location that holds this stock.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        ...form,
        cost_price: Number(form.cost_price) || 0,
        selling_price: Number(form.selling_price) || 0,
        reorder_level: Number(form.reorder_level) || 0,
        opening_quantity: Number(form.opening_quantity) || 0,
        tags: form.tags,
      }
      if (product) {
        await repo.products.update({ ...payload, id: product.id })
        toast.success('Product updated.')
      } else {
        await repo.products.create(payload)
        toast.success('Product added to inventory.')
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
      title={product ? 'Edit product' : 'New product'}
      description="SKU, pricing, stock location and reorder settings."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Product name" required className="sm:col-span-2">
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Toyota Hilux front brake pads" required />
          </Field>
          <Field label="SKU" required hint="Unique code used on invoices and stock reports.">
            <div className="flex gap-2">
              <Input value={form.sku} onChange={set('sku')} placeholder="BRK-0001" required />
              <Button variant="secondary" onClick={generateSku} loading={generating} className="shrink-0">
                Generate
              </Button>
            </div>
          </Field>
          <Field label="Barcode">
            <Input value={form.barcode} onChange={set('barcode')} placeholder="Scan or type a barcode" />
          </Field>
          <Field label="Category">
            <Select value={form.category_id || ''} onChange={set('category_id')}>
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand / make">
            <Input value={form.brand} onChange={set('brand')} placeholder="e.g. Bosch" />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={set('unit')}>
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {titleCase(unit)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stock location" required>
            <Select value={form.location_id} onChange={set('location_id')} required>
              <option value="">Choose a location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cost price">
            <Input type="number" min="0" step="0.01" value={form.cost_price} onChange={set('cost_price')} placeholder="0.00" />
          </Field>
          <Field label="Retail price">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.selling_price}
              onChange={set('selling_price')}
              placeholder="0.00"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {!product && (
            <Field label="Opening quantity" hint="Current quantity on hand.">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={form.opening_quantity}
                onChange={set('opening_quantity')}
                placeholder="0"
              />
            </Field>
          )}
          <Field label="Reorder level" hint="Alert when stock reaches this level.">
            <Input
              type="number"
              min="0"
              step="0.001"
              value={form.reorder_level}
              onChange={set('reorder_level')}
              placeholder="0"
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="discontinued">Discontinued</option>
            </Select>
          </Field>
        </div>

        <Field label="Tags" hint="Comma separated, e.g. toyota, brakes, front.">
          <Input value={form.tags} onChange={set('tags')} placeholder="toyota, brakes, front" />
        </Field>

        <Field label="Description">
          <Textarea value={form.description} onChange={set('description')} placeholder="Fitment notes, part numbers, supplier details..." />
        </Field>
      </form>
    </Modal>
  )
}

function AdjustStockModal({ open, onClose, product, locations, repo, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ quantity_delta: '', location_id: '', movement_type: 'adjustment', unit_cost: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !product) return
    setError('')
    setForm({
      quantity_delta: '',
      location_id: product.location_id || locations.find((location) => location.is_default)?.id || locations[0]?.id || '',
      movement_type: 'adjustment',
      unit_cost: product.cost_price ?? '',
      notes: '',
    })
  }, [open, product, locations])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    const delta = Number(form.quantity_delta)
    if (!delta) {
      setError('Enter a quantity to add (positive) or remove (negative).')
      return
    }
    setBusy(true)
    try {
      await repo.products.adjust({
        product_id: product.id,
        quantity_delta: delta,
        location_id: form.location_id,
        movement_type: form.movement_type,
        unit_cost: Number(form.unit_cost) || 0,
        notes: form.notes,
      })
      toast.success('Stock adjusted.')
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
      title="Adjust stock"
      description={product ? `${product.name} · currently ${formatQuantity(product.quantity_on_hand)} ${product.unit}` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Post adjustment
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Alert tone="info">
          Use a positive number to add stock and a negative number to remove it. Double-check the location.
        </Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantity change" required>
            <Input
              type="number"
              step="0.001"
              value={form.quantity_delta}
              onChange={set('quantity_delta')}
              placeholder="e.g. 10 or -2"
              required
            />
          </Field>
          <Field label="Location" required>
            <Select value={form.location_id} onChange={set('location_id')}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason">
            <Select value={form.movement_type} onChange={set('movement_type')}>
              <option value="adjustment">Stock count / correction</option>
              <option value="damage">Damage / write-off</option>
            </Select>
          </Field>
          <Field label="Unit cost">
            <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={set('unit_cost')} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="What caused this adjustment?" />
        </Field>
      </form>
    </Modal>
  )
}

function ProductDetailModal({ open, onClose, product, repo, currency }) {
  const { data, loading, error } = useAsyncData(
    () =>
      repo && product
        ? Promise.all([repo.products.get(product.id), repo.products.movements(product.id, 100)]).then(
            ([detail, movements]) => ({ ...detail, movements }),
          )
        : null,
    [repo, product?.id, open],
    { enabled: Boolean(open && repo && product) },
  )

  return (
    <Modal open={open} onClose={onClose} title={product?.name || 'Product'} description={product?.sku} size="lg">
      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="danger">{error}</Alert>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-[11px] text-ink-500">On hand</p>
              <p className="text-lg font-semibold">{formatQuantity(data?.quantity_on_hand)} {data?.unit}</p>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-[11px] text-ink-500">Cost</p>
              <p className="text-lg font-semibold">{formatMoney(data?.cost_price, currency)}</p>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-[11px] text-ink-500">Retail</p>
              <p className="text-lg font-semibold">{formatMoney(data?.selling_price, currency)}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Stock by location</h3>
              {(data?.levels || []).length === 0 ? (
                <p className="text-sm text-ink-500">No stock recorded at any location.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.levels.map((level) => (
                    <li key={level.location_id} className="flex justify-between text-sm">
                      <span className="text-ink-600">{level.location_name}</span>
                      <span className="font-medium tabular-nums">{formatQuantity(level.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Product details</h3>
              <dl className="space-y-1.5 text-sm">
                {[
                  ['Category', data?.category_name],
                  ['Brand', data?.brand],
                  ['Barcode', data?.barcode],
                  ['Reorder level', data?.reorder_level != null ? formatQuantity(data.reorder_level) : null],
                  ['Tags', (data?.tags || []).join(', ')],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="text-right font-medium text-ink-800">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Recent stock movements</h3>
            <div className="max-h-72 overflow-auto rounded-lg border border-ink-200">
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th className="text-right">Change</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.movements || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-ink-500">
                        No movements yet.
                      </td>
                    </tr>
                  ) : (
                    data.movements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDate(movement.created_at)}</td>
                        <td>
                          <Badge tone={Number(movement.quantity_delta) >= 0 ? 'success' : 'warning'} size="sm">
                            {titleCase(movement.movement_type)}
                          </Badge>
                        </td>
                        <td>{movement.location_name || '—'}</td>
                        <td
                          className={cn(
                            'text-right font-medium tabular-nums',
                            Number(movement.quantity_delta) >= 0 ? 'text-emerald-700' : 'text-red-700',
                          )}
                        >
                          {Number(movement.quantity_delta) > 0 ? '+' : ''}
                          {formatQuantity(movement.quantity_delta)}
                        </td>
                        <td>{movement.reference_no || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </TableWrapper>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function InventoryPage() {
  const repo = useRepository()
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [filters, setFilters] = useState({ search: '', category_id: '', status: '', lowOnly: false })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const products = useAsyncData(() => (repo ? repo.products.list() : null), [repo], { enabled: Boolean(repo) })
  const categories = useAsyncData(() => (repo ? repo.categories.list() : null), [repo], { enabled: Boolean(repo) })
  const locations = useAsyncData(() => (repo ? repo.locations.list() : null), [repo], { enabled: Boolean(repo) })

  const list = products.data || []
  const visible = useMemo(
    () =>
      list.filter((product) => {
        if (filters.category_id && product.category_id !== filters.category_id) return false
        if (filters.status && product.status !== filters.status) return false
        if (filters.lowOnly && !product.low_stock) return false
        return matchesSearch(
          [product.name, product.sku, product.barcode, product.brand, (product.tags || []).join(' ')].join(' '),
          filters.search,
        )
      }),
    [list, filters],
  )

  const stats = useMemo(() => {
    const active = list.filter((product) => product.status === 'active')
    return {
      skus: active.length,
      quantity: active.reduce((sum, product) => sum + Number(product.quantity_on_hand || 0), 0),
      cost: active.reduce((sum, product) => sum + Number(product.quantity_on_hand || 0) * Number(product.cost_price || 0), 0),
      retail: active.reduce(
        (sum, product) => sum + Number(product.quantity_on_hand || 0) * Number(product.selling_price || 0),
        0,
      ),
      low: active.filter((product) => product.low_stock).length,
    }
  }, [list])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(product) {
    setEditing(product)
    setFormOpen(true)
  }

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await repo.products.remove({ id: deleting.id })
      toast.success('Product deleted.')
      setDeleting(null)
      products.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  function exportCsv() {
    downloadCsv(
      'inventory',
      [
        { label: 'SKU', value: (row) => row.sku },
        { label: 'Name', value: (row) => row.name },
        { label: 'Category', value: (row) => row.category_name },
        { label: 'Brand', value: (row) => row.brand },
        { label: 'Location', value: (row) => row.location_name },
        { label: 'Quantity', value: (row) => row.quantity_on_hand },
        { label: 'Reorder level', value: (row) => row.reorder_level },
        { label: 'Cost price', value: (row) => row.cost_price },
        { label: 'Selling price', value: (row) => row.selling_price },
        { label: 'Cost value', value: (row) => Number(row.quantity_on_hand) * Number(row.cost_price) },
        { label: 'Status', value: (row) => row.status },
      ],
      visible,
    )
  }

  const categoryOptions = categories.data || []
  const locationOptions = locations.data || []

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Everything you buy, store and sell, with cost, pricing and stock levels."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              <Download size={15} />
              Export
            </Button>
            <Button variant="secondary" onClick={products.reload}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={openNew}>
              <Plus size={16} />
              New product
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active SKUs" value={formatQuantity(stats.skus)} hint={`${list.length} total products`} icon={Boxes} />
        <StatCard label="Units on hand" value={formatQuantity(stats.quantity)} hint="Across all locations" icon={PackagePlus} tone="sky" />
        <StatCard label="Stock at cost" value={formatMoney(stats.cost, currency)} hint="Your capital in stock" icon={Barcode} tone="ink" />
        <StatCard
          label="Low stock"
          value={formatQuantity(stats.low)}
          hint="At or below reorder level"
          icon={AlertTriangle}
          tone={stats.low > 0 ? 'amber' : 'green'}
        />
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Search name, SKU, barcode, brand or tag..."
            className="w-full sm:w-80"
          />
          <Select
            value={filters.category_id}
            onChange={(event) => setFilters((current) => ({ ...current, category_id: event.target.value }))}
            className="w-full sm:w-48"
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="w-full sm:w-40"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="discontinued">Discontinued</option>
          </Select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={filters.lowOnly}
              onChange={(event) => setFilters((current) => ({ ...current, lowOnly: event.target.checked }))}
              className="h-4 w-4 accent-brand-600"
            />
            Low stock only
          </label>
          <span className="ml-auto text-xs text-ink-500">
            {visible.length} of {list.length} products
          </span>
        </div>

        {products.error ? (
          <div className="p-6">
            <Alert tone="danger">{products.error}</Alert>
          </div>
        ) : products.loading && !products.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={list.length ? 'No products match these filters' : 'No products yet'}
            message={
              list.length
                ? 'Try a different search term or clear the filters.'
                : 'Add your first spare part to start tracking stock and selling.'
            }
            action={
              list.length ? (
                <Button variant="secondary" onClick={() => setFilters({ search: '', category_id: '', status: '', lowOnly: false })}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={openNew}>
                  <Plus size={16} />
                  Add a product
                </Button>
              )
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Location</th>
                <th className="text-right">On hand</th>
                <th className="text-right">Reorder</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Retail</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setViewing(product)}
                      className="text-left font-medium text-ink-900 hover:text-brand-700"
                    >
                      {product.name}
                    </button>
                    <p className="text-[11px] text-ink-500">
                      {product.sku}
                      {product.brand ? ` · ${product.brand}` : ''}
                    </p>
                  </td>
                  <td>{product.category_name || '—'}</td>
                  <td>{product.location_name || '—'}</td>
                  <td className="text-right">
                    <span className={cn('font-medium tabular-nums', product.low_stock && 'text-amber-700')}>
                      {formatQuantity(product.quantity_on_hand)} {product.unit}
                    </span>
                    {product.low_stock && (
                      <p className="text-[10px] font-semibold text-amber-700 uppercase">Low</p>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{formatQuantity(product.reorder_level)}</td>
                  <td className="text-right tabular-nums">{formatMoney(product.cost_price, currency)}</td>
                  <td className="text-right tabular-nums">{formatMoney(product.selling_price, currency)}</td>
                  <td>
                    <StatusBadge status={product.status} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="View" onClick={() => setViewing(product)}>
                        <Eye size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" title="Adjust stock" onClick={() => setAdjusting(product)}>
                        <SlidersHorizontal size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(product)}>
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setDeleting(product)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        product={editing}
        categories={categoryOptions}
        locations={locationOptions}
        repo={repo}
        onSaved={() => {
          products.reload()
          categories.reload()
        }}
      />

      <AdjustStockModal
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        product={adjusting}
        locations={locationOptions}
        repo={repo}
        onSaved={products.reload}
      />

      <ProductDetailModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        product={viewing}
        repo={repo}
        currency={currency}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete product?"
        message={
          deleting
            ? `Delete ${deleting.name}?`
            : ''
        }
        confirmLabel="Delete product"
      />
    </div>
  )
}
