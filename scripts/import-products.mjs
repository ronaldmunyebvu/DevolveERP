/**
 * Imports supplier invoice products into inventory.
 *
 * Usage:
 *   npm run products:import                 # import scripts/invoice-products.json
 *   npm run products:import -- --dry-run    # preview without writing
 *   npm run products:import -- path/to/products.json
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closePool, one, query, withTransaction } from '../api/_lib/db.js'
import { createRepository } from '../api/_lib/repo.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')
const fileArg = process.argv.slice(2).find((value) => value !== '--dry-run')
const dataFile = fileArg ? path.resolve(fileArg) : path.join(here, 'invoice-products.json')

async function main() {
  const raw = JSON.parse(await fs.readFile(dataFile, 'utf8'))
  const products = Array.isArray(raw) ? raw : raw.products
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('No products found in the import file.')
  }

  const company = await one('SELECT id, name FROM companies ORDER BY created_at LIMIT 1')
  if (!company) throw new Error('No company found. Run npm run db:setup first.')
  const user = await one('SELECT id FROM users WHERE company_id = $1 ORDER BY created_at LIMIT 1', [
    company.id,
  ])
  const ctx = { companyId: company.id, userId: user?.id || null, role: 'admin' }
  const repo = createRepository({ query, one, withTransaction })

  const existing = await query('SELECT lower(sku) AS sku, part_number FROM products WHERE company_id = $1', [
    company.id,
  ])
  const existingBySku = new Map(existing.map((row) => [row.sku, row.part_number]))
  const baseCounts = new Map()

  function skuFor(partNumber) {
    const code = String(partNumber)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
    const base = code ? `PN-${code}` : 'PN-PART'
    const occurrence = (baseCounts.get(base) || 0) + 1
    baseCounts.set(base, occurrence)
    return occurrence === 1 ? base : `${base}-${occurrence}`
  }

  let created = 0
  let skipped = 0
  let totalQuantity = 0

  for (const item of products) {
    const partNumber = String(item.partNumber ?? '').trim()
    const description = String(item.description ?? '').trim() || partNumber
    if (!partNumber) {
      skipped += 1
      continue
    }
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0
    let sku = skuFor(partNumber)
    if (existingBySku.get(sku.toLowerCase()) === partNumber) {
      skipped += 1
      continue
    }
    while (existingBySku.has(sku.toLowerCase())) sku = `${sku}-new`
    const payload = {
      part_number: partNumber,
      sku,
      name: description,
      description,
      cost_price: unitPrice,
      selling_price: 0,
      opening_quantity: quantity,
      tags: 'imported, commercial-invoice',
    }
    totalQuantity += quantity
    if (dryRun) {
      console.log(`${payload.sku} | ${payload.part_number} | ${description} | ${quantity} | ${unitPrice}`)
      continue
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        await repo.products.create(ctx, payload)
        break
      } catch (error) {
        const message = error?.message || 'connection error'
        if (/already exists/i.test(message)) {
          const rows = await query('SELECT part_number FROM products WHERE company_id = $1 AND lower(sku) = $2', [
            company.id,
            sku.toLowerCase(),
          ])
          if (rows[0]?.part_number === partNumber) break
        }
        if (attempt >= 3) throw error
        console.warn(`Retry ${attempt} for ${sku}: ${message}`)
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
      }
    }
    existingBySku.set(sku.toLowerCase(), partNumber)
    created += 1
    if (created % 25 === 0) console.log(`Imported ${created}/${products.length}`)
  }

  console.log(
    dryRun
      ? `Dry run complete. ${products.length - skipped} products, ${totalQuantity} units.`
      : `Import complete for ${company.name}. ${created} products, ${totalQuantity} units, ${skipped} skipped.`,
  )
}

main()
  .catch((error) => {
    console.error('Product import failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => closePool())
