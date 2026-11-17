import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  Package,
  Plus,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData, useRepository } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Spinner, TableWrapper } from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { AreaChart } from '@/components/ui/Charts'
import { formatDate, formatMoney, formatNumber, formatQuantity, greetingFor } from '@/lib/utils'

const QUICK_ACTIONS = [
  { to: '/app/sales?new=1', label: 'New sale', icon: ReceiptText, hint: 'Cash or credit invoice', module: 'sales' },
  { to: '/app/quotations?new=1', label: 'New quotation', icon: ShoppingCart, hint: 'Send a priced quote', module: 'quotations' },
  { to: '/app/purchases?new=1', label: 'Record purchase', icon: Package, hint: 'Receive supplier stock', module: 'purchases' },
  { to: '/app/cashbook?new=1', label: 'Cashbook entry', icon: Wallet, hint: 'Expense or income', module: 'cashbook' },
]

export default function DashboardPage() {
  const repo = useRepository()
  const { user, company, can } = useAuth()
  const currency = company?.currency || 'USD'
  const { data, loading, error, reload } = useAsyncData(
    () => (repo ? repo.reports.dashboard() : null),
    [repo],
    { enabled: Boolean(repo) },
  )

  if (loading && !data) return <Spinner label="Loading dashboard..." />

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the dashboard"
          message={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </div>
    )
  }

  if (!data) return null

  const today = data.today
  const marginPercent = today.sales > 0 ? (today.margin / today.sales) * 100 : 0
  const firstName = String(user?.full_name || '').split(' ')[0] || 'there'
  const greeting = greetingFor(new Date())
  const quickActions = QUICK_ACTIONS.filter((action) => can(action.module))
  const canSell = can('sales')
  const canReport = can('reports')

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={`Welcome back. Here is how ${company?.name || 'Devolve'} is trading today, ${formatDate(new Date())}.`}
        actions={
          <>
            <Button variant="secondary" onClick={reload}>
              Refresh
            </Button>
            {canSell && (
              <ButtonLink to="/app/sales?new=1">
                <Plus size={16} />
                New sale
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales today"
          value={formatMoney(today.sales, currency)}
          hint={`${today.invoices} invoice${today.invoices === 1 ? '' : 's'} · ${formatQuantity(today.quantity)} units`}
          icon={Banknote}
          tone="brand"
        />
        <StatCard
          label="Gross margin today"
          value={formatMoney(today.margin, currency)}
          hint={`${marginPercent.toFixed(1)}% of sales · cost ${formatMoney(today.cost, currency)}`}
          icon={TrendingUp}
          tone="green"
        />
        <StatCard
          label="Money owed to you"
          value={formatMoney(data.receivables.total, currency)}
          hint={`${data.receivables.count} unpaid invoice${data.receivables.count === 1 ? '' : 's'}`}
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label="Cash position"
          value={formatMoney(data.cash_position, currency)}
          hint="Cashbook receipts less payments"
          icon={Wallet}
          tone={data.cash_position >= 0 ? 'sky' : 'red'}
        />
        <StatCard
          label="Stock at cost"
          value={formatMoney(data.inventory.cost_value, currency)}
          hint={`${data.inventory.sku_count} active SKUs · ${formatQuantity(data.inventory.quantity)} units`}
          icon={Package}
          tone="ink"
        />
        <StatCard
          label="Stock at retail"
          value={formatMoney(data.inventory.retail_value, currency)}
          hint="Value if everything sells at list price"
          icon={Package}
          tone="ink"
        />
        <StatCard
          label="Purchases today"
          value={formatMoney(today.purchases, currency)}
          hint={`${today.purchase_count} received order${today.purchase_count === 1 ? '' : 's'}`}
          icon={Package}
          tone="sky"
        />
        <StatCard
          label="Expenses today"
          value={formatMoney(today.expenses, currency)}
          hint={`${today.expense_count} cashbook payment${today.expense_count === 1 ? '' : 's'}`}
          icon={Wallet}
          tone="red"
        />
      </div>

      {(data.low_stock > 0 || data.expiring > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.low_stock > 0 && (
            <Card className="flex items-center gap-3 border-amber-200 bg-amber-50/70 px-4 py-3">
              <AlertTriangle size={18} className="text-amber-600" />
              <p className="flex-1 text-sm text-amber-900">
                <strong>{data.low_stock}</strong> product{data.low_stock === 1 ? '' : 's'} at or below reorder level.
              </p>
              {canReport && (
                <Link to="/app/reports?tab=low-stock" className="text-xs font-semibold text-amber-800 hover:underline">
                  Review
                </Link>
              )}
            </Card>
          )}
          {data.expiring > 0 && (
            <Card className="flex items-center gap-3 border-red-200 bg-red-50/70 px-4 py-3">
              <CalendarClock size={18} className="text-red-600" />
              <p className="flex-1 text-sm text-red-900">
                <strong>{data.expiring}</strong> product{data.expiring === 1 ? '' : 's'} expiring within 90 days.
              </p>
              {canReport && (
                <Link to="/app/reports?tab=expiring" className="text-xs font-semibold text-red-800 hover:underline">
                  Review
                </Link>
              )}
            </Card>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Sales over the last 14 days"
            description="Invoiced value, excluding voided invoices."
            actions={<Badge tone="brand">{currency}</Badge>}
          />
          <div className="px-4 pt-4 pb-2">
            <AreaChart
              data={data.trend}
              series={[{ key: 'revenue', label: 'Revenue', color: 'var(--color-brand-600)' }]}
              formatValue={(value) => `${currency} ${formatNumber(Math.round(value))}`}
              currency={currency}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Quick actions" description="Jump straight into the work." />
          {quickActions.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No modules assigned"
              message="Ask your administrator to give you access to the pages you need."
            />
          ) : (
          <ul className="divide-y divide-ink-100">
            {quickActions.map((action) => (
              <li key={action.to}>
                <Link
                  to={action.to}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <action.icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-800">{action.label}</span>
                    <span className="block text-[11px] text-ink-500">{action.hint}</span>
                  </span>
                  <ArrowRight size={15} className="text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent invoices"
            description="The latest sales activity."
            actions={
              canSell && (
                <Link to="/app/sales" className="text-xs font-semibold text-brand-700 hover:underline">
                  View all
                </Link>
              )
            }
          />
          {data.recent_invoices.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No invoices yet"
              message="Your first sale will appear here."
              action={canSell ? <ButtonLink to="/app/sales?new=1">Create an invoice</ButtonLink> : null}
            />
          ) : (
            <TableWrapper>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      {canSell ? (
                        <Link
                          to={`/app/sales?invoice=${invoice.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {invoice.invoice_number}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink-800">{invoice.invoice_number}</span>
                      )}
                    </td>
                    <td>{invoice.customer_name}</td>
                    <td>{formatDate(invoice.issue_date)}</td>
                    <td className="text-right tabular-nums">{formatMoney(invoice.total_amount, currency)}</td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>

        <Card>
          <CardHeader title="Best sellers" description="Revenue over the last 30 days." />
          {data.top_products.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="No sales data yet" message="Best sellers appear after a few invoices." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.top_products.map((product, index) => (
                <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{product.name}</p>
                    <p className="text-[11px] text-ink-500">
                      {product.sku} · {formatQuantity(product.quantity)} sold
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(product.revenue, currency)}</p>
                    <p className="text-[11px] text-ink-400 tabular-nums">
                      margin {formatMoney(Number(product.revenue) - Number(product.cost), currency)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
