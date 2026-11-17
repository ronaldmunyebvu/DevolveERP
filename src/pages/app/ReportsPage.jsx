import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  HandCoins,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData, useRepository } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  TableWrapper,
  Tabs,
} from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import { AreaChart, BarList } from '@/components/ui/Charts'
import {
  downloadCsv,
  formatDate,
  formatMoney,
  formatNumber,
  formatQuantity,
  titleCase,
  toDateInput,
} from '@/lib/utils'

const TABS = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'stock', label: 'Stock movement' },
  { value: 'valuation', label: 'Valuation' },
  { value: 'margins', label: 'Margins' },
  { value: 'receivables', label: 'Receivables' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'low-stock', label: 'Low stock' },
  { value: 'expiring', label: 'Expiring' },
]

const DATE_TABS = ['sales', 'purchases', 'stock', 'margins', 'expenses']

function ReportTable({ head, children, empty }) {
  return (
    <TableWrapper>
      <thead>
        <tr>
          {head.map((label) => (
            <th key={label} className={label.startsWith('#') ? 'text-right' : ''}>
              {label.replace(/^#/, '')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {children || (
          <tr>
            <td colSpan={head.length} className="py-10 text-center text-sm text-ink-500">
              {empty || 'No rows for this report.'}
            </td>
          </tr>
        )}
      </tbody>
    </TableWrapper>
  )
}

function SalesReport({ data, currency }) {
  const rows = data.rows || []
  const totals = data.totals || {}
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatMoney(totals.sales, currency)} hint={`${totals.invoices || 0} invoices`} icon={TrendingUp} tone="green" />
        <StatCard label="Cost of goods" value={formatMoney(totals.cost, currency)} hint={`${formatQuantity(totals.quantity)} units sold`} icon={ShoppingCart} tone="amber" />
        <StatCard label="Gross margin" value={formatMoney(totals.margin, currency)} hint={totals.sales ? `${((totals.margin / totals.sales) * 100).toFixed(1)}% margin` : 'No sales'} icon={Percent} tone="sky" />
        <StatCard label="Average sale" value={formatMoney(totals.invoices ? totals.sales / totals.invoices : 0, currency)} hint="Per invoice" icon={Receipt} />
      </div>
      <Card className="mt-4">
        <CardHeader title="Daily sales" description="Revenue for each day in the selected period." />
        <div className="p-4">
          {rows.length ? (
            <AreaChart
              data={rows}
              series={[{ key: 'sales', label: 'Sales' }]}
              formatValue={(value) => formatNumber(Math.round(value))}
              currency={currency}
            />
          ) : (
            <EmptyState icon={TrendingUp} title="No sales in this period" message="Change the date range or create an invoice." />
          )}
        </div>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Sales by day" />
        <ReportTable head={['Date', 'Invoices', '#Quantity', '#Sales', '#Cost', '#Margin', '#Margin %']}>
          {rows.map((row) => (
            <tr key={row.date}>
              <td>{formatDate(row.date)}</td>
              <td>{row.invoices}</td>
              <td className="text-right tabular-nums">{formatQuantity(row.quantity)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.sales, currency)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.cost, currency)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.margin, currency)}</td>
              <td className="text-right tabular-nums">{row.margin_percent}%</td>
            </tr>
          ))}
        </ReportTable>
      </Card>
    </>
  )
}

function PurchasesReport({ data, currency }) {
  const rows = data.rows || []
  const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Purchases" value={formatMoney(data.total, currency)} hint="Received purchase orders" icon={ShoppingCart} tone="amber" />
        <StatCard label="Orders" value={formatNumber(totalOrders)} hint="Received in this period" icon={Package} />
        <StatCard label="Average order" value={formatMoney(totalOrders ? data.total / totalOrders : 0, currency)} hint="Per purchase order" icon={Receipt} tone="sky" />
        <StatCard label="Active days" value={formatNumber(rows.length)} hint="Days with purchases" icon={CalendarClock} tone="green" />
      </div>
      <Card className="mt-4">
        <CardHeader title="Daily purchases" description="Goods received by day." />
        <div className="p-4">
          {rows.length ? (
            <AreaChart
              data={rows}
              series={[{ key: 'total', label: 'Purchases' }]}
              formatValue={(value) => formatNumber(Math.round(value))}
              currency={currency}
            />
          ) : (
            <EmptyState icon={ShoppingCart} title="No purchases in this period" message="Receive a purchase order to see it here." />
          )}
        </div>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Purchases by day" />
        <ReportTable head={['Date', '#Orders', '#Total']}>
          {rows.map((row) => (
            <tr key={row.date}>
              <td>{formatDate(row.date)}</td>
              <td className="text-right tabular-nums">{row.orders}</td>
              <td className="text-right tabular-nums">{formatMoney(row.total, currency)}</td>
            </tr>
          ))}
        </ReportTable>
      </Card>
    </>
  )
}

