import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  PiggyBank,
  Plus,
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
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  SearchInput,
  SegmentedControl,
  Select,
  Spinner,
  TableWrapper,
  Textarea,
} from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import { BarList } from '@/components/ui/Charts'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  downloadCsv,
  formatDate,
  formatMoney,
  formatNumber,
  matchesSearch,
  titleCase,
  toDateInput,
} from '@/lib/utils'

function CashbookFormModal({ open, onClose, repo, onSaved, staff = [] }) {
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [form, setForm] = useState({
    entry_type: 'receipt',
    entry_date: toDateInput(new Date()),
    category: INCOME_CATEGORIES[0],
    description: '',
    amount: '',
    method: 'cash',
    reference: '',
    notes: '',
    staff_id: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      entry_type: 'receipt',
      entry_date: toDateInput(new Date()),
      category: INCOME_CATEGORIES[0],
      description: '',
      amount: '',
      method: 'cash',
      reference: '',
      notes: '',
      staff_id: '',
    })
    setError('')
  }, [open])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  function setType(entryType) {
    setForm((current) => ({
      ...current,
      entry_type: entryType,
      category: entryType === 'receipt' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0],
      staff_id: '',
    }))
  }

  const categories = form.entry_type === 'receipt' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const isSalary = form.entry_type === 'payment' && form.category === 'Salaries'

  function setStaff(event) {
    const staffId = event.target.value
    const member = staff.find((person) => person.id === staffId)
    setForm((current) => ({
      ...current,
      staff_id: staffId,
      description: member ? `Salary paid to ${member.full_name}` : current.description,
    }))
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!(Number(form.amount) > 0)) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!form.description.trim()) {
      setError('Describe this entry.')
      return
    }
    if (isSalary && !form.staff_id) {
      setError('Choose the staff member you are paying.')
      return
    }
    setBusy(true)
    try {
      await repo.cashbook.create({
        ...form,
        amount: Number(form.amount),
        staff_id: isSalary ? form.staff_id : null,
      })
      toast.success(`${titleCase(form.entry_type)} recorded.`)
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
      title="New cashbook entry"
      description="Record money received or paid outside of customer invoices and purchase bills."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Record {form.entry_type}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <SegmentedControl
          value={form.entry_type}
          onChange={setType}
          options={[
            { value: 'receipt', label: 'Money in', icon: ArrowDownCircle },
            { value: 'payment', label: 'Money out', icon: ArrowUpCircle },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" value={form.entry_date} onChange={set('entry_date')} />
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={set('amount')}
              placeholder="0.00"
              required
            />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={set('category')}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          {isSalary && (
            <Field label="Staff member" required className="sm:col-span-2">
              <Select value={form.staff_id} onChange={setStaff} required>
                <option value="">Select staff member</option>
                {staff
                  .filter((person) => person.status !== 'inactive')
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field label="Method">
            <Select value={form.method} onChange={set('method')}>
              {PAYMENT_METHODS.filter((method) => method !== 'credit').map((method) => (
                <option key={method} value={method}>
                  {titleCase(method)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" required className="sm:col-span-2">
            <Input value={form.description} onChange={set('description')} placeholder="What was this for?" required />
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={set('reference')} placeholder="Receipt / voucher number" />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional note" />
          </Field>
        </div>
        <p className="text-xs text-ink-500">
          This entry will post a matching double-entry journal using the {currency} amounts above.
        </p>
      </form>
    </Modal>
  )
}

export default function CashbookPage() {
  const repo = useRepository()
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [filters, setFilters] = useState({
    from: toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    to: toDateInput(new Date()),
    entry_type: '',
    category: '',
    search: '',
  })
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const entries = useAsyncData(
    () => (repo ? repo.cashbook.list({ from: filters.from, to: filters.to }) : null),
    [repo, filters.from, filters.to],
    { enabled: Boolean(repo) },
  )
  const summary = useAsyncData(
    () => (repo ? repo.cashbook.summary({ from: filters.from, to: filters.to }) : null),
    [repo, filters.from, filters.to],
    { enabled: Boolean(repo) },
  )
  const staff = useAsyncData(() => (repo ? repo.users.list() : null), [repo], { enabled: Boolean(repo) })

  const list = entries.data || []
  const categories = useMemo(
    () => Array.from(new Set(list.map((entry) => entry.category).filter(Boolean))).sort(),
    [list],
  )

  const visible = useMemo(
    () =>
      list.filter((entry) => {
        if (filters.entry_type && entry.entry_type !== filters.entry_type) return false
        if (filters.category && entry.category !== filters.category) return false
        return matchesSearch([entry.description, entry.reference, entry.category].join(' '), filters.search)
      }),
    [list, filters],
  )

  const stats = summary.data || { receipts: 0, payments: 0, net: 0, byCategory: [] }

  const categoryItems = useMemo(
    () =>
      stats.byCategory
        .filter((row) => row.category)
        .slice(0, 8)
        .map((row) => ({
          label: `${row.category}`,
          value: row.amount,
          suffix: row.entry_type === 'receipt' ? 'in' : 'out',
          color: row.entry_type === 'receipt' ? 'bg-emerald-500' : 'bg-brand-500',
        })),
    [stats.byCategory],
  )

  function refresh() {
    entries.reload()
    summary.reload()
  }

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await repo.cashbook.remove({ id: deleting.id })
      toast.success('Cashbook entry deleted.')
      setDeleting(null)
      refresh()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  function exportCsv() {
    downloadCsv(
      'cashbook',
      [
        { label: 'Date', value: (row) => row.entry_date },
        { label: 'Type', value: (row) => row.entry_type },
        { label: 'Category', value: (row) => row.category },
        { label: 'Description', value: (row) => row.description },
        { label: 'Method', value: (row) => row.method },
        { label: 'Reference', value: (row) => row.reference },
        { label: 'Amount', value: (row) => row.amount },
        { label: 'Source', value: (row) => (row.manual ? 'Manual' : titleCase(row.source_type || 'Auto')) },
      ],
      visible,
    )
  }

  return (
    <div>
      <PageHeader
        title="Cashbook"
        description="Money in and money out that is not already captured by invoices and purchases."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              New entry
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Money in" value={formatMoney(stats.receipts, currency)} hint="Receipts in this period" icon={ArrowDownCircle} tone="green" />
        <StatCard label="Money out" value={formatMoney(stats.payments, currency)} hint="Payments in this period" icon={ArrowUpCircle} tone="red" />
        <StatCard
          label="Net movement"
          value={formatMoney(stats.net, currency)}
          hint={stats.net >= 0 ? 'Cash positive for the period' : 'Cash negative for the period'}
          icon={PiggyBank}
          tone={stats.net >= 0 ? 'green' : 'red'}
        />
        <StatCard label="Entries" value={formatNumber(list.length)} hint={`${list.filter((entry) => entry.manual).length} manual`} icon={Banknote} tone="sky" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-2 border-b border-ink-200 px-4 py-3">
            <Field label="From" className="w-full sm:w-36">
              <Input
                type="date"
                value={filters.from}
                onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
              />
            </Field>
            <Field label="To" className="w-full sm:w-36">
              <Input
                type="date"
                value={filters.to}
                onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
              />
            </Field>
            <Field label="Type" className="w-full sm:w-36">
              <Select
                value={filters.entry_type}
                onChange={(event) => setFilters((current) => ({ ...current, entry_type: event.target.value }))}
              >
                <option value="">All types</option>
                <option value="receipt">Money in</option>
                <option value="payment">Money out</option>
              </Select>
            </Field>
            <Field label="Category" className="w-full sm:w-44">
              <Select
                value={filters.category}
                onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </Field>
            <SearchInput
              value={filters.search}
              onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
              placeholder="Search description..."
              className="w-full sm:w-56"
            />
          </div>

          {entries.error ? (
            <div className="p-6">
              <Alert tone="danger">{entries.error}</Alert>
            </div>
          ) : entries.loading && !entries.data ? (
            <Spinner />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No cashbook entries"
              message="Record petty cash, rent, fuel and other money movements not covered by invoices."
              action={
                <Button onClick={() => setFormOpen(true)}>
                  <Plus size={16} />
                  New entry
                </Button>
              }
            />
          ) : (
            <TableWrapper>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Method</th>
                  <th>Source</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.entry_date)}</td>
                    <td>
                      <p className="font-medium text-ink-800">{entry.description}</p>
                      {entry.reference && <p className="text-[11px] text-ink-500">Ref {entry.reference}</p>}
                    </td>
                    <td>{entry.category}</td>
                    <td>{titleCase(entry.method || '—')}</td>
                    <td>
                      <Badge tone={entry.manual ? 'info' : 'neutral'} size="sm">
                        {entry.manual ? 'Manual' : titleCase(entry.source_type || 'Auto')}
                      </Badge>
                    </td>
                    <td
                      className={`text-right font-medium tabular-nums ${
                        entry.entry_type === 'receipt' ? 'text-emerald-700' : 'text-brand-700'
                      }`}
                    >
                      {entry.entry_type === 'receipt' ? '+' : '-'} {formatMoney(entry.amount, currency)}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        {entry.manual ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:bg-red-50"
                            title="Delete"
                            onClick={() => setDeleting(entry)}
                          >
                            <Trash2 size={15} />
                          </Button>
                        ) : (
                          <span className="text-[11px] text-ink-400">Auto</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>

        <Card>
          <CardHeader title="Top categories" description="Where the period cash went and came from." />
          <div className="p-4">
            <BarList items={categoryItems} formatValue={(value) => formatMoney(value, currency)} />
          </div>
        </Card>
      </div>

      <CashbookFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        repo={repo}
        onSaved={refresh}
        staff={staff.data || []}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete this cashbook entry?"
        message="The matching journal will be reversed. Automatically posted entries cannot be deleted here."
        confirmLabel="Delete entry"
      />
    </div>
  )
}
