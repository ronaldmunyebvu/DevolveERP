/**
 * Creates the Devolve ERP schema and seeds the single shop, its owner and the
 * starter categories/locations. Safe to run repeatedly.
 *
 * Usage:
 *   npm run db:setup
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool } from '../api/_lib/pool.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Add it to .env before running db:setup.')
  process.exit(1)
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'devolvetruckspares@gmail.com').trim()

const categories = [
  'Engine',
  'Brakes',
  'Suspension',
  'Electrical',
  'Filters',
  'Transmission',
  'Body & Accessories',
  'Lubricants & Chemicals',
  'Tyres & Wheels',
  'Tools & Consumables',
]

const locations = [
  { name: 'Main Shop', type: 'shop', isDefault: true },
  { name: 'Warehouse', type: 'warehouse', isDefault: false },
]

const sequences = ['invoice', 'quotation', 'purchase', 'transfer', 'payment']

async function main() {
  const client = await createPool({ connectionString, max: 1 })

  try {
    const schema = await fs.readFile(path.join(root, 'src', 'db', 'schema.sql'), 'utf8')
    await client.query(schema)
    console.log('Schema ready.')

    const company = await ensureCompany(client)
    await ensureAdmin(client, company.id)
    await ensureCategories(client, company.id)
    await ensureLocations(client, company.id)
    await ensureSequences(client, company.id)

    console.log('')
    console.log('Devolve ERP database is ready.')
    console.log(`  Company : ${company.name} (${company.id})`)
    console.log(`  Owner   : ${ADMIN_EMAIL}`)
    console.log('  Next    : open /setup, request the emailed code, then set the password.')
  } finally {
    await client.end()
  }
}

async function ensureCompany(client) {
  const existing = await client.query('SELECT * FROM companies ORDER BY created_at LIMIT 1')
  if (existing.rows[0]) return existing.rows[0]

  const inserted = await client.query(
    `INSERT INTO companies
      (name, legal_name, email, city, country, currency, tax_rate, logo_url, quotation_terms, invoice_terms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      'Devolve',
      'Devolve Motor Spares',
      ADMIN_EMAIL,
      'Harare',
      'Zimbabwe',
      'USD',
      15.5,
      '/logo2.jpg',
      'Prices are valid until the date shown. Stock is subject to availability. Goods remain the property of Devolve until paid in full.',
      'Payment is due by the date shown. Goods remain the property of Devolve until paid in full.',
    ],
  )
  return inserted.rows[0]
}

async function ensureAdmin(client, companyId) {
  const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
    ADMIN_EMAIL,
  ])
  if (existing.rows[0]) return existing.rows[0]

  const inserted = await client.query(
    `INSERT INTO users (company_id, full_name, email, role, status, must_setup)
     VALUES ($1,$2,$3,'admin','active',true)
     RETURNING id`,
    [companyId, 'Administrator', ADMIN_EMAIL],
  )
  return inserted.rows[0]
}

async function ensureCategories(client, companyId) {
  for (const name of categories) {
    await client.query(
      `INSERT INTO categories (company_id, name)
       VALUES ($1,$2)
       ON CONFLICT (company_id, lower(name)) DO NOTHING`,
      [companyId, name],
    )
  }
}

async function ensureLocations(client, companyId) {
  for (const location of locations) {
    await client.query(
      `INSERT INTO locations (company_id, name, type, is_default)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (company_id, lower(name)) DO NOTHING`,
      [companyId, location.name, location.type, location.isDefault],
    )
  }
}

async function ensureSequences(client, companyId) {
  for (const kind of sequences) {
    await client.query(
      `INSERT INTO document_sequences (company_id, kind, last_value)
       VALUES ($1,$2,0)
       ON CONFLICT (company_id, kind) DO NOTHING`,
      [companyId, kind],
    )
  }
}

main().catch((error) => {
  console.error('Database setup failed:', error.message)
  process.exitCode = 1
})
