import { useMemo, useState } from 'react'
import { Activity, RefreshCw, ScrollText, Users } from 'lucide-react'
import { useAsyncData, useRepository } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SearchInput,
  Select,
  Spinner,
  TableWrapper,
} from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import { downloadCsv, formatDateTime, formatNumber, titleCase, toDateInput } from '@/lib/utils'

const ENTITY_TYPES = [
  'invoice',
  'purchase order',
  'product',
  'quotation',
  'stock transfer',
  'customer',
  'supplier',
  'category',
  'location',
  'cashbook entry',
  'journal entry',
  'user',
  'company',
]

const ACTION_TONES = {
  create: 'success',
  update: 'info',
  receive: 'success',
  addPayment: 'success',
  convert: 'brand',
  adjust: 'warning',
  remove: 'danger',
}

const ACTION_LABELS = {
  create: 'Created',
  update: 'Updated',
  remove: 'Deleted',
  receive: 'Received',
  addPayment: 'Payment',
  adjust: 'Adjusted',
  convert: 'Converted',
}

export default function ActivityPage() {
  const repo = useRepository()
  const [filters, setFilters] = useState({
    search: '',
    entity_type: '',
    from: '',
    to: '',
  })

  const activity = useAsyncData(
    () =>
      repo
        ? repo.activity.list({
            search: filters.search,
            entity_type: filters.entity_type,
            from: filters.from,
            to: filters.to,
            limit: 300,
          })
        : null,
    [repo, filters.search, filters.entity_type, filters.from, filters.to],
    { enabled: Boolean(repo) },
  )

  const rows = useMemo(() => activity.data || [], [activity.data])

  const stats = useMemo(() => {
    const today = toDateInput(new Date())
    return {
      total: rows.length,
      today: rows.filter((row) => toDateInput(row.created_at) === today).length,
      people: new Set(rows.map((row) => row.user_id).filter(Boolean)).size,
      changes: rows.filter((row) => row.action !== 'create').length,
    }
  }, [rows])

  function exportCsv() {
    downloadCsv(
      'activity-log',
      [
        { label: 'When', value: (row) => formatDateTime(row.created_at) },
        { label: 'User', value: (row) => row.user_name || 'System' },
        { label: 'Action', value: (row) => ACTION_LABELS[row.action] || titleCase(row.action) },
        { label: 'Entity', value: (row) => titleCase(row.entity_type) },
        { label: 'Reference', value: (row) => row.entity_label || '' },
        { label: 'Description', value: (row) => row.description },
      ],
      rows,
    )
  }

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="A system-wide record of who created, changed or removed records."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              Export
            </Button>
            <Button variant="secondary" onClick={() => activity.reload()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Entries" value={formatNumber(stats.total)} hint="In the current view" icon={ScrollText} />
        <StatCard label="Today" value={formatNumber(stats.today)} hint="Actions logged today" icon={Activity} tone="green" />
        <StatCard label="People" value={formatNumber(stats.people)} hint="Users who made changes" icon={Users} tone="sky" />
        <StatCard label="Changes" value={formatNumber(stats.changes)} hint="Updates, payments and removals" icon={Activity} tone="amber" />
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
          <Field label="Entity" className="w-full sm:w-48">
            <Select
              value={filters.entity_type}
              onChange={(event) => setFilters((current) => ({ ...current, entity_type: event.target.value }))}
            >
              <option value="">All records</option>
              {ENTITY_TYPES.map((entity) => (
                <option key={entity} value={entity}>
                  {titleCase(entity)}
                </option>
              ))}
            </Select>
          </Field>
          <SearchInput
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Search description, reference or user..."
            className="w-full sm:w-72"
          />
          <span className="ml-auto text-xs text-ink-500">{rows.length} entries</span>
        </div>

        {activity.error ? (
          <div className="p-6">
            <Alert tone="danger">{activity.error}</Alert>
          </div>
        ) : activity.loading && !activity.data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No activity yet"
            message="Sales, purchases, payments and other changes will appear here as they happen."
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Record</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-ink-600">{formatDateTime(row.created_at)}</td>
                  <td>
                    <p className="font-medium text-ink-800">{row.user_name || 'System'}</p>
                    {row.user_email && <p className="text-[11px] text-ink-500">{row.user_email}</p>}
                  </td>
                  <td>
                    <Badge tone={ACTION_TONES[row.action] || 'neutral'} size="sm">
                      {ACTION_LABELS[row.action] || titleCase(row.action)}
                    </Badge>
                  </td>
                  <td>
                    <p className="text-ink-700">{titleCase(row.entity_type || '—')}</p>
                    {row.entity_label && <p className="text-[11px] text-ink-500">{row.entity_label}</p>}
                  </td>
                  <td className="text-ink-700">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  )
}