function StockReport({ data }) {
  const rows = data.rows || []
  const stockIn = rows.reduce((sum, row) => sum + Number(row.stock_in || 0), 0)
  const stockOut = rows.reduce((sum, row) => sum + Number(row.stock_out || 0), 0)
  const closing = rows.length ? rows[rows.length - 1].closing : data.opening
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Opening stock" value={formatQuantity(data.opening)} hint="Units before the period" icon={Warehouse} />
        <StatCard label="Stock in" value={formatQuantity(stockIn)} hint="Received and transferred in" icon={TrendingUp} tone="green" />
        <StatCard label="Stock out" value={formatQuantity(stockOut)} hint="Sold and transferred out" icon={ShoppingCart} tone="red" />
        <StatCard label="Closing stock" value={formatQuantity(closing)} hint="Units at the end of the period" icon={Package} tone="sky" />
      </div>
      <Card className="mt-4">
        <CardHeader title="Stock movement by day" description="Opening balance plus daily inflows and outflows." />
        <ReportTable head={['Date', '#Stock in', '#Stock out', '#Closing']}>
          {rows.map((row) => (
            <tr key={row.date}>
              <td>{formatDate(row.date)}</td>
              <td className="text-right tabular-nums text-emerald-700">{formatQuantity(row.stock_in)}</td>
              <td className="text-right tabular-nums text-brand-700">{formatQuantity(row.stock_out)}</td>
              <td className="text-right font-medium tabular-nums">{formatQuantity(row.closing)}</td>
            </tr>
          ))}
        </ReportTable>
      </Card>
    </>
  )
}

function ValuationReport({ data, currency }) {
  const rows = data.rows || []
  const totals = data.totals || {}
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock at cost" value={formatMoney(totals.cost_value, currency)} hint={`${formatQuantity(totals.quantity)} units`} icon={Warehouse} />
        <StatCard label="Stock at retail" value={formatMoney(totals.retail_value, currency)} hint="If sold at current prices" icon={TrendingUp} tone="green" />
        <StatCard label="Potential margin" value={formatMoney(totals.potential_margin, currency)} hint="Retail less cost" icon={Percent} tone="sky" />
        <StatCard label="Products" value={formatNumber(rows.length)} hint="Active products valued" icon={Package} tone="amber" />
      </div>
      <Card className="mt-4">
        <CardHeader title="Inventory valuation" description="Every active product at its current cost and selling price." />
        <ReportTable head={['Product', 'SKU', 'Category', '#Qty', '#Cost', '#Selling', '#Cost value', '#Retail value', '#Margin']}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium text-ink-800">{row.name}</td>
              <td className="text-ink-500">{row.sku}</td>
              <td>{row.category_name || '—'}</td>
              <td className="text-right tabular-nums">{formatQuantity(row.quantity)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.cost_price, currency)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.selling_price, currency)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.cost_value, currency)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.retail_value, currency)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.potential_margin, currency)}</td>
            </tr>
          ))}
        </ReportTable>
      </Card>
    </>
  )
}

function MarginsReport({ data, currency }) {
  const rows = data.rows || []
  const revenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)
  const cost = rows.reduce((sum, row) => sum + Number(row.cost || 0), 0)
  const margin = revenue - cost
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(revenue, currency)} hint="From invoice lines" icon={TrendingUp} tone="green" />
        <StatCard label="Cost of goods" value={formatMoney(cost, currency)} hint="At the cost captured on each sale" icon={ShoppingCart} tone="amber" />
        <StatCard label="Gross margin" value={formatMoney(margin, currency)} hint={revenue ? `${((margin / revenue) * 100).toFixed(1)}% margin` : 'No sales'} icon={Percent} tone="sky" />
        <StatCard label="Products sold" value={formatNumber(rows.length)} hint="With sales in this period" icon={Package} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Margins by product" />
          <ReportTable head={['Product', 'SKU', '#Qty', '#Revenue', '#Cost', '#Margin', '#Margin %']}>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium text-ink-800">{row.name}</td>
                <td className="text-ink-500">{row.sku}</td>
                <td className="text-right tabular-nums">{formatQuantity(row.quantity)}</td>
                <td className="text-right tabular-nums">{formatMoney(row.revenue, currency)}</td>
                <td className="text-right tabular-nums">{formatMoney(row.cost, currency)}</td>
                <td className="text-right tabular-nums">{formatMoney(row.margin, currency)}</td>
                <td className="text-right tabular-nums">{row.margin_percent}%</td>
              </tr>
            ))}
          </ReportTable>
        </Card>
        <Card>
          <CardHeader title="Top margin products" />
          <div className="p-4">
            <BarList
              items={[...rows]
                .sort((a, b) => b.margin - a.margin)
                .slice(0, 8)
                .map((row) => ({ label: row.name, value: row.margin }))}
              formatValue={(value) => formatMoney(value, currency)}
              emptyLabel="No product margins yet"
            />
          </div>
        </Card>
      </div>
    </>
  )
}

