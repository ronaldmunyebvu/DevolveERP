export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = '') {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export function titleCase(value = '') {
  return String(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function initialsOf(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

/* ------------------------------------------------------------------ money */

export function currencySymbol(currency = 'USD') {
  const map = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    ZAR: 'R',
    ZWL: 'Z$',
    KES: 'KSh',
    NGN: '₦',
    GHS: 'GH₵',
    ZMW: 'ZK',
    TZS: 'TSh',
    UGX: 'USh',
    BWP: 'P',
    MWK: 'MK',
    AUD: 'A$',
    CAD: 'C$',
  }
  return map[currency] || `${currency} `
}

export function greetingFor(value = new Date()) {
  const date = toDate(value) || new Date()
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function formatMoney(amount, currency = 'USD') {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${currencySymbol(currency)}0.00`
  return `${currencySymbol(currency)}${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatNumber(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-US')
}

export function formatQuantity(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

/* ------------------------------------------------------------------ dates */

export function toDate(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function toDateInput(value) {
  const date = toDate(value) ?? new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function startOfMonth(value = new Date()) {
  const date = toDate(value) ?? new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function startOfDay(value = new Date()) {
  const date = toDate(value) ?? new Date()
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function endOfDay(value = new Date()) {
  const date = toDate(value) ?? new Date()
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

export function addDays(value, amount) {
  const date = toDate(value) ?? new Date()
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

export function relativeTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const steps = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800],
    [Infinity, 'year', 31557600],
  ]
  for (const [limit, unit, divisor] of steps) {
    if (Math.abs(seconds) < limit) return formatter.format(-Math.round(seconds / divisor), unit)
  }
  return formatDate(date)
}

export function matchesSearch(haystack, term) {
  if (!term) return true
  return String(haystack ?? '')
    .toLowerCase()
    .includes(String(term).trim().toLowerCase())
}

/* ---------------------------------------------------------------- exports */

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function downloadCsv(filename, columns, rows) {
  const header = columns.map((column) => escapeCell(column.label)).join(',')
  const body = rows
    .map((row) => columns.map((column) => escapeCell(column.value(row))).join(','))
    .join('\r\n')
  const blob = new Blob(['\uFEFF', header, '\r\n', body], {
    type: 'text/csv;charset=utf-8;',
  })
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function debounce(fn, wait = 250) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

/* ------------------------------------------------------- document constants */

export const PAYMENT_METHODS = ['cash', 'ecocash', 'bank_transfer', 'card', 'mobile_money', 'credit']
export const CUSTOMER_TYPES = ['retail', 'wholesale', 'mechanic', 'fleet']
export const PRODUCT_UNITS = ['pc', 'set', 'pair', 'litre', 'gallon', 'kg', 'box', 'roll', 'metre']
export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries',
  'Utilities',
  'Transport',
  'Fuel',
  'Packaging',
  'Marketing',
  'Repairs',
  'Bank Charges',
  'Licences',
  'Freight & Clearing',
  'Other Expense',
]
export const INCOME_CATEGORIES = ['Sales Receipt', 'Other Income', 'Capital Injection', 'Refund Received']
export const JOURNAL_ACCOUNTS = [
  'Cash on Hand',
  'Bank',
  'Accounts Receivable',
  'Inventory',
  'Accounts Payable',
  'Sales Revenue',
  'Cost of Goods Sold',
  'VAT Input',
  'VAT Output',
  'Inventory Adjustment',
  'Opening Balance Equity',
  'Freight & Clearing',
  'Rent',
  'Salaries',
  'Utilities',
  'Transport',
  'Fuel',
  'Other Expense',
  'Other Income',
]
