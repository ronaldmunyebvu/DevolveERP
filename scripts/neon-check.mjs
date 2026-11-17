import { createPool } from '../api/_lib/pool.js'

const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const tables = [
  'companies',
  'users',
  'auth_codes',
  'document_sequences',
  'categories',
  'locations',
  'suppliers',
  'customers',
  'products',
  'product_stock_levels',
  'stock_movements',
  'purchase_orders',
  'purchase_order_items',
  'invoices',
  'invoice_items',
  'quotations',
  'quotation_items',
  'payments',
  'stock_transfers',
  'stock_transfer_items',
  'cashbook_entries',
  'journal_entries',
  'journal_lines',
]

const client = await createPool({ connectionString, max: 1 })
try {
  for (const table of tables) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`)
    console.log(`${table.padEnd(24)} ${result.rows[0].count}`)
  }
} finally {
  await client.end()
}