function ReceivablesReport({ data, currency }) {
  const rows = data.rows || []
  const buckets = data.buckets || {}
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding" value={formatMoney(data.total, currency)} hint={`${rows.length} unpaid invoices`} icon={HandCoins} tone="amber" />
        <StatCard label="Current" value={formatMoney(buckets.Current, currency)} hint="Not yet due" icon={CalendarClock} tone="green" />
        <StatCard label="1-30 days" value={formatMoney(buckets['1-30 days'], currency)} hint="Overdue this month" icon={AlertTriangle} tone="amber" />
        <StatCard label="60+ days" value={formatMoney(buckets['60+ days'], currency)} hint="Seriously overdue" icon={AlertTriangle} tone="red" />
      </div>
      <Card className="mt-4">
        <CardHeader title="Aged receivables" description="Unpaid customer invoices and how long they have been due." />
        <ReportTable head={['Invoice', 'Customer', 'Issued', 'Due', '#Days overdue', '#Total', '#Paid', '#Balance', 'Bucket']}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium text-ink-800">{row.invoice_number}</td>
              <td>{row.customer_name}</td>
              <td>{formatDate(row.issue_date)}</td>
              <td>{row.due_date ? formatDate(row.due_date) : '—'}</td>
              <td className="text-right tabular-nums">{row.days_overdue > 0 ? row.days_overdue : '—'}</td>
              <td className="text-right tabular-nums">{formatMoney(row.total_amount, currency)}</td>
              <td className="text-right tabular-nums">{formatMoney(row.amount_paid, currency)}</td>
              <td className="text-right font-medium tabular-nums text-brand-700">{formatMoney(row.balance, currency)}</td>
              <td>
                <Badge tone={row.bucket === 'Current' ? 'success' : row.bucket === '60+ days' ? 'danger' : 'warning'} size="sm">
                  {row.bucket}
                </Badge>
              </td>
            </tr>
          ))}
        </ReportTable>
      </Card>
    </>
  )
}

function ExpensesReport({ data, currency }) {
  const rows = data.rows || []
  const byCategory = data.byCategory || []
  const entries = rows.reduce((sum, row) => sum + Number(row.entries || 0), 0)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Expenses" value={formatMoney(data.total, currency)} hint="Cashbook payments in this period" icon={Receipt} tone="red" />
        <StatCard label="Entries" value={formatNumber(entries)} hint="Individual payments" icon={Receipt} />
        <StatCard label="Categories" value={formatNumber(byCategory.length)} hint="Expense types used" icon={Percent} tone="sky" />
        <StatCard label="Average" value={formatMoney(entries ? data.total / entries : 0, currency)} hint="Per payment" icon={HandCoins} tone="amber" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Expenses by day" />
          <ReportTable head={['Date', 'Category', '#Entries', '#Amount']}>
            {rows.map((row, index) => (
              <tr key={`${row.date}-${row.category}-${index}`}>
                <td>{formatDate(row.date)}</td>
                <td>{row.category}</td>
                <td className="text-right tabular-nums">{row.entries}</td>
                <td className="text-right tabular-nums">{formatMoney(row.amount, currency)}</td>
              </tr>
            ))}
          </ReportTable>
        </Card>
        <Card>
          <CardHeader title="By category" />
          <div className="p-4">
            <BarList
              items={byCategory.map((row) => ({ label: row.category, value: row.amount, color: 'bg-brand-500' }))}
              formatValue={(value) => formatMoney(value, currency)}
              emptyLabel="No expenses in this period"
            />
          </div>
        </Card>
      </div>
    </>
  )
}

