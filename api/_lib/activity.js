import { query } from './db.js'

const ENTITY_TYPES = {
  company: 'company',
  users: 'user',
  categories: 'category',
  locations: 'location',
  products: 'product',
  suppliers: 'supplier',
  customers: 'customer',
  purchases: 'purchase order',
  sales: 'invoice',
  quotations: 'quotation',
  transfers: 'stock transfer',
  cashbook: 'cashbook entry',
  journals: 'journal entry',
}

const ACTIONS = {
  create: 'Created',
  update: 'Updated',
  remove: 'Deleted',
  receive: 'Received',
  addPayment: 'Recorded a payment on',
  adjust: 'Adjusted stock for',
  convert: 'Converted',
}

const NUMBER_FIELDS = [
  'invoice_number',
  'po_number',
  'quote_number',
  'transfer_number',
  'payment_number',
  'reference',
]

const NAME_FIELDS = ['name', 'full_name', 'sku', 'description', 'email']

function labelFrom(source) {
  if (!source || typeof source !== 'object') return ''
  for (const field of NUMBER_FIELDS) {
    if (source[field]) return String(source[field])
  }
  for (const field of NAME_FIELDS) {
    if (source[field]) return String(source[field])
  }
  return ''
}

export function isActivity(operation) {
  const dot = operation.indexOf('.')
  if (dot === -1) return false
  return Object.prototype.hasOwnProperty.call(ACTIONS, operation.slice(dot + 1))
}

/**
 * Writes one row to the company activity log. Failures never break the
 * operation that triggered them.
 */
export async function recordActivity(ctx, operation, args, result) {
  if (!isActivity(operation) || !ctx?.companyId) return

  const dot = operation.indexOf('.')
  const group = operation.slice(0, dot)
  const method = operation.slice(dot + 1)
  const first = Array.isArray(args) ? args[0] : null
  const label =
    method === 'addPayment' && result?.invoice_number
      ? String(result.invoice_number)
      : labelFrom(result) || labelFrom(first)
  const entityType = ENTITY_TYPES[group] || group
  const description = `${ACTIONS[method]} ${entityType}${label ? ` ${label}` : ''}`

  try {
    await query(
      `INSERT INTO activity_log
        (company_id, user_id, action, entity_type, entity_id, entity_label, description, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        ctx.companyId,
        ctx.userId || null,
        method,
        entityType,
        result?.id || first?.id || null,
        label || null,
        description,
        JSON.stringify({ operation }),
      ],
    )
  } catch (error) {
    console.error('[api/activity]', error.message)
  }
}
