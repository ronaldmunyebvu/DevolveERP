import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, Search, Trash2 } from 'lucide-react'
import { Button, Input, TableWrapper } from '@/components/ui'
import { formatMoney, formatQuantity } from '@/lib/utils'

function ProductPicker({ value, products, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState(null)
  const buttonRef = useRef(null)
  const popoverRef = useRef(null)

  const selected = products.find((product) => product.id === value)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return products
    return products.filter((product) =>
      `${product.sku || ''} ${product.name || ''}`.toLowerCase().includes(needle),
    )
  }, [products, query])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const bounds = buttonRef.current?.getBoundingClientRect()
    if (!bounds) return
    setRect(bounds)
    setQuery('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    function updateRect() {
      const bounds = buttonRef.current?.getBoundingClientRect()
      if (bounds) setRect(bounds)
    }
    function onPointerDown(event) {
      if (popoverRef.current?.contains(event.target)) return
      if (buttonRef.current?.contains(event.target)) return
      setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [open])

  function choose(productId) {
    onChange(productId)
    setOpen(false)
  }

  const openUp = rect ? window.innerHeight - rect.bottom < 280 && rect.top > 280 : false
  const width = rect ? Math.min(Math.max(rect.width, 280), window.innerWidth - 16) : 280
  const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) : 8
  const available = rect
    ? openUp
      ? rect.top - 24
      : window.innerHeight - rect.bottom - 24
    : 240
  const listHeight = Math.max(120, Math.min(304, available - 52))

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-left text-sm text-ink-800 shadow-xs transition hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      >
        <span className={selected ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate text-ink-400'}>
          {selected ? `${selected.sku} · ${selected.name}` : 'Choose a product'}
        </span>
        <ChevronDown size={15} className="shrink-0 text-ink-400" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: openUp ? undefined : rect.bottom + 4,
              bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
              left,
              width,
              zIndex: 1000,
            }}
            className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex items-center gap-2 border-b border-ink-200 px-2.5 py-2">
              <Search size={15} className="shrink-0 text-ink-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filtered[0]) {
                    event.preventDefault()
                    choose(filtered[0].id)
                  }
                }}
                placeholder="Search by SKU or name..."
                className="h-7 min-w-0 flex-1 bg-transparent text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none"
              />
            </div>
            <ul style={{ maxHeight: listHeight }} className="overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-ink-500">No matching products</li>
              ) : (
                filtered.map((product) => {
                  const active = product.id === value
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => choose(product.id)}
                        className={
                          active
                            ? 'flex w-full items-center gap-2 bg-brand-50 px-3 py-2 text-left text-sm'
                            : 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50'
                        }
                      >
                        <span className="grid h-4 w-4 shrink-0 place-items-center text-brand-600">
                          {active && <Check size={14} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink-800">{product.name}</span>
                          <span className="block truncate text-[11px] text-ink-500">
                            {product.sku}
                            {product.selling_price != null
                              ? ` · ${formatMoney(product.selling_price)}`
                              : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}

export function newLine(priceKey = 'unit_price') {
  return {
    product_id: '',
    name: '',
    description: '',
    quantity: '',
    [priceKey]: '',
    expiry_date: '',
    is_manual: false,
  }
}

export function LineItemsEditor({
  items,
  onChange,
  products,
  priceKey = 'unit_price',
  priceLabel = 'Unit price',
  showExpiry = false,
  allowManual = false,
  currency = 'USD',
  quantityLabel = 'Qty',
}) {
  function update(index, patch) {
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)))
  }

  function chooseProduct(index, productId) {
    const product = products.find((entry) => entry.id === productId)
    const patch = { product_id: productId, name: '', is_manual: false }
    if (product) {
      if (priceKey === 'unit_cost') {
        patch.unit_cost = product.cost_price ?? ''
      } else {
        patch.unit_price = product.selling_price ?? ''
      }
      patch.description = ''
      if (showExpiry) {
        patch.expiry_date = product.expiry_date ? String(product.expiry_date).slice(0, 10) : ''
      }
    }
    update(index, patch)
  }

  function remove(index) {
    if (items.length <= 1) {
      onChange([newLine(priceKey)])
      return
    }
    onChange(items.filter((_, position) => position !== index))
  }

  return (
    <div>
      <TableWrapper className="rounded-lg border border-ink-200">
        <thead>
          <tr>
            <th className="min-w-[220px]">{allowManual ? 'Product / item' : 'Product'}</th>
            <th className="w-28">{quantityLabel}</th>
            <th className="w-32">{priceLabel}</th>
            {showExpiry && <th className="w-36">Expiry</th>}
            <th className="w-32 text-right">Line total</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const lineTotal = Number(item.quantity || 0) * Number(item[priceKey] || 0)
            return (
              <tr key={index}>
                <td>
                  {allowManual && item.is_manual ? (
                    <>
                      <Input
                        value={item.name || ''}
                        onChange={(event) => update(index, { name: event.target.value })}
                        placeholder="Product name"
                        aria-label={`Manual item name for line ${index + 1}`}
                      />
                      <Input
                        value={item.description || ''}
                        onChange={(event) => update(index, { description: event.target.value })}
                        placeholder="Description (optional)"
                        aria-label={`Manual item description for line ${index + 1}`}
                        className="mt-1.5 h-8 text-xs"
                      />
                    </>
                  ) : (
                    <>
                      <ProductPicker
                        value={item.product_id || ''}
                        products={products}
                        onChange={(productId) => chooseProduct(index, productId)}
                      />
                      <Input
                        value={item.description || ''}
                        onChange={(event) => update(index, { description: event.target.value })}
                        placeholder="Optional line description"
                        className="mt-1.5 h-8 text-xs"
                      />
                    </>
                  )}
                </td>
                <td>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                    aria-label={`Quantity for line ${index + 1}`}
                    className="relative z-10 bg-white text-right"
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={item[priceKey]}
                    onChange={(event) => update(index, { [priceKey]: event.target.value })}
                    aria-label={`${priceLabel} for line ${index + 1}`}
                    className="relative z-10 bg-white text-right"
                  />
                </td>
                {showExpiry && (
                  <td>
                    <Input
                      type="date"
                      value={item.expiry_date || ''}
                      onChange={(event) => update(index, { expiry_date: event.target.value })}
                    />
                  </td>
                )}
                <td className="text-right font-medium tabular-nums">
                  {formatMoney(lineTotal, currency)}
                  <p className="text-[10px] text-ink-400">{formatQuantity(item.quantity || 0)} units</p>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    title="Remove line"
                    className="text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={15} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </TableWrapper>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange([...items, newLine(priceKey)])}
        >
          <Plus size={14} />
          Add line
        </Button>
        {allowManual && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange([...items, { ...newLine(priceKey), is_manual: true }])}
          >
            <Plus size={14} />
            Add manual item
          </Button>
        )}
      </div>
      {allowManual && (
        <p className="mt-1.5 text-xs text-ink-500">
          Pick products from stock or enter items that are not in the database, with your own prices.
        </p>
      )}
    </div>
  )
}