function LowStockReport({ rows }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Low stock items" value={formatNumber(rows.length)} hint="At or below reorder level" icon={AlertTriangle} tone={rows.length ? 'red' : 'green'} />
        <StatCard label="Units on hand" value={formatQuantity(rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0))} hint="Across low-stock products" icon={Package} tone="amber" />
        <StatCard
          label="Units to reorder"
          value={formatQuantity(rows.reduce((sum, row) => sum + Math.max(0, Number(row.reorder_level || 0) - Number(row.quantity || 0)), 0))}
          hint="To reach reorder level"
          icon={ShoppingCart}
          tone="sky"
        />
        <StatCard label="Categories" value={formatNumber(new Set(rows.map((row) => row.category_name).filter(Boolean)).size)} hint="Affected categories" icon={Warehouse} />
      </div>
      <Card className="mt-4">
        <CardHeader title="Reorder list" />
        <ReportTable head={['Product', 'SKU', 'Category', '#On hand', '#Reorder level', '#Shortfall']}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium text-ink-800">{row.name}</td>
              <td className="text-ink-500">{row.sku}</td>
              <td>{row.category_name || '—'}</td>
              <td className="text-right font-medium tabular-nums text-brand-700">{formatQuantity(row.quantity)}</td>
              <td className="text-right tabular-nums">{formatQuantity(row.reorder_level)}</td>
              <td className="text-right tabular-nums">{formatQuantity(Math.max(0, row.reorder_level - row.quantity))}</td>
            </tr>
          ))}
        </ReportTable>
      </Card>
    </>
  )
}

function ExpiringReport({ rows }) {
  const expired = rows.filter((row) => Number(row.days_left) < 0)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Expiring products" value={formatNumber(rows.length)} hint="Within the selected window" icon={CalendarClock} tone={rows.length ? 'amber' : 'green'} />
        <StatCard label="Already expired" value={formatNumber(expired.length)} hint="Needs immediate action" icon={AlertTriangle} tone={expired.length ? 'red' : 'green'} />
        <StatCard label="Units expiring" value={formatQuantity(rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0))} hint="At risk of write-off" icon={Package} tone="amber" />
        <StatCard label="Categories" value={formatNumber(new Set(rows.map((row) => row.category_name).filter(Boolean)).size)} hint="Affected categories" icon={Warehouse} tone="sky" />
      </div>
      <Card className="mt-4">
        <CardHeader title="Expiry watchlist" />
        <ReportTable head={['Product', 'SKU', 'Category', '#Qty', 'Expiry date', '#Days left']}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium text-ink-800">{row.name}</td>
              <td className="text-ink-500">{row.sku}</td>
              <td>{row.category_name || '—'}</td>
              <td className="text-right tabular-nums">{formatQuantity(row.quantity)}</td>
              <td>{formatDate(row.expiry_date)}</td>
              <td className={`text-right font-medium tabular-nums ${Number(row.days_left) < 0 ? 'text-red-600' : 'text-ink-700'}`}>
                {row.days_left}
              </td>
            </tr>
          ))}
        </ReportTable>
      </Card>
    </>
  )
}

