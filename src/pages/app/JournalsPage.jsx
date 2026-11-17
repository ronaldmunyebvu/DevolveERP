import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Scale,
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
import {
  JOURNAL_ACCOUNTS,
  downloadCsv,
  formatDate,
  formatMoney,
  formatNumber,
  matchesSearch,
  titleCase,
  toDateInput,
} from '@/lib/utils'

const SOURCE_TYPES = ['sale', 'purchase', 'cashbook', 'adjustment', 'transfer', 'manual']

function emptyLine() {
  return { account_name: '', debit: '', credit: '', memo: '' }
}

function JournalFormModal({ open, onClose, repo, onSaved }) {
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [form, setForm] = useState({
    entry_date: toDateInput(new Date()),
    reference: '',
    description: '',
    lines: [emptyLine(), emptyLine()],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      entry_date: toDateInput(new Date()),
      reference: '',
      description: '',
      lines: [emptyLine(), emptyLine()],
    })
    setError('')
  }, [open])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  function updateLine(index, patch) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    }))
  }

  const totals = useMemo(() => {
    const debit = form.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
    const credit = form.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
    return { debit, credit, difference: Math.round((debit - credit) * 100) / 100 }
  }, [form.lines])

  async function save(event) {
    event.preventDefault()
    setError('')
    const usable = form.lines.filter((line) => line.account_name && (Number(line.debit) > 0 || Number(line.credit) > 0))
    if (usable.length < 2) {
      setError('Add at least two lines with an account and a debit or credit.')
      return
    }
    if (Math.abs(totals.difference) > 0.005) {
      setError(`The journal is not balanced. Debits ${formatMoney(totals.debit, currency)}, credits ${formatMoney(totals.credit, currency)}.`)
      return
    }
    setBusy(true)
    try {
      await repo.journals.create({
        ...form,
        lines: usable.map((line) => ({
          account_name: line.account_name,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
          memo: line.memo,
        })),
      })
      toast.success('Journal entry posted.')
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
      title="New manual journal"
      description="Post a balanced double-entry journal. Total debits must equal total credits."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={Math.abs(totals.difference) > 0.005}>
            Post journal
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" value={form.entry_date} onChange={set('entry_date')} />
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={set('reference')} placeholder="JV-001" />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={set('description')} placeholder="What is this journal for?" />
          </Field>
        </div>

        <TableWrapper className="rounded-lg border border-ink-200">
          <thead>
            <tr>
              <th className="min-w-[200px]">Account</th>
              <th className="w-32 text-right">Debit</th>
              <th className="w-32 text-right">Credit</th>
              <th className="min-w-[160px]">Memo</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {form.lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <Select value={line.account_name} onChange={(event) => updateLine(index, { account_name: event.target.value })}>
                    <option value="">Choose account</option>
                    {JOURNAL_ACCOUNTS.map((account) => (
                      <option key={account} value={account}>
                        {account}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.debit}
                    onChange={(event) => updateLine(index, { debit: event.target.value, credit: '' })}
                    placeholder="0.00"
                    className="text-right"
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.credit}
                    onChange={(event) => updateLine(index, { credit: event.target.value, debit: '' })}
                    placeholder="0.00"
                    className="text-right"
                  />
                </td>
                <td>
                  <Input value={line.memo} onChange={(event) => updateLine(index, { memo: event.target.value })} placeholder="Optional" />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:bg-red-50"
                    title="Remove line"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        lines:
                          current.lines.length > 2
                            ? current.lines.filter((_, position) => position !== index)
                            : [emptyLine(), emptyLine()],
                      }))
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}
          >
            <Plus size={14} />
            Add line
          </Button>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-ink-500">
              Debits <span className="font-semibold text-ink-800 tabular-nums">{formatMoney(totals.debit, currency)}</span>
            </span>
            <span className="text-ink-500">
              Credits <span className="font-semibold text-ink-800 tabular-nums">{formatMoney(totals.credit, currency)}</span>
            </span>
            <Badge tone={Math.abs(totals.difference) > 0.005 ? 'danger' : 'success'}>
              {Math.abs(totals.difference) > 0.005
                ? `Out by ${formatMoney(Math.abs(totals.difference), currency)}`
                : 'Balanced'}
            </Badge>
          </div>
        </div>
        <Field label="Notes">
          <Textarea
            value={form.description}
            onChange={set('description')}
            rows={2}
            placeholder="Description used on the journal entry"
          />
        </Field>
      </form>
    </Modal>
  )
}

