import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, FileText, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData, useRepository } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Spinner,
  TableWrapper,
} from '@/components/ui'
import { SaleDetailModal, SaleFormModal } from '@/pages/app/SalesPage'
import { formatDate, formatMoney, matchesSearch } from '@/lib/utils'

export default function DeliveryNotesPage() {
  const repo = useRepository()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
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
    if (searchParams.get('new') !== '1') return
    setFormOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const list = useMemo(() => (sales.data || []).filter((sale) => sale.is_delivery_note), [sales.data])
  const visible = useMemo(
    () =>
      list.filter((sale) =>
        matchesSearch([sale.invoice_number, sale.customer_name].join(' '), search),
      ),
    [list, search],
  )

  function refreshAll() {
    sales.reload()
    customers.reload()
    products.reload()
    locations.reload()
  }

  function closeDetail() {
    setViewing(null)
  }

  return (
    <div>
      <PageHeader
        title="Delivery notes"
        description="Record goods leaving the business without creating a sales invoice."
        actions={
          <>
            <Button variant="secondary" onClick={refreshAll}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              New delivery note
            </Button>
          </>
        }
      />

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search delivery note or customer..."
            className="w-full sm:w-80"
          />
          <span className="ml-auto text-xs text-ink-500">{visible.length} delivery notes</span>
        </div>

        {sales.error ? (
          <div className="p-6">
            <Alert tone="danger">{sales.error}</Alert>
          </div>
        ) : sales.loading && !sales.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={list.length ? 'No delivery notes match your search' : 'No delivery notes yet'}
            message={
              list.length
                ? 'Try a different search.'
                : 'Create a delivery note to record what left the business.'
            }
            action={
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={16} />
                New delivery note
              </Button>
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Delivery note</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Location</th>
                <th className="text-right">Total</th>
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
                  <td>{sale.location_name || '—'}</td>
                  <td className="text-right font-medium tabular-nums">
                    {formatMoney(sale.total_amount, currency)}
                  </td>
                  <td>{sale.status}</td>
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
        deliveryNote
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