export default function ReportsPage() {
  const repo = useRepository()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [tab, setTab] = useState('sales')
  const [from, setFrom] = useState(toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [to, setTo] = useState(toDateInput(new Date()))
  const [expiryDays, setExpiryDays] = useState('90')

  const report = useAsyncData(
    async () => {
      if (!repo) return null
      let value = null
      if (tab === 'sales') value = await repo.reports.dailySales({ from, to })
      else if (tab === 'purchases') value = await repo.reports.dailyPurchases({ from, to })
      else if (tab === 'stock') value = await repo.reports.dailyBalances({ from, to })
      else if (tab === 'valuation') value = await repo.reports.inventoryValuation()
      else if (tab === 'margins') value = await repo.reports.margins({ from, to })
      else if (tab === 'receivables') value = await repo.reports.receivables()
      else if (tab === 'expenses') value = await repo.reports.expenses({ from, to })
      else if (tab === 'low-stock') value = await repo.reports.lowStock()
      else if (tab === 'expiring') value = await repo.reports.expiring(Number(expiryDays) || 90)
      // Tag the payload with the tab that produced it, so a slow response can
      // never be rendered by a different report component.
      return { tab, value }
    },
    [repo, tab, from, to, expiryDays],
    { enabled: Boolean(repo) },
  )

  const data = report.data?.tab === tab ? report.data.value : null

  const exportColumns = useMemo(() => {
    const money = (label, key) => ({ label, value: (row) => row[key] })
    if (tab === 'sales' || tab === 'margins') {
      return [
        money('Date', 'date'),
        money('Product', 'name'),
        money('SKU', 'sku'),
        money('Quantity', 'quantity'),
        money('Revenue', 'revenue'),
        money('Cost', 'cost'),
        money('Margin', 'margin'),
        money('Margin %', 'margin_percent'),
      ]
    }
    if (tab === 'purchases') {
      return [money('Date', 'date'), money('Orders', 'orders'), money('Total', 'total')]
    }
    if (tab === 'stock') {
      return [money('Date', 'date'), money('Stock in', 'stock_in'), money('Stock out', 'stock_out'), money('Closing', 'closing')]
    }
    if (tab === 'valuation') {
      return [
        money('Product', 'name'),
        money('SKU', 'sku'),
        money('Category', 'category_name'),
        money('Quantity', 'quantity'),
        money('Cost price', 'cost_price'),
        money('Selling price', 'selling_price'),
        money('Cost value', 'cost_value'),
        money('Retail value', 'retail_value'),
        money('Potential margin', 'potential_margin'),
      ]
    }
    if (tab === 'receivables') {
      return [
        money('Invoice', 'invoice_number'),
        money('Customer', 'customer_name'),
        money('Issued', 'issue_date'),
        money('Due', 'due_date'),
        money('Total', 'total_amount'),
        money('Paid', 'amount_paid'),
        money('Balance', 'balance'),
        money('Days overdue', 'days_overdue'),
        money('Bucket', 'bucket'),
      ]
    }
    if (tab === 'expenses') {
      return [money('Date', 'date'), money('Category', 'category'), money('Entries', 'entries'), money('Amount', 'amount')]
    }
    if (tab === 'low-stock') {
      return [money('Product', 'name'), money('SKU', 'sku'), money('On hand', 'quantity'), money('Reorder level', 'reorder_level')]
    }
    if (tab === 'expiring') {
      return [money('Product', 'name'), money('SKU', 'sku'), money('Quantity', 'quantity'), money('Expiry date', 'expiry_date'), money('Days left', 'days_left')]
    }
    return []
  }, [tab])

  const exportRows = useMemo(() => {
    if (!data) return []
    if (tab === 'low-stock' || tab === 'expiring') return data
    return data.rows || []
  }, [data, tab])

  function refresh() {
    report.reload()
  }

  function exportCsv() {
    if (!exportRows.length) return
    const columns = tab === 'sales' ? exportColumns.filter((column) => column.label !== 'Product' && column.label !== 'SKU') : exportColumns
    downloadCsv(`report-${tab}`, columns, exportRows)
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Sales, stock, margins and account balances from your live ledger."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!exportRows.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw size={15} />
              Refresh
            </Button>
          </>
        }
      />

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(value) => setTab(value)}
        className="mb-4"
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {DATE_TABS.includes(tab) && (
          <>
            <Field label="From" className="w-full sm:w-40">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To" className="w-full sm:w-40">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom(toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
                setTo(toDateInput(new Date()))
              }}
            >
              This month
            </Button>
          </>
        )}
        {tab === 'expiring' && (
          <Field label="Window" className="w-full sm:w-44">
            <Select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
              <option value="90">Next 90 days</option>
              <option value="180">Next 180 days</option>
            </Select>
          </Field>
        )}
        {tab === 'valuation' && (
          <Badge tone="neutral">{titleCase('Live stock value')}</Badge>
        )}
      </div>

      {report.error ? (
        <Alert tone="danger">{report.error}</Alert>
      ) : report.loading || !data ? (
        <Card>
          <Spinner />
        </Card>
      ) : tab === 'sales' ? (
        <SalesReport data={data} currency={currency} />
      ) : tab === 'purchases' ? (
        <PurchasesReport data={data} currency={currency} />
      ) : tab === 'stock' ? (
        <StockReport data={data} />
      ) : tab === 'valuation' ? (
        <ValuationReport data={data} currency={currency} />
      ) : tab === 'margins' ? (
        <MarginsReport data={data} currency={currency} />
      ) : tab === 'receivables' ? (
        <ReceivablesReport data={data} currency={currency} />
      ) : tab === 'expenses' ? (
        <ExpensesReport data={data} currency={currency} />
      ) : tab === 'low-stock' ? (
        <LowStockReport rows={data} />
      ) : tab === 'expiring' ? (
        <ExpiringReport rows={data} />
      ) : null}
    </div>
  )
}