export default function JournalsPage() {
  const repo = useRepository()
  const toast = useToast()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [filters, setFilters] = useState({
    from: toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    to: toDateInput(new Date()),
    source_type: '',
    search: '',
  })
  const [formOpen, setFormOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const journals = useAsyncData(
    () => (repo ? repo.journals.list({ from: filters.from, to: filters.to }) : null),
    [repo, filters.from, filters.to],
    { enabled: Boolean(repo) },
  )

  const list = journals.data || []
  const visible = useMemo(
    () =>
      list.filter((entry) => {
        if (filters.source_type && entry.source_type !== filters.source_type) return false
        return matchesSearch([entry.description, entry.reference].join(' '), filters.search)
      }),
    [list, filters.source_type, filters.search],
  )

  const stats = useMemo(() => {
    const debit = list.reduce((sum, entry) => sum + Number(entry.total_debit || 0), 0)
    const credit = list.reduce((sum, entry) => sum + Number(entry.total_credit || 0), 0)
    return {
      debit,
      credit,
      count: list.length,
      manual: list.filter((entry) => entry.source_type === 'manual').length,
    }
  }, [list])

  function toggle(id) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await repo.journals.remove({ id: deleting.id })
      toast.success('Journal entry deleted.')
      setDeleting(null)
      journals.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  function exportCsv() {
    const rows = visible.flatMap((entry) =>
      entry.lines.map((line) => ({
        ...line,
        entry_date: entry.entry_date,
        reference: entry.reference,
        description: entry.description,
        source_type: entry.source_type,
      })),
    )
    downloadCsv(
      'journals',
      [
        { label: 'Date', value: (row) => row.entry_date },
        { label: 'Reference', value: (row) => row.reference },
        { label: 'Description', value: (row) => row.description },
        { label: 'Source', value: (row) => row.source_type },
        { label: 'Account', value: (row) => row.account_name },
        { label: 'Debit', value: (row) => row.debit },
        { label: 'Credit', value: (row) => row.credit },
        { label: 'Memo', value: (row) => row.memo },
      ],
      rows,
    )
  }

  return (
    <div>
      <PageHeader
        title="Journals"
        description="Every sale, purchase, cashbook entry and adjustment posts here automatically."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={() => journals.reload()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              Manual journal
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total debits" value={formatMoney(stats.debit, currency)} hint={`${stats.count} journal entries`} icon={BookOpen} />
        <StatCard label="Total credits" value={formatMoney(stats.credit, currency)} hint="Should equal debits" icon={BookOpen} tone="sky" />
        <StatCard
          label="Trial balance"
          value={Math.abs(stats.debit - stats.credit) < 0.005 ? 'Balanced' : formatMoney(stats.debit - stats.credit, currency)}
          hint={Math.abs(stats.debit - stats.credit) < 0.005 ? 'Debits equal credits' : 'Difference between debits and credits'}
          icon={Scale}
          tone={Math.abs(stats.debit - stats.credit) < 0.005 ? 'green' : 'red'}
        />
        <StatCard label="Manual journals" value={formatNumber(stats.manual)} hint="Entries created by hand" icon={BookOpen} tone="amber" />
      </div>

      <Card className="mt-5">
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
          <Field label="Source" className="w-full sm:w-40">
            <Select
              value={filters.source_type}
              onChange={(event) => setFilters((current) => ({ ...current, source_type: event.target.value }))}
            >
              <option value="">All sources</option>
              {SOURCE_TYPES.map((source) => (
                <option key={source} value={source}>
                  {titleCase(source)}
                </option>
              ))}
            </Select>
          </Field>
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Search description or reference..."
            className="w-full sm:w-64"
          />
          <span className="ml-auto text-xs text-ink-500">{visible.length} entries</span>
        </div>

        {journals.error ? (
          <div className="p-6">
            <Alert tone="danger">{journals.error}</Alert>
          </div>
        ) : journals.loading && !journals.data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No journal entries"
            message="Sales, purchases and cashbook entries will appear here automatically."
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th className="w-8" />
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Source</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const open = expanded.has(entry.id)
                return [
                  <tr key={entry.id} className="cursor-pointer hover:bg-ink-50" onClick={() => toggle(entry.id)}>
                    <td>
                      <span className="grid h-6 w-6 place-items-center rounded text-ink-500">
                        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </span>
                    </td>
                    <td>{formatDate(entry.entry_date)}</td>
                    <td className="font-medium text-ink-800">{entry.reference || '—'}</td>
                    <td>
                      <p className="font-medium text-ink-800">{entry.description}</p>
                      {entry.created_by_name && <p className="text-[11px] text-ink-500">By {entry.created_by_name}</p>}
                    </td>
                    <td>
                      <Badge tone={entry.source_type === 'manual' ? 'info' : 'neutral'} size="sm">
                        {titleCase(entry.source_type || 'auto')}
                      </Badge>
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(entry.total_debit, currency)}</td>
                    <td className="text-right tabular-nums">{formatMoney(entry.total_credit, currency)}</td>
                    <td>
                      <div className="flex justify-end">
                        {entry.source_type === 'manual' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:bg-red-50"
                            title="Delete journal"
                            onClick={(event) => {
                              event.stopPropagation()
                              setDeleting(entry)
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  open && (
                    <tr key={`${entry.id}-lines`} className="bg-ink-50/70">
                      <td />
                      <td colSpan={7}>
                        <div className="py-1">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-ink-500">
                                <th className="py-1 text-left font-medium">Account</th>
                                <th className="py-1 text-left font-medium">Memo</th>
                                <th className="py-1 text-right font-medium">Debit</th>
                                <th className="py-1 text-right font-medium">Credit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.lines.map((line) => (
                                <tr key={line.id} className="border-t border-ink-200/70">
                                  <td className="py-1.5 font-medium text-ink-700">{line.account_name}</td>
                                  <td className="py-1.5 text-ink-500">{line.memo || '—'}</td>
                                  <td className="py-1.5 text-right tabular-nums">{line.debit ? formatMoney(line.debit, currency) : '—'}</td>
                                  <td className="py-1.5 text-right tabular-nums">{line.credit ? formatMoney(line.credit, currency) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <JournalFormModal open={formOpen} onClose={() => setFormOpen(false)} repo={repo} onSaved={() => journals.reload()} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title="Delete this journal entry?"
        message="Only manual journal entries can be deleted. Automatic entries are part of the audit trail."
        confirmLabel="Delete journal"
      />
    </div>
  )
}
