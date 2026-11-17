import { useMemo, useState } from 'react'
import { ArrowDownUp, BookOpenCheck, Download, Landmark, RefreshCw, Scale } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAsyncData, useRepository } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  TableWrapper,
} from '@/components/ui'
import { StatCard } from '@/components/domain/StatCard'
import {
  downloadCsv,
  formatDate,
  formatMoney,
  formatNumber,
  startOfMonth,
  titleCase,
  toDateInput,
} from '@/lib/utils'

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export default function GeneralLedgerPage() {
  const repo = useRepository()
  const { company } = useAuth()
  const currency = company?.currency || 'USD'
  const [filters, setFilters] = useState({
    from: startOfMonth(),
    to: toDateInput(new Date()),
    account: '',
  })

  const ledger = useAsyncData(
    () => (repo ? repo.journals.generalLedger(filters) : null),
    [repo, filters.from, filters.to, filters.account],
    { enabled: Boolean(repo) },
  )

  const accounts = ledger.data?.accounts || []
  const lines = ledger.data?.lines || []
  const selectedAccount = filters.account
    ? accounts.find((entry) => entry.account_name === filters.account)
    : null
  const opening = selectedAccount?.opening || 0

  const totals = useMemo(
    () =>
      accounts.reduce(
        (accumulator, entry) => ({
          debit: accumulator.debit + Number(entry.debit || 0),
          credit: accumulator.credit + Number(entry.credit || 0),
          opening: accumulator.opening + Number(entry.opening || 0),
          closing: accumulator.closing + Number(entry.closing || 0),
        }),
        { debit: 0, credit: 0, opening: 0, closing: 0 },
      ),
    [accounts],
  )

  const rows = useMemo(() => {
    let balance = opening
    return lines.map((line) => {
      balance = round2(balance + Number(line.debit || 0) - Number(line.credit || 0))
      return { ...line, balance }
    })
  }, [lines, opening])

  function exportCsv() {
    downloadCsv(
      'general-ledger',
      [
        { label: 'Date', value: (row) => row.entry_date },
        { label: 'Reference', value: (row) => row.reference },
        { label: 'Description', value: (row) => row.description },
        { label: 'Source', value: (row) => row.source_type },
        { label: 'Account', value: (row) => row.account_name },
        { label: 'Debit', value: (row) => row.debit },
        { label: 'Credit', value: (row) => row.credit },
        { label: 'Balance', value: (row) => (selectedAccount ? row.balance : '') },
        { label: 'Memo', value: (row) => row.memo },
      ],
      selectedAccount ? rows : lines,
    )
  }

  const activeAccounts = accounts.filter((entry) => entry.debit || entry.credit).length
  const difference = round2(totals.debit - totals.credit)

  return (
    <div>
      <PageHeader
        title="General ledger"
        description="Opening balances, movements and closing balances for every account."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!lines.length}>
              <Download size={15} />
              Export
            </Button>
            <Button variant="secondary" onClick={() => ledger.reload()}>
              <RefreshCw size={15} />
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total debits"
          value={formatMoney(totals.debit, currency)}
          hint={`${formatNumber(activeAccounts)} accounts with movement`}
          icon={ArrowDownUp}
        />
        <StatCard
          label="Total credits"
          value={formatMoney(totals.credit, currency)}
          hint="Should equal total debits"
          icon={BookOpenCheck}
          tone="sky"
        />
        <StatCard
          label="Net movement"
          value={formatMoney(difference, currency)}
          hint={Math.abs(difference) < 0.005 ? 'Ledger is balanced' : 'Debits minus credits'}
          icon={Scale}
          tone={Math.abs(difference) < 0.005 ? 'green' : 'red'}
        />
        <StatCard
          label="Closing position"
          value={formatMoney(totals.closing, currency)}
          hint={`Opening ${formatMoney(totals.opening, currency)}`}
          icon={Landmark}
          tone="amber"
        />
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
          <Field label="Account" className="w-full sm:w-64">
            <Select
              value={filters.account}
              onChange={(event) => setFilters((current) => ({ ...current, account: event.target.value }))}
            >
              <option value="">All accounts</option>
              {accounts.map((entry) => (
                <option key={entry.account_name} value={entry.account_name}>
                  {entry.account_name}
                </option>
              ))}
            </Select>
          </Field>
          <span className="ml-auto text-xs text-ink-500">
            {accounts.length} accounts &middot; {formatNumber(ledger.data?.lines?.length || 0)} lines
          </span>
        </div>

        {ledger.error ? (
          <div className="p-6">
            <Alert tone="danger">{ledger.error}</Alert>
          </div>
        ) : ledger.loading && !ledger.data ? (
          <Spinner />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            title="No ledger activity"
            message="Post a sale, purchase, cashbook entry or manual journal to see account balances here."
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Account</th>
                <th className="text-right">Opening</th>
                <th className="text-right">Debits</th>
                <th className="text-right">Credits</th>
                <th className="text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((entry) => {
                const active = entry.account_name === filters.account
                return (
                  <tr
                    key={entry.account_name}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        account: current.account === entry.account_name ? '' : entry.account_name,
                      }))
                    }
                    className={active ? 'cursor-pointer bg-brand-50/70' : 'cursor-pointer hover:bg-ink-50'}
                  >
                    <td className="font-medium text-ink-800">{entry.account_name}</td>
                    <td className="text-right tabular-nums">{formatMoney(entry.opening, currency)}</td>
                    <td className="text-right tabular-nums">{formatMoney(entry.debit, currency)}</td>
                    <td className="text-right tabular-nums">{formatMoney(entry.credit, currency)}</td>
                    <td className="text-right font-semibold tabular-nums">
                      {formatMoney(entry.closing, currency)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">
              {selectedAccount ? selectedAccount.account_name : 'Account activity'}
            </h2>
            <p className="text-xs text-ink-500">
              {selectedAccount
                ? `Activity from ${formatDate(filters.from)} to ${formatDate(filters.to)}`
                : 'Select an account above to see its running balance.'}
            </p>
          </div>
          {selectedAccount && (
            <span className="ml-auto rounded-md bg-ink-100 px-2 py-1 text-xs font-medium text-ink-600 tabular-nums">
              Closing {formatMoney(selectedAccount.closing, currency)}
            </span>
          )}
        </div>

        {ledger.loading && ledger.data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No lines for this period"
            message="Try a wider date range or choose a different account."
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Account</th>
                <th>Source</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                {selectedAccount && <th className="text-right">Balance</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((line, index) => (
                <tr key={`${line.entry_id}-${index}`}>
                  <td>{formatDate(line.entry_date)}</td>
                  <td className="font-medium text-ink-800">{line.reference || '-'}</td>
                  <td>
                    <p className="font-medium text-ink-800">{line.description}</p>
                    {line.memo && <p className="text-[11px] text-ink-500">{line.memo}</p>}
                  </td>
                  <td>{line.account_name}</td>
                  <td className="text-xs text-ink-500">{titleCase(line.source_type || 'auto')}</td>
                  <td className="text-right tabular-nums">
                    {line.debit ? formatMoney(line.debit, currency) : '-'}
                  </td>
                  <td className="text-right tabular-nums">
                    {line.credit ? formatMoney(line.credit, currency) : '-'}
                  </td>
                  {selectedAccount && (
                    <td className="text-right font-medium tabular-nums">
                      {formatMoney(line.balance, currency)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  )
}
