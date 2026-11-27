/**
 * Server-side repository for Devolve ERP.
 *
 * Every method receives a trusted `ctx` built from the verified session:
 *   { companyId, userId, role }
 * The tenant is never taken from request arguments, so one call can only ever
 * read or write the caller's own company.
 */
import { generateCode, hashCode } from './auth.js'
import { OTP_EMAIL } from './mailer.js'
import { normalizePermissions } from './permissions.js'

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100
const round3 = (value) => Math.round((Number(value) || 0) * 1000) / 1000
const number = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const manualDescription = (name, detail) =>
  text(detail) ? `${text(name)}\n${text(detail)}` : text(name)
const manualName = (description) => String(description || '').split(/\r?\n/, 1)[0].trim()
const today = () => new Date().toISOString().slice(0, 10)
const pad2 = (value) => String(value).padStart(2, '0')
// Local calendar key. Using toISOString() on a local midnight shifts the date
// backwards for timezones ahead of UTC (e.g. Harare is UTC+2).
const localDateKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

function httpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function dateValue(value, fallback = null) {
  const candidate = text(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback
}

function invoiceStatus(total, paid) {
  if (paid <= 0) return 'unpaid'
  if (paid + 0.005 >= total) return 'paid'
  return 'partial'
}

const CASH = 'Cash on Hand'
const BANK = 'Bank'
const cashAccount = (method) => (String(method || '').toLowerCase() === 'cash' ? CASH : BANK)

function asError(error) {
  if (error?.code === '23505') return httpError('A record with that code already exists.', 409)
  if (error?.code === '23503') return httpError('That record is still in use elsewhere.', 409)
  return error
}

export function createRepository({ query, one, withTransaction }, mail) {
  async function nextNumber(tx, companyId, kind, prefix) {
    const row = await tx.one(
      `INSERT INTO document_sequences (company_id, kind, last_value)
       VALUES ($1,$2,1)
       ON CONFLICT (company_id, kind)
       DO UPDATE SET last_value = document_sequences.last_value + 1
       RETURNING last_value`,
      [companyId, kind],
    )
    return `${prefix}-${String(row.last_value).padStart(4, '0')}`
  }

  async function resolveLocation(tx, companyId) {
    const main = await tx.one(
      `SELECT * FROM locations WHERE company_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1`,
      [companyId],
    )
    if (!main) throw httpError('Create the main shop first.', 400)
    return main
  }

  async function postJournal(tx, ctx, entry) {
    const lines = (entry.lines || [])
      .map((line) => ({
        account_code: text(line.account_code) || null,
        account_name: text(line.account_name),
        debit: round2(line.debit),
        credit: round2(line.credit),
        memo: text(line.memo) || null,
      }))
      .filter((line) => line.account_name && (line.debit > 0 || line.credit > 0))
    if (!lines.length) return null

    const journal = await tx.one(
      `INSERT INTO journal_entries
        (company_id, entry_date, reference, description, source_type, source_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        ctx.companyId,
        dateValue(entry.date, today()),
        text(entry.reference) || null,
        text(entry.description) || 'Journal entry',
        text(entry.sourceType) || 'manual',
        entry.sourceId || null,
        ctx.userId,
      ],
    )
    for (const line of lines) {
      await tx.query(
        `INSERT INTO journal_lines
          (journal_entry_id, account_code, account_name, debit, credit, memo)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          journal.id,
          line.account_code,
          line.account_name,
          line.debit,
          line.credit,
          line.memo,
        ],
      )
    }
    return journal.id
  }

  async function createCashbookEntry(tx, ctx, entry) {
    const amount = round2(entry.amount)
    if (!(amount > 0)) return null
    return tx.one(
      `INSERT INTO cashbook_entries
        (company_id, entry_date, entry_type, category, description, amount, method, reference, source_type, source_id, notes, staff_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        ctx.companyId,
        dateValue(entry.date, today()),
        entry.type === 'payment' ? 'payment' : 'receipt',
        text(entry.category) || 'General',
        text(entry.description) || 'Cash entry',
        amount,
        text(entry.method) || 'cash',
        text(entry.reference) || null,
        text(entry.sourceType) || null,
        entry.sourceId || null,
        text(entry.notes) || null,
        entry.staffId || null,
        ctx.userId,
      ],
    )
  }

  async function changeStock(tx, ctx, input) {
    const product = await tx.one(
      `SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [input.productId, ctx.companyId],
    )
    if (!product) throw httpError('Product not found.', 404)

    const location = await resolveLocation(tx, ctx.companyId, input.locationId)
    const delta = round3(input.delta)
    if (!delta) throw httpError('Quantity must not be zero.')

    if (delta < 0) {
      const level = await tx.one(
        `SELECT quantity FROM product_stock_levels
         WHERE product_id = $1 AND location_id = $2 FOR UPDATE`,
        [product.id, location.id],
      )
      const available = number(level?.quantity)
      if (available + delta < -0.0001) {
        throw httpError(
          `Not enough stock for ${product.name} at ${location.name}. Available ${available}.`,
          400,
        )
      }
    }

    const resulting = round3(number(product.quantity_on_hand) + delta)
    if (resulting < -0.0001) {
      throw httpError(`Not enough stock for ${product.name}. Available ${product.quantity_on_hand}.`)
    }

    const unitCost = number(input.unitCost, number(product.cost_price))
    const expiry = dateValue(input.expiryDate)

    await tx.query(
      `UPDATE products
       SET quantity_on_hand = $2,
           cost_price = CASE WHEN $3::numeric > 0 THEN $3 ELSE cost_price END,
           expiry_date = CASE WHEN $4::date IS NULL THEN expiry_date ELSE LEAST(expiry_date, $4::date) END,
           updated_at = now()
       WHERE id = $1`,
      [product.id, resulting, round2(unitCost), expiry],
    )

    await tx.query(
      `INSERT INTO product_stock_levels (product_id, location_id, quantity)
       VALUES ($1,$2,$3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET quantity = product_stock_levels.quantity + EXCLUDED.quantity`,
      [product.id, location.id, delta],
    )

    await tx.query(
      `INSERT INTO stock_movements
        (company_id, product_id, location_id, movement_type, quantity_delta, unit_cost,
         reference_type, reference_id, reference_no, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        ctx.companyId,
        product.id,
        location.id,
        text(input.type) || 'adjustment',
        delta,
        round2(unitCost),
        text(input.referenceType) || null,
        input.referenceId || null,
        text(input.referenceNo) || null,
        text(input.notes) || null,
        ctx.userId,
      ],
    )

    return { ...product, quantity_on_hand: resulting, location }
  }

  async function customerSnapshot(tx, companyId, customerId, fallback = {}) {
    if (customerId) {
      const customer = await tx.one(`SELECT * FROM customers WHERE id = $1 AND company_id = $2`, [
        customerId,
        companyId,
      ])
      if (!customer) throw httpError('Customer not found.', 404)
      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: [customer.address, customer.city].filter(Boolean).join(', '),
      }
    }
    return {
      id: null,
      name: text(fallback.name) || 'Walk-in customer',
      email: text(fallback.email) || null,
      phone: text(fallback.phone) || null,
      address: text(fallback.address) || null,
    }
  }

  const wantsTax = (value) => value !== false && value !== 'false'

  function calculateTotals(items, { discount = 0, taxRate = 0, includeTax = true } = {}) {
    const prepared = items.map((item) => {
      const quantity = round3(item.quantity)
      const unitPrice = round2(item.unit_price)
      return {
        ...item,
        quantity,
        unit_price: unitPrice,
        unit_cost: round2(item.unit_cost),
        line_total: round2(quantity * unitPrice),
      }
    })
    const subtotal = round2(prepared.reduce((sum, item) => sum + item.line_total, 0))
    const discountAmount = Math.min(round2(discount), subtotal)
    const taxable = round2(subtotal - discountAmount)
    const effectiveRate = wantsTax(includeTax) ? taxRate : 0
    const taxAmount = round2((taxable * number(effectiveRate)) / 100)
    return {
      items: prepared,
      subtotal,
      discount: discountAmount,
      tax_amount: taxAmount,
      total_amount: round2(taxable + taxAmount),
    }
  }

  async function insertInvoice(tx, ctx, payload) {
    const customer = await customerSnapshot(tx, ctx.companyId, payload.customer_id, {
      name: payload.customer_name,
      email: payload.customer_email,
      phone: payload.customer_phone,
      address: payload.customer_address,
    })
    if (!payload.items?.length) throw httpError('Add at least one item to the invoice.')

    const location = await resolveLocation(tx, ctx.companyId, payload.location_id)
    const productIds = payload.items.map((item) => item.product_id).filter(Boolean)

    const products = {}
    for (const productId of new Set(productIds)) {
      const product = await tx.one(
        `SELECT * FROM products WHERE id = $1 AND company_id = $2`,
        [productId, ctx.companyId],
      )
      if (!product) throw httpError('A product on this invoice was not found.', 404)
      products[productId] = product
    }

    const items = payload.items.map((item) => {
      const product = item.product_id ? products[item.product_id] : null
      if (item.product_id && !product) throw httpError('A product on this invoice was not found.', 404)
      const explicitName = text(item.item_name)
      const itemName = product ? '' : explicitName || text(item.description)
      if (!product && !itemName) throw httpError('Enter a name for every manual invoice item.')
      const quantity = round3(item.quantity)
      if (!(quantity > 0)) throw httpError('Invoice quantities must be greater than zero.')
      const unitPrice =
        item.unit_price === undefined || item.unit_price === ''
          ? number(product?.selling_price)
          : round2(item.unit_price)
      if (!product && !(unitPrice > 0)) throw httpError('Enter a price for every manual invoice item.')
      return {
        product_id: product?.id || null,
        description: product
          ? text(item.description) || null
          : manualDescription(itemName, explicitName ? text(item.description) : ''),
        quantity,
        unit_price: unitPrice,
        unit_cost: product ? number(product.cost_price) : 0,
      }
    })

    const includeTax = wantsTax(payload.include_tax)
    const taxRate = includeTax ? round2(payload.tax_rate) : 0
    const totals = calculateTotals(items, {
      discount: payload.discount,
      taxRate,
      includeTax,
    })

    const requestedPaid = Math.max(0, round2(payload.amount_paid))
    const amountPaid = Math.min(requestedPaid, totals.total_amount)

    const invoiceNumber = await nextNumber(tx, ctx.companyId, 'invoice', 'INV')
    const issueDate = dateValue(payload.issue_date, today())
    // Walk-in sales are settled on the spot, so the due date defaults to the
    // issue date. Registered customers keep an explicit due date (or none).
    const due = dateValue(payload.due_date, null) || (customer.id ? null : issueDate)

    // Insert as unpaid, then let recordReceipt apply the opening payment once.
    const invoice = await tx.one(
      `INSERT INTO invoices
        (company_id, invoice_number, purchase_order_number, customer_id, customer_name, customer_email, customer_phone,
         customer_address, location_id, status, issue_date, due_date, subtotal, discount, tax_rate, include_tax,
         is_delivery_note, tax_amount, total_amount, amount_paid, balance, notes, quotation_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        RETURNING *`,
      [
        ctx.companyId,
        invoiceNumber,
        text(payload.purchase_order_number) || null,
        customer.id,
        customer.name,
        customer.email,
        customer.phone,
        customer.address,
        location.id,
        invoiceStatus(totals.total_amount, 0),
        issueDate,
        due,
        totals.subtotal,
        totals.discount,
        taxRate,
        includeTax,
        payload.is_delivery_note === true || payload.is_delivery_note === 'true',
        totals.tax_amount,
        totals.total_amount,
        0,
        totals.total_amount,
        text(payload.notes) || null,
        payload.quotation_id || null,
        ctx.userId,
      ],
    )

    let totalCost = 0
    for (const item of totals.items) {
      await tx.query(
        `INSERT INTO invoice_items
          (invoice_id, product_id, description, quantity, unit_price, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          invoice.id,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.unit_cost,
          item.line_total,
        ],
      )
      if (!item.product_id) continue
      totalCost = round2(totalCost + item.quantity * item.unit_cost)
      await changeStock(tx, ctx, {
        productId: item.product_id,
        locationId: location.id,
        delta: -item.quantity,
        unitCost: item.unit_cost,
        type: 'sale',
        referenceType: 'invoice',
        referenceId: invoice.id,
        referenceNo: invoiceNumber,
        notes: `Sold on ${invoiceNumber}`,
      })
    }

    await postJournal(tx, ctx, {
      date: invoice.issue_date,
      reference: invoiceNumber,
      description: `Sale to ${customer.name}`,
      sourceType: 'invoice',
      sourceId: invoice.id,
      lines: [
        { account_name: 'Accounts Receivable', debit: invoice.total_amount, credit: 0 },
        { account_name: 'Sales Revenue', debit: 0, credit: invoice.total_amount },
        { account_name: 'Cost of Goods Sold', debit: totalCost, credit: 0 },
        { account_name: 'Inventory', debit: 0, credit: totalCost },
      ],
    })

    if (amountPaid > 0) {
      await recordReceipt(tx, ctx, {
        invoice,
        amount: amountPaid,
        method: payload.payment_method,
        reference: payload.payment_reference,
        date: invoice.issue_date,
        notes: 'Payment received with invoice',
      })
    }

    return getInvoiceById(ctx, invoice.id, tx)
  }

  async function recordReceipt(tx, ctx, { invoice, amount, method, reference, date, notes }) {
    const paymentNumber = await nextNumber(tx, ctx.companyId, 'payment', 'PAY')
    const payment = await tx.one(
      `INSERT INTO payments
        (company_id, payment_number, payment_type, invoice_id, customer_id, amount, method, reference, payment_date, notes, created_by)
       VALUES ($1,$2,'receipt',$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        ctx.companyId,
        paymentNumber,
        invoice.id,
        invoice.customer_id,
        round2(amount),
        text(method) || 'cash',
        text(reference) || null,
        dateValue(date, today()),
        text(notes) || null,
        ctx.userId,
      ],
    )

    const paid = round2(number(invoice.amount_paid) + amount)
    const balance = round2(number(invoice.total_amount) - paid)
    await tx.query(
      `UPDATE invoices
       SET amount_paid = $2, balance = $3, status = $4, updated_at = now()
       WHERE id = $1`,
      [invoice.id, paid, Math.max(0, balance), invoiceStatus(invoice.total_amount, paid)],
    )

    await createCashbookEntry(tx, ctx, {
      date: payment.payment_date,
      type: 'receipt',
      category: 'Sales Receipt',
      description: `Payment for ${invoice.invoice_number}`,
      amount: payment.amount,
      method: payment.method,
      reference: payment.payment_number,
      sourceType: 'payment',
      sourceId: payment.id,
      notes,
    })

    await postJournal(tx, ctx, {
      date: payment.payment_date,
      reference: payment.payment_number,
      description: `Receipt for ${invoice.invoice_number}`,
      sourceType: 'payment',
      sourceId: payment.id,
      lines: [
        { account_name: cashAccount(payment.method), debit: payment.amount, credit: 0 },
        { account_name: 'Accounts Receivable', debit: 0, credit: payment.amount },
      ],
    })

    return payment
  }

  async function getInvoiceById(ctx, id, tx = null) {
    const runner = tx || { query, one }
    const invoice = await runner.one(
      `SELECT i.*, i.subtotal::float, i.discount::float, i.tax_amount::float, i.total_amount::float,
              i.amount_paid::float, i.balance::float, i.tax_rate::float,
              c.name AS customer_account_name, l.name AS location_name,
              u.full_name AS created_by_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN locations l ON l.id = i.location_id
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.id = $1 AND i.company_id = $2`,
      [id, ctx.companyId],
    )
    if (!invoice) throw httpError('Invoice not found.', 404)

    invoice.items = await runner.query(
      `SELECT ii.*, ii.quantity::float, ii.unit_price::float, ii.unit_cost::float, ii.line_total::float,
              p.sku,
              CASE WHEN p.id IS NOT NULL THEN p.name ELSE split_part(ii.description, chr(10), 1) END AS product_name,
              CASE WHEN p.id IS NOT NULL THEN '' ELSE split_part(ii.description, chr(10), 1) END AS item_name,
              CASE
                WHEN p.id IS NOT NULL THEN ii.description
                WHEN position(chr(10) in ii.description) > 0
                  THEN substring(ii.description from position(chr(10) in ii.description) + 1)
                ELSE NULL
              END AS item_description,
              p.unit
       FROM invoice_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.id`,
      [id],
    )
    invoice.payments = await runner.query(
      `SELECT id, payment_number, amount::float, method, reference, payment_date, notes, created_at
       FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC, created_at DESC`,
      [id],
    )
    return invoice
  }

  async function insertQuotation(tx, ctx, payload, existing = null) {
    const customer = await customerSnapshot(tx, ctx.companyId, payload.customer_id, {
      name: payload.customer_name,
      email: payload.customer_email,
      phone: payload.customer_phone,
      address: payload.customer_address,
    })
    if (!payload.items?.length) throw httpError('Add at least one item to the quotation.')

    const products = {}
    for (const productId of new Set(payload.items.map((item) => item.product_id).filter(Boolean))) {
      const product = await tx.one(
        `SELECT * FROM products WHERE id = $1 AND company_id = $2`,
        [productId, ctx.companyId],
      )
      if (!product) throw httpError('A product on this quotation was not found.', 404)
      products[productId] = product
    }

    const items = payload.items.map((item) => {
      const product = item.product_id ? products[item.product_id] : null
      if (item.product_id && !product) throw httpError('A product on this quotation was not found.', 404)
      const explicitName = text(item.item_name)
      const itemName = product ? '' : explicitName || text(item.description)
      if (!product && !itemName) throw httpError('Enter a name for every manual quotation item.')
      const quantity = round3(item.quantity)
      if (!(quantity > 0)) throw httpError('Quotation quantities must be greater than zero.')
      const unitPrice =
        item.unit_price === undefined || item.unit_price === ''
          ? number(product?.selling_price)
          : round2(item.unit_price)
      if (!product && !(unitPrice > 0)) throw httpError('Enter a price for every manual quotation item.')
      return {
        product_id: product?.id || null,
        description: product
          ? text(item.description) || null
          : manualDescription(itemName, explicitName ? text(item.description) : ''),
        quantity,
        unit_price: unitPrice,
      }
    })

    const includeTax = wantsTax(payload.include_tax)
    const taxRate = includeTax ? round2(payload.tax_rate) : 0
    const totals = calculateTotals(items, {
      discount: payload.discount,
      taxRate,
      includeTax,
    })

    let quotation
    if (existing) {
      quotation = await tx.one(
        `UPDATE quotations SET
           customer_id = $2, customer_name = $3, customer_email = $4, customer_phone = $5,
           customer_address = $6, status = $7, issue_date = $8, valid_until = $9,
           subtotal = $10, discount = $11, tax_rate = $12, include_tax = $13,
           tax_amount = $14, total_amount = $15, notes = $16, updated_at = now()
         WHERE id = $1 AND company_id = $17
         RETURNING *`,
        [
          existing.id,
          customer.id,
          customer.name,
          customer.email,
          customer.phone,
          customer.address,
          text(payload.status) || existing.status,
          dateValue(payload.issue_date, existing.issue_date),
          dateValue(payload.valid_until),
          totals.subtotal,
          totals.discount,
          taxRate,
          includeTax,
          totals.tax_amount,
          totals.total_amount,
          text(payload.notes) || null,
          ctx.companyId,
        ],
      )
      await tx.query('DELETE FROM quotation_items WHERE quotation_id = $1', [existing.id])
    } else {
      const quoteNumber = await nextNumber(tx, ctx.companyId, 'quotation', 'QT')
      quotation = await tx.one(
        `INSERT INTO quotations
          (company_id, quote_number, customer_id, customer_name, customer_email, customer_phone,
           customer_address, status, issue_date, valid_until, subtotal, discount, tax_rate, include_tax,
           tax_amount, total_amount, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          RETURNING *`,
        [
          ctx.companyId,
          quoteNumber,
          customer.id,
          customer.name,
          customer.email,
          customer.phone,
          customer.address,
          text(payload.status) || 'draft',
          dateValue(payload.issue_date, today()),
          dateValue(payload.valid_until),
          totals.subtotal,
          totals.discount,
          taxRate,
          includeTax,
          totals.tax_amount,
          totals.total_amount,
          text(payload.notes) || null,
          ctx.userId,
        ],
      )
    }

    for (const item of totals.items) {
      await tx.query(
        `INSERT INTO quotation_items
          (quotation_id, product_id, description, quantity, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          quotation.id,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.line_total,
        ],
      )
    }

    return getQuotationById(ctx, quotation.id, tx)
  }

  async function getQuotationById(ctx, id, tx = null) {
    const runner = tx || { query, one }
    const quotation = await runner.one(
      `SELECT q.*, q.subtotal::float, q.discount::float, q.tax_amount::float, q.total_amount::float,
              q.tax_rate::float, c.name AS customer_account_name, u.full_name AS created_by_name
       FROM quotations q
       LEFT JOIN customers c ON c.id = q.customer_id
       LEFT JOIN users u ON u.id = q.created_by
       WHERE q.id = $1 AND q.company_id = $2`,
      [id, ctx.companyId],
    )
    if (!quotation) throw httpError('Quotation not found.', 404)
    quotation.items = await runner.query(
      `SELECT qi.*, qi.quantity::float, qi.unit_price::float, qi.line_total::float,
              p.sku,
              CASE WHEN p.id IS NOT NULL THEN p.name ELSE split_part(qi.description, chr(10), 1) END AS product_name,
              CASE WHEN p.id IS NOT NULL THEN '' ELSE split_part(qi.description, chr(10), 1) END AS item_name,
              CASE
                WHEN p.id IS NOT NULL THEN qi.description
                WHEN position(chr(10) in qi.description) > 0
                  THEN substring(qi.description from position(chr(10) in qi.description) + 1)
                ELSE NULL
              END AS item_description,
              p.unit
       FROM quotation_items qi
       LEFT JOIN products p ON p.id = qi.product_id
       WHERE qi.quotation_id = $1
       ORDER BY qi.id`,
      [id],
    )
    return quotation
  }

  async function applyPurchaseReceipt(tx, ctx, purchase, items) {
    const location = await resolveLocation(tx, ctx.companyId, purchase.location_id)
    for (const item of items) {
      if (!item.product_id) continue
      await changeStock(tx, ctx, {
        productId: item.product_id,
        locationId: location.id,
        delta: number(item.quantity),
        unitCost: number(item.unit_cost),
        expiryDate: item.expiry_date,
        type: 'purchase',
        referenceType: 'purchase_order',
        referenceId: purchase.id,
        referenceNo: purchase.po_number,
        notes: `Received on ${purchase.po_number}`,
      })
    }

    const inventoryValue = round2(
      number(purchase.subtotal) + number(purchase.shipping_cost),
    )
    await postJournal(tx, ctx, {
      date: purchase.order_date,
      reference: purchase.po_number,
      description: `Purchase from supplier`,
      sourceType: 'purchase_order',
      sourceId: purchase.id,
      lines: [
        { account_name: 'Inventory', debit: inventoryValue, credit: 0 },
        { account_name: 'VAT Input', debit: purchase.tax_amount, credit: 0 },
        { account_name: 'Accounts Payable', debit: 0, credit: purchase.total_amount },
      ],
    })
  }

  async function getProductById(ctx, id, runner = null) {
    const db = runner || { query, one }
    const product = await db.one(
      `SELECT p.*, p.cost_price::float, p.selling_price::float, p.wholesale_price::float,
              p.quantity_on_hand::float, p.reorder_level::float,
              c.name AS category_name, l.name AS location_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN locations l ON l.id = p.location_id
       WHERE p.id = $1 AND p.company_id = $2`,
      [id, ctx.companyId],
    )
    if (!product) throw httpError('Product not found.', 404)
    product.levels = await db.query(
      `SELECT sl.location_id, l.name AS location_name, sl.quantity::float AS quantity
       FROM product_stock_levels sl
       JOIN locations l ON l.id = sl.location_id
       WHERE sl.product_id = $1 ORDER BY l.name`,
      [id],
    )
    return product
  }

  async function getPurchaseById(ctx, id, runner = null) {
    const db = runner || { query, one }
    const purchase = await db.one(
      `SELECT po.*, po.subtotal::float, po.tax_amount::float, po.total_amount::float,
              po.amount_paid::float, po.tax_rate::float, po.shipping_cost::float,
              s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone,
              l.name AS location_name, u.full_name AS created_by_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN locations l ON l.id = po.location_id
       LEFT JOIN users u ON u.id = po.created_by
       WHERE po.id = $1 AND po.company_id = $2`,
      [id, ctx.companyId],
    )
    if (!purchase) throw httpError('Purchase order not found.', 404)
    purchase.items = await db.query(
      `SELECT poi.*, poi.quantity::float, poi.unit_cost::float, poi.line_total::float,
              p.sku,
              CASE WHEN p.id IS NOT NULL THEN p.name ELSE split_part(poi.description, chr(10), 1) END AS product_name,
              CASE WHEN p.id IS NOT NULL THEN '' ELSE split_part(poi.description, chr(10), 1) END AS item_name,
              CASE
                WHEN p.id IS NOT NULL THEN poi.description
                WHEN position(chr(10) in poi.description) > 0
                  THEN substring(poi.description from position(chr(10) in poi.description) + 1)
                ELSE NULL
              END AS item_description,
              p.unit
       FROM purchase_order_items poi
       LEFT JOIN products p ON p.id = poi.product_id
       WHERE poi.purchase_order_id = $1 ORDER BY poi.id`,
      [id],
    )
    return purchase
  }

  async function getTransferById(ctx, id, runner = null) {
    const db = runner || { query, one }
    const transfer = await db.one(
      `SELECT t.*, fl.name AS from_location_name, tl.name AS to_location_name,
              u.full_name AS created_by_name
       FROM stock_transfers t
       LEFT JOIN locations fl ON fl.id = t.from_location_id
       LEFT JOIN locations tl ON tl.id = t.to_location_id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = $1 AND t.company_id = $2`,
      [id, ctx.companyId],
    )
    if (!transfer) throw httpError('Transfer not found.', 404)
    transfer.items = await db.query(
      `SELECT sti.*, sti.quantity::float, p.sku, p.name AS product_name, p.unit
       FROM stock_transfer_items sti
       LEFT JOIN products p ON p.id = sti.product_id
       WHERE sti.transfer_id = $1 ORDER BY sti.id`,
      [id],
    )
    return transfer
  }

  const repo = {
    company: {
      async get(ctx) {
        return one('SELECT * FROM companies WHERE id = $1', [ctx.companyId])
      },
      async update(ctx, payload) {
        const row = await one(
          `UPDATE companies SET
             name = $2, legal_name = $3, email = $4, phone = $5, phone_alt = $6,
             address = $7, city = $8, country = $9, website = $10, tax_number = $11,
             currency = $12, tax_rate = $13, logo_url = $14, quotation_terms = $15,
             invoice_terms = $16, updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            ctx.companyId,
            text(payload.name) || 'Devolve',
            text(payload.legal_name) || null,
            text(payload.email) || null,
            text(payload.phone) || null,
            text(payload.phone_alt) || null,
            text(payload.address) || null,
            text(payload.city) || null,
            text(payload.country) || null,
            text(payload.website) || null,
            text(payload.tax_number) || null,
            text(payload.currency) || 'USD',
            round2(payload.tax_rate),
            text(payload.logo_url) || '/logo2.jpg',
            text(payload.quotation_terms) || null,
            text(payload.invoice_terms) || null,
          ],
        )
        return row
      },
    },

    users: {
      async list(ctx) {
        return query(
          `SELECT id, full_name, email, phone, role, status, must_setup, permissions, last_login_at, created_at
           FROM users WHERE company_id = $1 ORDER BY role, full_name`,
          [ctx.companyId],
        )
      },
      async create(ctx, payload) {
        const email = text(payload.email).toLowerCase()
        if (!text(payload.full_name)) throw httpError('Enter the staff member name.')
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError('Enter a valid email address.')
        const role = payload.role === 'admin' ? 'admin' : 'member'
        const permissions = normalizePermissions(payload.permissions, role)
        try {
          const user = await one(
            `INSERT INTO users (company_id, full_name, email, phone, role, status, must_setup, permissions)
             VALUES ($1,$2,$3,$4,$5,'active',true,$6::text[])
             RETURNING id, full_name, email, phone, role, status, must_setup, permissions, created_at`,
            [
              ctx.companyId,
              text(payload.full_name),
              email,
              text(payload.phone) || null,
              role,
              permissions,
            ],
          )
          await repo.users.sendSetupCode(ctx, user.id)
          return user
        } catch (error) {
          throw asError(error)
        }
      },
      async update(ctx, payload) {
        const role = payload.role === 'admin' ? 'admin' : 'member'
        const permissions = normalizePermissions(payload.permissions, role)
        const user = await one(
          `UPDATE users
           SET full_name = $2, email = $3, phone = $4, role = $5, status = $6,
               permissions = $8::text[], updated_at = now()
           WHERE id = $1 AND company_id = $7
           RETURNING id, full_name, email, phone, role, status, must_setup, permissions, created_at`,
          [
            payload.id,
            text(payload.full_name),
            text(payload.email).toLowerCase(),
            text(payload.phone) || null,
            role,
            payload.status === 'inactive' ? 'inactive' : 'active',
            ctx.companyId,
            permissions,
          ],
        )
        if (!user) throw httpError('Staff member not found.', 404)
        return user
      },
      async remove(ctx, payload) {
        if (payload.id === ctx.userId) throw httpError('You cannot remove your own account.')
        const admins = await one(
          `SELECT count(*)::int AS count FROM users WHERE company_id = $1 AND role = 'admin' AND status = 'active'`,
          [ctx.companyId],
        )
        const target = await one(`SELECT * FROM users WHERE id = $1 AND company_id = $2`, [
          payload.id,
          ctx.companyId,
        ])
        if (!target) throw httpError('Staff member not found.', 404)
        if (target.role === 'admin' && Number(admins.count) <= 1) {
          throw httpError('Keep at least one active administrator.')
        }
        await query('DELETE FROM users WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
      async sendSetupCode(ctx, userId) {
        const user = await one(`SELECT * FROM users WHERE id = $1 AND company_id = $2`, [
          userId,
          ctx.companyId,
        ])
        if (!user) throw httpError('Staff member not found.', 404)
        const code = generateCode()
        await query(
          `UPDATE auth_codes SET used_at = now()
           WHERE user_id = $1 AND purpose = 'setup' AND used_at IS NULL`,
          [user.id],
        )
        await query(
          `INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at)
           VALUES ($1,'setup',$2, now() + interval '10 minutes')`,
          [user.id, hashCode(code)],
        )
        const admin = await one(
          `SELECT full_name, email FROM users
           WHERE company_id = $1 AND role = 'admin' AND status = 'active'
           ORDER BY created_at LIMIT 1`,
          [ctx.companyId],
        )
        const recipient = {
          email: OTP_EMAIL,
          name: admin?.full_name || user.full_name,
        }
        const sent = await mail.setupCode({
          to: recipient.email,
          name: recipient.name,
          code,
          account: user.email,
          accountName: user.full_name,
        })
        if (!sent) {
          console.log(`[setup] mail not sent. ${user.email} setup code (admin ${recipient.email}): ${code}`)
        }
        return { sent, email: recipient.email }
      },
    },

    categories: {
      async list(ctx) {
        return query(
          `SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id) AS product_count
           FROM categories c WHERE c.company_id = $1 ORDER BY c.name`,
          [ctx.companyId],
        )
      },
      async create(ctx, payload) {
        try {
          return await one(
            `INSERT INTO categories (company_id, name, description) VALUES ($1,$2,$3) RETURNING *`,
            [ctx.companyId, text(payload.name), text(payload.description) || null],
          )
        } catch (error) {
          throw asError(error)
        }
      },
      async update(ctx, payload) {
        const row = await one(
          `UPDATE categories SET name = $2, description = $3 WHERE id = $1 AND company_id = $4 RETURNING *`,
          [payload.id, text(payload.name), text(payload.description) || null, ctx.companyId],
        )
        if (!row) throw httpError('Category not found.', 404)
        return row
      },
      async remove(ctx, payload) {
        await query('DELETE FROM categories WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
    },

    locations: {
      async list(ctx) {
        return query(
          `SELECT l.*, (SELECT count(*)::int FROM product_stock_levels sl WHERE sl.location_id = l.id) AS product_count
           FROM locations l WHERE l.company_id = $1 ORDER BY l.is_default DESC, created_at ASC LIMIT 1`,
          [ctx.companyId],
        )
      },
      async create() {
        throw httpError('This app uses one main shop only.', 400)
      },
      async update() {
        throw httpError('This app uses one main shop only.', 400)
      },
      async remove() {
        throw httpError('The main shop cannot be removed.', 400)
      },
    },

    products: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['p.company_id = $1']
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          const i = values.length
          conditions.push(
            `(p.name ILIKE $${i} OR p.sku ILIKE $${i} OR p.part_number ILIKE $${i} OR COALESCE(p.brand,'') ILIKE $${i}
              OR COALESCE(p.barcode,'') ILIKE $${i}
              OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE $${i}))`,
          )
        }
        if (filters.category_id) {
          values.push(filters.category_id)
          conditions.push(`p.category_id = $${values.length}`)
        }
        if (filters.status) {
          values.push(filters.status)
          conditions.push(`p.status = $${values.length}`)
        }
        if (filters.low_stock) conditions.push('p.quantity_on_hand <= p.reorder_level')
        if (filters.expiring_days !== undefined && filters.expiring_days !== null) {
          values.push(Math.max(0, Math.round(number(filters.expiring_days, 90))))
          conditions.push(
            `p.expiry_date IS NOT NULL AND p.expiry_date <= current_date + $${values.length}::int`,
          )
        }
        return query(
          `SELECT p.id, p.sku, p.part_number, p.barcode, p.name, p.description, p.category_id, p.brand, p.unit,
                  p.cost_price::float AS cost_price, p.selling_price::float AS selling_price,
                  p.wholesale_price::float AS wholesale_price,
                  p.quantity_on_hand::float AS quantity_on_hand,
                  p.reorder_level::float AS reorder_level, p.location_id, p.expiry_date,
                  p.tags, p.status, p.created_at, p.updated_at,
                  c.name AS category_name, l.name AS location_name,
                  (p.quantity_on_hand <= p.reorder_level) AS low_stock,
                  CASE WHEN p.expiry_date IS NULL THEN NULL
                       ELSE (p.expiry_date - current_date)::int END AS days_to_expiry
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           LEFT JOIN locations l ON l.id = p.location_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY p.name`,
          values,
        )
      },
      async get(ctx, id) {
        return getProductById(ctx, id)
      },
      async create(ctx, payload) {
        try {
          const partNumber = text(payload.part_number)
          if (!partNumber) throw httpError('Enter the part number.', 400)
          return await withTransaction(async (tx) => {
            const location = await resolveLocation(tx, ctx.companyId, payload.location_id)
            const opening = Math.max(0, round3(payload.opening_quantity))
            const product = await tx.one(
              `INSERT INTO products
                (company_id, sku, part_number, barcode, name, description, category_id, brand, unit, cost_price,
                 selling_price, wholesale_price, quantity_on_hand, reorder_level, location_id,
                 expiry_date, tags, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               RETURNING *`,
              [
                ctx.companyId,
                text(payload.sku),
                partNumber,
                text(payload.barcode) || null,
                text(payload.name),
                text(payload.description) || null,
                payload.category_id || null,
                text(payload.brand) || null,
                text(payload.unit) || 'pc',
                round2(payload.cost_price),
                round2(payload.selling_price),
                round2(payload.wholesale_price),
                opening,
                round3(payload.reorder_level),
                location.id,
                dateValue(payload.expiry_date),
                Array.isArray(payload.tags)
                  ? payload.tags.map((tag) => text(tag)).filter(Boolean)
                  : text(payload.tags)
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                payload.status === 'discontinued' ? 'discontinued' : 'active',
              ],
            )
            if (opening > 0) {
              await tx.query(
                `INSERT INTO product_stock_levels (product_id, location_id, quantity) VALUES ($1,$2,$3)`,
                [product.id, location.id, opening],
              )
              await tx.query(
                `INSERT INTO stock_movements
                  (company_id, product_id, location_id, movement_type, quantity_delta, unit_cost,
                   reference_type, notes, created_by)
                 VALUES ($1,$2,$3,'opening',$4,$5,'opening','Opening stock',$6)`,
                [ctx.companyId, product.id, location.id, opening, round2(payload.cost_price), ctx.userId],
              )
              await postJournal(tx, ctx, {
                date: today(),
                reference: text(payload.sku),
                description: `Opening stock for ${text(payload.name)}`,
                sourceType: 'product',
                sourceId: product.id,
                lines: [
                  {
                    account_name: 'Inventory',
                    debit: round2(opening * number(payload.cost_price)),
                    credit: 0,
                  },
                  {
                    account_name: 'Opening Balance Equity',
                    debit: 0,
                    credit: round2(opening * number(payload.cost_price)),
                  },
                ],
              })
            }
            return getProductById(ctx, product.id, tx)
          })
        } catch (error) {
          throw asError(error)
        }
      },
      async update(ctx, payload) {
        try {
          const partNumber = text(payload.part_number)
          if (!partNumber) throw httpError('Enter the part number.', 400)
          const product = await one(
            `UPDATE products SET
               sku = $2, barcode = $3, name = $4, description = $5, category_id = $6, brand = $7,
               unit = $8, cost_price = $9, selling_price = $10, wholesale_price = $11,
               reorder_level = $12, location_id = $13, expiry_date = $14, tags = $15,
               status = $16, part_number = $17, updated_at = now()
             WHERE id = $1 AND company_id = $18
             RETURNING id`,
            [
              payload.id,
              text(payload.sku),
              text(payload.barcode) || null,
              text(payload.name),
              text(payload.description) || null,
              payload.category_id || null,
              text(payload.brand) || null,
              text(payload.unit) || 'pc',
              round2(payload.cost_price),
              round2(payload.selling_price),
              round2(payload.wholesale_price),
              round3(payload.reorder_level),
              payload.location_id || null,
              dateValue(payload.expiry_date),
              Array.isArray(payload.tags)
                ? payload.tags.map((tag) => text(tag)).filter(Boolean)
                : text(payload.tags)
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
              payload.status === 'discontinued' ? 'discontinued' : 'active',
              partNumber,
              ctx.companyId,
            ],
          )
          if (!product) throw httpError('Product not found.', 404)
          return repo.products.get(ctx, payload.id)
        } catch (error) {
          throw asError(error)
        }
      },
      async remove(ctx, payload) {
        await query('DELETE FROM products WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
      async movements(ctx, productId, limit = 150) {
        return query(
          `SELECT m.*, m.quantity_delta::float, m.unit_cost::float,
                  l.name AS location_name, u.full_name AS created_by_name
           FROM stock_movements m
           LEFT JOIN locations l ON l.id = m.location_id
           LEFT JOIN users u ON u.id = m.created_by
           WHERE m.company_id = $1 AND m.product_id = $2
           ORDER BY m.created_at DESC LIMIT $3`,
          [ctx.companyId, productId, Math.min(500, Math.max(1, Math.round(number(limit, 150))))],
        )
      },
      async adjust(ctx, payload) {
        return withTransaction(async (tx) => {
          const result = await changeStock(tx, ctx, {
            productId: payload.product_id,
            locationId: payload.location_id,
            delta: payload.quantity_delta,
            unitCost: payload.unit_cost,
            type: payload.movement_type === 'damage' ? 'damage' : 'adjustment',
            referenceType: 'adjustment',
            notes: text(payload.notes) || text(payload.reason) || 'Stock adjustment',
          })
          const value = round2(Math.abs(number(payload.quantity_delta)) * number(result.cost_price))
          if (value > 0) {
            await postJournal(tx, ctx, {
              date: today(),
              reference: result.sku,
              description: `Stock adjustment for ${result.name}`,
              sourceType: 'adjustment',
              sourceId: result.id,
              lines:
                number(payload.quantity_delta) > 0
                  ? [
                      { account_name: 'Inventory', debit: value, credit: 0 },
                      { account_name: 'Inventory Adjustment', debit: 0, credit: value },
                    ]
                  : [
                      { account_name: 'Inventory Adjustment', debit: value, credit: 0 },
                      { account_name: 'Inventory', debit: 0, credit: value },
                    ],
            })
          }
          return getProductById(ctx, payload.product_id, tx)
        })
      },
      async nextSku(ctx, payload = {}) {
        let prefix = text(payload.prefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
        if (!prefix && payload.category_id) {
          const category = await one(`SELECT name FROM categories WHERE id = $1 AND company_id = $2`, [
            payload.category_id,
            ctx.companyId,
          ])
          prefix = text(category?.name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
        }
        if (!prefix) prefix = 'SKU'
        const row = await one(
          `SELECT count(*)::int AS count FROM products WHERE company_id = $1 AND sku ILIKE $2`,
          [ctx.companyId, `${prefix}-%`],
        )
        let next = Number(row.count) + 1
        let candidate = `${prefix}-${String(next).padStart(4, '0')}`
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const exists = await one(
            `SELECT 1 AS found FROM products WHERE company_id = $1 AND lower(sku) = lower($2)`,
            [ctx.companyId, candidate],
          )
          if (!exists) break
          next += 1
          candidate = `${prefix}-${String(next).padStart(4, '0')}`
        }
        return candidate
      },
    },

    suppliers: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        let where = 's.company_id = $1'
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          where += ` AND (s.name ILIKE $${values.length} OR COALESCE(s.email,'') ILIKE $${values.length} OR COALESCE(s.phone,'') ILIKE $${values.length})`
        }
        if (filters.status) {
          values.push(filters.status)
          where += ` AND s.status = $${values.length}`
        }
        return query(
          `SELECT s.*,
                  COALESCE((SELECT SUM(po.total_amount) FROM purchase_orders po
                            WHERE po.supplier_id = s.id AND po.status = 'received'),0)::float AS purchased_total,
                  COALESCE((SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id),0)::int AS order_count
           FROM suppliers s WHERE ${where} ORDER BY s.name`,
          values,
        )
      },
      async create(ctx, payload) {
        return one(
          `INSERT INTO suppliers
            (company_id, name, contact_name, email, phone, address, city, country, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            ctx.companyId,
            text(payload.name),
            text(payload.contact_name) || null,
            text(payload.email) || null,
            text(payload.phone) || null,
            text(payload.address) || null,
            text(payload.city) || null,
            text(payload.country) || null,
            text(payload.notes) || null,
            payload.status === 'inactive' ? 'inactive' : 'active',
          ],
        )
      },
      async update(ctx, payload) {
        const row = await one(
          `UPDATE suppliers SET name = $2, contact_name = $3, email = $4, phone = $5,
             address = $6, city = $7, country = $8, notes = $9, status = $10, updated_at = now()
           WHERE id = $1 AND company_id = $11 RETURNING *`,
          [
            payload.id,
            text(payload.name),
            text(payload.contact_name) || null,
            text(payload.email) || null,
            text(payload.phone) || null,
            text(payload.address) || null,
            text(payload.city) || null,
            text(payload.country) || null,
            text(payload.notes) || null,
            payload.status === 'inactive' ? 'inactive' : 'active',
            ctx.companyId,
          ],
        )
        if (!row) throw httpError('Supplier not found.', 404)
        return row
      },
      async remove(ctx, payload) {
        await query('DELETE FROM suppliers WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
    },

    customers: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        let where = 'c.company_id = $1'
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          where += ` AND (c.name ILIKE $${values.length} OR COALESCE(c.company_name,'') ILIKE $${values.length} OR COALESCE(c.email,'') ILIKE $${values.length} OR COALESCE(c.phone,'') ILIKE $${values.length})`
        }
        if (filters.status) {
          values.push(filters.status)
          where += ` AND c.status = $${values.length}`
        }
        return query(
          `SELECT c.*,
                  COALESCE((SELECT SUM(i.balance) FROM invoices i
                            WHERE i.customer_id = c.id AND i.status NOT IN ('void','draft')),0)::float AS balance,
                  COALESCE((SELECT COUNT(*) FROM invoices i
                            WHERE i.customer_id = c.id AND i.status NOT IN ('void','draft')),0)::int AS invoice_count,
                  COALESCE((SELECT SUM(i.total_amount) FROM invoices i
                            WHERE i.customer_id = c.id AND i.status NOT IN ('void','draft')),0)::float AS total_sales
           FROM customers c WHERE ${where} ORDER BY c.name`,
          values,
        )
      },
      async create(ctx, payload) {
        return one(
          `INSERT INTO customers
            (company_id, name, company_name, email, phone, address, city, customer_type,
             credit_limit, vat_number, tin_number, is_zna, vendor_number, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [
            ctx.companyId,
            text(payload.name),
            text(payload.company_name) || null,
            text(payload.email) || null,
            text(payload.phone) || null,
            text(payload.address) || null,
            text(payload.city) || null,
            text(payload.customer_type) || 'retail',
            round2(payload.credit_limit),
            text(payload.vat_number) || null,
            text(payload.tin_number) || null,
            payload.is_zna === true || payload.is_zna === 'true',
            text(payload.vendor_number) || null,
            text(payload.notes) || null,
            payload.status === 'inactive' ? 'inactive' : 'active',
          ],
        )
      },
      async update(ctx, payload) {
        const row = await one(
          `UPDATE customers SET name = $2, company_name = $3, email = $4, phone = $5,
             address = $6, city = $7, customer_type = $8, credit_limit = $9,
             vat_number = $10, tin_number = $11, is_zna = $12, vendor_number = $13,
             notes = $14, status = $15, updated_at = now()
           WHERE id = $1 AND company_id = $16 RETURNING *`,
          [
            payload.id,
            text(payload.name),
            text(payload.company_name) || null,
            text(payload.email) || null,
            text(payload.phone) || null,
            text(payload.address) || null,
            text(payload.city) || null,
            text(payload.customer_type) || 'retail',
            round2(payload.credit_limit),
            text(payload.vat_number) || null,
            text(payload.tin_number) || null,
            payload.is_zna === true || payload.is_zna === 'true',
            text(payload.vendor_number) || null,
            text(payload.notes) || null,
            payload.status === 'inactive' ? 'inactive' : 'active',
            ctx.companyId,
          ],
        )
        if (!row) throw httpError('Customer not found.', 404)
        return row
      },
      async remove(ctx, payload) {
        await query('DELETE FROM customers WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
      async statement(ctx, customerId) {
        const customer = await one(`SELECT * FROM customers WHERE id = $1 AND company_id = $2`, [
          customerId,
          ctx.companyId,
        ])
        if (!customer) throw httpError('Customer not found.', 404)
        const invoices = await query(
          `SELECT id, invoice_number, issue_date, due_date, total_amount::float, amount_paid::float,
                  balance::float, status FROM invoices
           WHERE company_id = $1 AND customer_id = $2 AND status <> 'void'
           ORDER BY issue_date DESC`,
          [ctx.companyId, customerId],
        )
        return { customer, invoices }
      },
    },

    purchases: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['po.company_id = $1']
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          conditions.push(
            `(po.po_number ILIKE $${values.length} OR COALESCE(s.name,'') ILIKE $${values.length})`,
          )
        }
        if (filters.status) {
          values.push(filters.status)
          conditions.push(`po.status = $${values.length}`)
        }
        if (filters.from) {
          values.push(dateValue(filters.from, today()))
          conditions.push(`po.order_date >= $${values.length}`)
        }
        if (filters.to) {
          values.push(dateValue(filters.to, today()))
          conditions.push(`po.order_date <= $${values.length}`)
        }
        return query(
          `SELECT po.*, po.subtotal::float, po.tax_amount::float, po.total_amount::float,
                  po.amount_paid::float, po.tax_rate::float,
                  s.name AS supplier_name, l.name AS location_name,
                  (SELECT COUNT(*)::int FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS item_count
           FROM purchase_orders po
           LEFT JOIN suppliers s ON s.id = po.supplier_id
           LEFT JOIN locations l ON l.id = po.location_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY po.order_date DESC, po.created_at DESC`,
          values,
        )
      },
      async get(ctx, id) {
        return getPurchaseById(ctx, id)
      },
      async create(ctx, payload) {
        return withTransaction(async (tx) => {
          if (!payload.items?.length) throw httpError('Add at least one item to the purchase.')
          const location = await resolveLocation(tx, ctx.companyId, payload.location_id)
          const items = payload.items.map((item) => {
            const quantity = round3(item.quantity)
            const unitCost = round2(item.unit_cost)
            if (!(quantity > 0)) throw httpError('Purchase quantities must be greater than zero.')
            const explicitName = text(item.item_name)
            const itemName = item.product_id ? '' : explicitName || text(item.description)
            if (!item.product_id && !itemName) {
              throw httpError('Enter a name for every manual purchase item.')
            }
            if (!item.product_id && !(unitCost > 0)) {
              throw httpError('Enter a cost for every manual purchase item.')
            }
            return {
              product_id: item.product_id || null,
              description: item.product_id
                ? text(item.description) || null
                : manualDescription(itemName, explicitName ? text(item.description) : ''),
              quantity,
              unit_cost: unitCost,
              line_total: round2(quantity * unitCost),
              expiry_date: dateValue(item.expiry_date),
            }
          })
          const subtotal = round2(items.reduce((sum, item) => sum + item.line_total, 0))
          const shipping = round2(payload.shipping_cost)
          const includeTax = wantsTax(payload.include_tax)
          const taxRate = includeTax ? round2(payload.tax_rate) : 0
          const taxAmount = round2(((subtotal + shipping) * taxRate) / 100)
          const total = round2(subtotal + shipping + taxAmount)
          const status = ['draft', 'ordered', 'received'].includes(payload.status)
            ? payload.status
            : 'draft'
          const poNumber = await nextNumber(tx, ctx.companyId, 'purchase', 'PO')

          const purchase = await tx.one(
            `INSERT INTO purchase_orders
              (company_id, po_number, supplier_id, location_id, status, order_date, expected_date,
               subtotal, tax_rate, include_tax, tax_amount, shipping_cost, total_amount, amount_paid, notes,
               created_by, received_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING *`,
            [
              ctx.companyId,
              poNumber,
              payload.supplier_id || null,
              location.id,
              status,
              dateValue(payload.order_date, today()),
              dateValue(payload.expected_date),
              subtotal,
              taxRate,
              includeTax,
              taxAmount,
              shipping,
              total,
              0,
              text(payload.notes) || null,
              ctx.userId,
              status === 'received' ? new Date().toISOString() : null,
            ],
          )

          for (const item of items) {
            await tx.query(
              `INSERT INTO purchase_order_items
                (purchase_order_id, product_id, description, quantity, unit_cost, line_total, expiry_date)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [
                purchase.id,
                item.product_id,
                item.description,
                item.quantity,
                item.unit_cost,
                item.line_total,
                item.expiry_date,
              ],
            )
          }

          if (status === 'received') {
            await applyPurchaseReceipt(tx, ctx, purchase, items)
          }
          return getPurchaseById(ctx, purchase.id, tx)
        })
      },
      async receive(ctx, payload) {
        return withTransaction(async (tx) => {
          const purchase = await tx.one(
            `SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2 FOR UPDATE`,
            [payload.id, ctx.companyId],
          )
          if (!purchase) throw httpError('Purchase order not found.', 404)
          if (purchase.status === 'received') throw httpError('This purchase has already been received.')
          if (purchase.status === 'cancelled') throw httpError('This purchase was cancelled.')
          const items = await tx.query(
            `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`,
            [purchase.id],
          )
          await applyPurchaseReceipt(tx, ctx, purchase, items)
          await tx.query(
            `UPDATE purchase_orders SET status = 'received', received_at = now(), updated_at = now()
             WHERE id = $1`,
            [purchase.id],
          )
          return getPurchaseById(ctx, purchase.id, tx)
        })
      },
      async remove(ctx, payload) {
        const purchase = await one(
          `SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2`,
          [payload.id, ctx.companyId],
        )
        if (!purchase) throw httpError('Purchase order not found.', 404)
        if (purchase.status === 'received') {
          throw httpError('Received purchases cannot be deleted; the stock has already been posted.')
        }
        await query('DELETE FROM purchase_orders WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
    },

    sales: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['i.company_id = $1']
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          conditions.push(
            `(i.invoice_number ILIKE $${values.length} OR i.customer_name ILIKE $${values.length})`,
          )
        }
        if (filters.status) {
          values.push(filters.status)
          conditions.push(`i.status = $${values.length}`)
        }
        if (filters.customer_id) {
          values.push(filters.customer_id)
          conditions.push(`i.customer_id = $${values.length}`)
        }
        if (filters.from) {
          values.push(dateValue(filters.from, today()))
          conditions.push(`i.issue_date >= $${values.length}`)
        }
        if (filters.to) {
          values.push(dateValue(filters.to, today()))
          conditions.push(`i.issue_date <= $${values.length}`)
        }
        return query(
          `SELECT i.*, i.subtotal::float, i.discount::float, i.tax_amount::float,
                  i.total_amount::float, i.amount_paid::float, i.balance::float, i.tax_rate::float,
                  l.name AS location_name,
                  (SELECT COUNT(*)::int FROM invoice_items ii WHERE ii.invoice_id = i.id) AS item_count
           FROM invoices i
           LEFT JOIN locations l ON l.id = i.location_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY i.issue_date DESC, i.created_at DESC`,
          values,
        )
      },
      async get(ctx, id) {
        return getInvoiceById(ctx, id)
      },
      async create(ctx, payload) {
        return withTransaction(async (tx) => insertInvoice(tx, ctx, payload))
      },
      async addPayment(ctx, payload) {
        return withTransaction(async (tx) => {
          const invoice = await tx.one(
            `SELECT * FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`,
            [payload.invoice_id, ctx.companyId],
          )
          if (!invoice) throw httpError('Invoice not found.', 404)
          if (invoice.status === 'void') throw httpError('This invoice was voided.')
          const amount = round2(payload.amount)
          if (!(amount > 0)) throw httpError('Enter a payment amount.')
          if (amount > number(invoice.balance) + 0.01) {
            throw httpError(`The balance on this invoice is ${invoice.balance}.`)
          }
          await recordReceipt(tx, ctx, {
            invoice,
            amount,
            method: payload.method,
            reference: payload.reference,
            date: payload.payment_date,
            notes: payload.notes,
          })
          return getInvoiceById(ctx, invoice.id, tx)
        })
      },
      async remove(ctx, payload) {
        return withTransaction(async (tx) => {
          const invoice = await tx.one(
            `SELECT * FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`,
            [payload.id, ctx.companyId],
          )
          if (!invoice) throw httpError('Invoice not found.', 404)
          if (invoice.status === 'void') throw httpError('This invoice is already void.')
          if (number(invoice.amount_paid) > 0) {
            throw httpError('This invoice has payments. Reverse the payments before voiding it.')
          }
          const items = await tx.query(`SELECT * FROM invoice_items WHERE invoice_id = $1`, [
            invoice.id,
          ])
          let cost = 0
          for (const item of items) {
            if (!item.product_id) continue
            cost = round2(cost + number(item.quantity) * number(item.unit_cost))
            await changeStock(tx, ctx, {
              productId: item.product_id,
              locationId: invoice.location_id,
              delta: number(item.quantity),
              unitCost: number(item.unit_cost),
              type: 'return',
              referenceType: 'invoice',
              referenceId: invoice.id,
              referenceNo: invoice.invoice_number,
              notes: `Voided ${invoice.invoice_number}`,
            })
          }
          await tx.query(
            `UPDATE invoices SET status = 'void', balance = 0, updated_at = now() WHERE id = $1`,
            [invoice.id],
          )
          await postJournal(tx, ctx, {
            date: today(),
            reference: invoice.invoice_number,
            description: `Void invoice ${invoice.invoice_number}`,
            sourceType: 'invoice_void',
            sourceId: invoice.id,
            lines: [
              { account_name: 'Sales Revenue', debit: invoice.total_amount, credit: 0 },
              { account_name: 'Accounts Receivable', debit: 0, credit: invoice.total_amount },
              { account_name: 'Inventory', debit: cost, credit: 0 },
              { account_name: 'Cost of Goods Sold', debit: 0, credit: cost },
            ],
          })
          return { id: invoice.id, status: 'void' }
        })
      },
      async payments(ctx, invoiceId) {
        return query(
          `SELECT * FROM payments WHERE company_id = $1 AND invoice_id = $2
           ORDER BY payment_date DESC, created_at DESC`,
          [ctx.companyId, invoiceId],
        )
      },
    },

    quotations: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['q.company_id = $1']
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          conditions.push(
            `(q.quote_number ILIKE $${values.length} OR q.customer_name ILIKE $${values.length})`,
          )
        }
        if (filters.status) {
          values.push(filters.status)
          conditions.push(`q.status = $${values.length}`)
        }
        if (filters.from) {
          values.push(dateValue(filters.from, today()))
          conditions.push(`q.issue_date >= $${values.length}`)
        }
        if (filters.to) {
          values.push(dateValue(filters.to, today()))
          conditions.push(`q.issue_date <= $${values.length}`)
        }
        return query(
          `SELECT q.*, q.subtotal::float, q.discount::float, q.tax_amount::float,
                  q.total_amount::float, q.tax_rate::float,
                  (SELECT COUNT(*)::int FROM quotation_items qi WHERE qi.quotation_id = q.id) AS item_count
           FROM quotations q
           WHERE ${conditions.join(' AND ')}
           ORDER BY q.issue_date DESC, q.created_at DESC`,
          values,
        )
      },
      async get(ctx, id) {
        return getQuotationById(ctx, id)
      },
      async create(ctx, payload) {
        return withTransaction(async (tx) => insertQuotation(tx, ctx, payload))
      },
      async update(ctx, payload) {
        return withTransaction(async (tx) => {
          const existing = await tx.one(
            `SELECT * FROM quotations WHERE id = $1 AND company_id = $2 FOR UPDATE`,
            [payload.id, ctx.companyId],
          )
          if (!existing) throw httpError('Quotation not found.', 404)
          if (existing.converted_invoice_id) {
            throw httpError('This quotation has already been converted to an invoice.')
          }
          return insertQuotation(tx, ctx, payload, existing)
        })
      },
      async remove(ctx, payload) {
        await query('DELETE FROM quotations WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
      async convert(ctx, payload) {
        return withTransaction(async (tx) => {
          const quotation = await tx.one(
            `SELECT * FROM quotations WHERE id = $1 AND company_id = $2 FOR UPDATE`,
            [payload.id, ctx.companyId],
          )
          if (!quotation) throw httpError('Quotation not found.', 404)
          if (quotation.converted_invoice_id) {
            throw httpError('This quotation was already converted.')
          }
          const items = await tx.query(
            `SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id`,
            [quotation.id],
          )
          if (!items.length) throw httpError('This quotation has no items.')
          const invoice = await insertInvoice(tx, ctx, {
            customer_id: quotation.customer_id,
            customer_name: quotation.customer_name,
            customer_email: quotation.customer_email,
            customer_phone: quotation.customer_phone,
            customer_address: quotation.customer_address,
            issue_date: today(),
            due_date: payload.due_date,
            location_id: payload.location_id,
            items: items.map((item) => ({
              product_id: item.product_id || null,
              item_name: item.product_id ? null : manualName(item.description),
              description: item.product_id ? item.description : item.item_description || null,
              quantity: item.quantity,
              unit_price: item.unit_price,
            })),
            discount: quotation.discount,
            tax_rate: quotation.tax_rate,
            include_tax: quotation.include_tax,
            amount_paid: payload.amount_paid || 0,
            payment_method: payload.payment_method,
            notes: quotation.notes,
            quotation_id: quotation.id,
          })
          await tx.query(
            `UPDATE quotations SET status = 'accepted', converted_invoice_id = $2, updated_at = now()
             WHERE id = $1`,
            [quotation.id, invoice.id],
          )
          return invoice
        })
      },
    },

    transfers: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['t.company_id = $1']
        if (filters.from) {
          values.push(dateValue(filters.from, today()))
          conditions.push(`t.transfer_date >= $${values.length}`)
        }
        if (filters.to) {
          values.push(dateValue(filters.to, today()))
          conditions.push(`t.transfer_date <= $${values.length}`)
        }
        return query(
          `SELECT t.*, fl.name AS from_location_name, tl.name AS to_location_name,
                  (SELECT COUNT(*)::int FROM stock_transfer_items sti WHERE sti.transfer_id = t.id) AS item_count
           FROM stock_transfers t
           LEFT JOIN locations fl ON fl.id = t.from_location_id
           LEFT JOIN locations tl ON tl.id = t.to_location_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY t.transfer_date DESC, t.created_at DESC`,
          values,
        )
      },
      async get(ctx, id) {
        return getTransferById(ctx, id)
      },
      async create() {
        throw httpError('Stock transfers are unavailable with one main shop only.', 400)
      },
      async remove(ctx, payload) {
        const transfer = await one(
          `SELECT * FROM stock_transfers WHERE id = $1 AND company_id = $2`,
          [payload.id, ctx.companyId],
        )
        if (!transfer) throw httpError('Transfer not found.', 404)
        if (transfer.status === 'completed') {
          throw httpError('Completed transfers cannot be deleted; they are part of the stock audit trail.')
        }
        await query('DELETE FROM stock_transfers WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },
    },

    cashbook: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['company_id = $1']
        if (filters.from) {
          values.push(dateValue(filters.from, today()))
          conditions.push(`entry_date >= $${values.length}`)
        }
        if (filters.to) {
          values.push(dateValue(filters.to, today()))
          conditions.push(`entry_date <= $${values.length}`)
        }
        if (filters.entry_type) {
          values.push(filters.entry_type)
          conditions.push(`entry_type = $${values.length}`)
        }
        if (filters.category) {
          values.push(filters.category)
          conditions.push(`category = $${values.length}`)
        }
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          conditions.push(
            `(description ILIKE $${values.length} OR COALESCE(reference,'') ILIKE $${values.length})`,
          )
        }
        return query(
          `SELECT *, amount::float, (source_type IS NULL) AS manual
           FROM cashbook_entries WHERE ${conditions.join(' AND ')}
           ORDER BY entry_date DESC, created_at DESC`,
          values,
        )
      },
      async create(ctx, payload) {
        return withTransaction(async (tx) => {
          const amount = round2(payload.amount)
          if (!(amount > 0)) throw httpError('Enter an amount greater than zero.')
          const entry = await createCashbookEntry(tx, ctx, {
            date: payload.entry_date,
            type: payload.entry_type,
            category: payload.category,
            description: payload.description,
            amount,
            method: payload.method,
            reference: payload.reference,
            notes: payload.notes,
            staffId: payload.staff_id || null,
          })
          const account = text(payload.category) || 'General'
          await postJournal(tx, ctx, {
            date: entry.entry_date,
            reference: entry.reference || entry.id.slice(0, 8),
            description: entry.description,
            sourceType: 'cashbook',
            sourceId: entry.id,
            lines:
              entry.entry_type === 'receipt'
                ? [
                    { account_name: cashAccount(entry.method), debit: amount, credit: 0 },
                    { account_name: account, debit: 0, credit: amount },
                  ]
                : [
                    { account_name: account, debit: amount, credit: 0 },
                    { account_name: cashAccount(entry.method), debit: 0, credit: amount },
                  ],
          })
          return entry
        })
      },
      async remove(ctx, payload) {
        return withTransaction(async (tx) => {
          const entry = await tx.one(
            `SELECT * FROM cashbook_entries WHERE id = $1 AND company_id = $2`,
            [payload.id, ctx.companyId],
          )
          if (!entry) throw httpError('Cashbook entry not found.', 404)
          if (entry.source_type) {
            throw httpError('Automatically posted entries cannot be deleted here.')
          }
          await tx.query(
            `DELETE FROM journal_entries WHERE company_id = $1 AND source_type = 'cashbook' AND source_id = $2`,
            [ctx.companyId, entry.id],
          )
          await tx.query('DELETE FROM cashbook_entries WHERE id = $1', [entry.id])
          return { id: entry.id }
        })
      },
      async summary(ctx, filters = {}) {
        const from = dateValue(filters.from, today().slice(0, 8) + '01')
        const to = dateValue(filters.to, today())
        const rows = await query(
          `SELECT entry_type, category, SUM(amount)::float AS amount
           FROM cashbook_entries
           WHERE company_id = $1 AND entry_date BETWEEN $2 AND $3
           GROUP BY entry_type, category ORDER BY entry_type, amount DESC`,
          [ctx.companyId, from, to],
        )
        const receipts = round2(
          rows.filter((row) => row.entry_type === 'receipt').reduce((sum, row) => sum + row.amount, 0),
        )
        const payments = round2(
          rows.filter((row) => row.entry_type === 'payment').reduce((sum, row) => sum + row.amount, 0),
        )
        return { from, to, receipts, payments, net: round2(receipts - payments), byCategory: rows }
      },
    },

    journals: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['je.company_id = $1']
        if (filters.from) {
          values.push(dateValue(filters.from, today()))
          conditions.push(`je.entry_date >= $${values.length}`)
        }
        if (filters.to) {
          values.push(dateValue(filters.to, today()))
          conditions.push(`je.entry_date <= $${values.length}`)
        }
        if (filters.source_type) {
          values.push(filters.source_type)
          conditions.push(`je.source_type = $${values.length}`)
        }
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          conditions.push(
            `(je.description ILIKE $${values.length} OR COALESCE(je.reference,'') ILIKE $${values.length})`,
          )
        }
        const entries = await query(
          `SELECT je.*, u.full_name AS created_by_name,
                  COALESCE(SUM(jl.debit),0)::float AS total_debit,
                  COALESCE(SUM(jl.credit),0)::float AS total_credit
           FROM journal_entries je
           LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
           LEFT JOIN users u ON u.id = je.created_by
           WHERE ${conditions.join(' AND ')}
           GROUP BY je.id, u.full_name
           ORDER BY je.entry_date DESC, je.created_at DESC
           LIMIT 500`,
          values,
        )
        if (entries.length) {
          const lines = await query(
            `SELECT * FROM journal_lines WHERE journal_entry_id = ANY($1::uuid[])
             ORDER BY journal_entry_id, id`,
            [entries.map((entry) => entry.id)],
          )
          const grouped = new Map()
          for (const line of lines) {
            if (!grouped.has(line.journal_entry_id)) grouped.set(line.journal_entry_id, [])
            grouped.get(line.journal_entry_id).push({
              ...line,
              debit: Number(line.debit),
              credit: Number(line.credit),
            })
          }
          for (const entry of entries) entry.lines = grouped.get(entry.id) || []
        }
        return entries
      },
      async create(ctx, payload) {
        return withTransaction(async (tx) => {
          const lines = (payload.lines || []).map((line) => ({
            account_code: text(line.account_code),
            account_name: text(line.account_name),
            debit: round2(line.debit),
            credit: round2(line.credit),
            memo: text(line.memo),
          }))
          const usable = lines.filter((line) => line.account_name && (line.debit > 0 || line.credit > 0))
          if (usable.length < 2) throw httpError('Add at least two journal lines.')
          const debit = round2(usable.reduce((sum, line) => sum + line.debit, 0))
          const credit = round2(usable.reduce((sum, line) => sum + line.credit, 0))
          if (Math.abs(debit - credit) > 0.005) {
            throw httpError(`Journal is not balanced. Debits ${debit}, credits ${credit}.`)
          }
          const id = await postJournal(tx, ctx, {
            date: payload.entry_date,
            reference: payload.reference,
            description: payload.description || 'Manual journal entry',
            sourceType: 'manual',
            lines: usable,
          })
          return { id }
        })
      },
      async remove(ctx, payload) {
        const entry = await one(
          `SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2`,
          [payload.id, ctx.companyId],
        )
        if (!entry) throw httpError('Journal entry not found.', 404)
        if (entry.source_type !== 'manual') {
          throw httpError('Only manual journal entries can be deleted.')
        }
        await query('DELETE FROM journal_entries WHERE id = $1 AND company_id = $2', [
          payload.id,
          ctx.companyId,
        ])
        return { id: payload.id }
      },

      async generalLedger(ctx, filters = {}) {
        const from = filters.from ? dateValue(filters.from, today()) : null
        const to = filters.to ? dateValue(filters.to, today()) : null
        const account = text(filters.account)

        const summaryValues = [ctx.companyId]
        const summaryConditions = ['je.company_id = $1']
        if (from) {
          summaryValues.push(from)
          summaryConditions.push(`je.entry_date >= $${summaryValues.length}`)
        }
        if (to) {
          summaryValues.push(to)
          summaryConditions.push(`je.entry_date <= $${summaryValues.length}`)
        }

        const summaryRows = await query(
          `SELECT jl.account_name,
                  COALESCE(SUM(jl.debit),0)::float AS debit,
                  COALESCE(SUM(jl.credit),0)::float AS credit
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id
           WHERE ${summaryConditions.join(' AND ')}
           GROUP BY jl.account_name
           ORDER BY jl.account_name`,
          summaryValues,
        )

        let openingRows = []
        if (from) {
          openingRows = await query(
            `SELECT jl.account_name,
                    COALESCE(SUM(jl.debit - jl.credit),0)::float AS balance
             FROM journal_lines jl
             JOIN journal_entries je ON je.id = jl.journal_entry_id
             WHERE je.company_id = $1 AND je.entry_date < $2
             GROUP BY jl.account_name`,
            [ctx.companyId, from],
          )
        }

        const accounts = new Map()
        const ensure = (name) => {
          const key = name || 'Unassigned'
          if (!accounts.has(key)) {
            accounts.set(key, { account_name: key, opening: 0, debit: 0, credit: 0, closing: 0 })
          }
          return accounts.get(key)
        }
        for (const row of openingRows) ensure(row.account_name).opening = round2(Number(row.balance))
        for (const row of summaryRows) {
          const entry = ensure(row.account_name)
          entry.debit = round2(Number(row.debit))
          entry.credit = round2(Number(row.credit))
        }
        for (const entry of accounts.values()) {
          entry.closing = round2(entry.opening + entry.debit - entry.credit)
        }

        const lineValues = [ctx.companyId]
        const lineConditions = ['je.company_id = $1']
        if (from) {
          lineValues.push(from)
          lineConditions.push(`je.entry_date >= $${lineValues.length}`)
        }
        if (to) {
          lineValues.push(to)
          lineConditions.push(`je.entry_date <= $${lineValues.length}`)
        }
        if (account) {
          lineValues.push(account)
          lineConditions.push(`jl.account_name = $${lineValues.length}`)
        }

        const lines = await query(
          `SELECT je.id AS entry_id, je.entry_date, je.reference, je.description,
                  je.source_type, jl.account_name, jl.debit::float, jl.credit::float, jl.memo
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id
           WHERE ${lineConditions.join(' AND ')}
           ORDER BY je.entry_date, je.created_at, jl.id
           LIMIT 1000`,
          lineValues,
        )

        return {
          from,
          to,
          account: account || '',
          accounts: [...accounts.values()].sort((left, right) =>
            left.account_name.localeCompare(right.account_name),
          ),
          lines,
        }
      },
    },

    activity: {
      async list(ctx, filters = {}) {
        const values = [ctx.companyId]
        const conditions = ['a.company_id = $1']
        if (text(filters.search)) {
          values.push(`%${text(filters.search)}%`)
          conditions.push(
            `(a.description ILIKE $${values.length} OR COALESCE(a.entity_label,'') ILIKE $${values.length}
              OR COALESCE(u.full_name,'') ILIKE $${values.length})`,
          )
        }
        if (filters.entity_type) {
          values.push(text(filters.entity_type))
          conditions.push(`a.entity_type = $${values.length}`)
        }
        if (filters.from) {
          values.push(dateValue(filters.from, today()))
          conditions.push(`a.created_at::date >= $${values.length}`)
        }
        if (filters.to) {
          values.push(dateValue(filters.to, today()))
          conditions.push(`a.created_at::date <= $${values.length}`)
        }
        values.push(Math.min(500, Math.max(1, Math.round(number(filters.limit, 200)))))
        return query(
          `SELECT a.*, u.full_name AS user_name, u.email AS user_email
           FROM activity_log a
           LEFT JOIN users u ON u.id = a.user_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY a.created_at DESC
           LIMIT $${values.length}`,
          values,
        )
      },
    },

    reports: {
      async dashboard(ctx) {
        const [
          todaySales,
          todayItems,
          todayPurchases,
          todayExpenses,
          inventory,
          receivables,
          lowStock,
          expiring,
          cash,
          trend,
          topProducts,
          recentInvoices,
        ] = await Promise.all([
          one(
            `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::float AS revenue,
                    COALESCE(SUM(tax_amount),0)::float AS tax
             FROM invoices WHERE company_id = $1 AND issue_date = current_date AND status <> 'void'`,
            [ctx.companyId],
          ),
          one(
            `SELECT COALESCE(SUM(ii.quantity),0)::float AS quantity,
                    COALESCE(SUM(ii.quantity * ii.unit_cost),0)::float AS cost
             FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
             WHERE i.company_id = $1 AND i.issue_date = current_date AND i.status <> 'void'`,
            [ctx.companyId],
          ),
          one(
            `SELECT COALESCE(SUM(total_amount),0)::float AS total, COUNT(*)::int AS count
             FROM purchase_orders WHERE company_id = $1 AND status = 'received'
               AND received_at::date = current_date`,
            [ctx.companyId],
          ),
          one(
            `SELECT COALESCE(SUM(amount),0)::float AS total, COUNT(*)::int AS count
             FROM cashbook_entries WHERE company_id = $1 AND entry_type = 'payment'
               AND entry_date = current_date`,
            [ctx.companyId],
          ),
          one(
            `SELECT COALESCE(SUM(quantity_on_hand * cost_price),0)::float AS cost_value,
                    COALESCE(SUM(quantity_on_hand * selling_price),0)::float AS retail_value,
                    COALESCE(SUM(quantity_on_hand),0)::float AS quantity,
                    COUNT(*)::int AS sku_count
             FROM products WHERE company_id = $1 AND status = 'active'`,
            [ctx.companyId],
          ),
          one(
            `SELECT COALESCE(SUM(balance),0)::float AS total, COUNT(*)::int AS count
             FROM invoices WHERE company_id = $1 AND status NOT IN ('void','draft') AND balance > 0`,
            [ctx.companyId],
          ),
          one(
            `SELECT COUNT(*)::int AS count FROM products
             WHERE company_id = $1 AND status = 'active' AND quantity_on_hand <= reorder_level`,
            [ctx.companyId],
          ),
          one(
            `SELECT COUNT(*)::int AS count FROM products
             WHERE company_id = $1 AND status = 'active' AND expiry_date IS NOT NULL
               AND expiry_date <= current_date + 90`,
            [ctx.companyId],
          ),
          one(
            `SELECT COALESCE(SUM(CASE WHEN entry_type = 'receipt' THEN amount ELSE -amount END),0)::float AS balance
             FROM cashbook_entries WHERE company_id = $1`,
            [ctx.companyId],
          ),
          query(
            `SELECT issue_date AS date, COALESCE(SUM(total_amount),0)::float AS revenue,
                    COUNT(*)::int AS count
             FROM invoices WHERE company_id = $1 AND issue_date >= current_date - 13 AND status <> 'void'
             GROUP BY issue_date ORDER BY issue_date`,
            [ctx.companyId],
          ),
          query(
            `SELECT p.id, p.sku, p.name, SUM(ii.quantity)::float AS quantity,
                    SUM(ii.line_total)::float AS revenue, SUM(ii.quantity * ii.unit_cost)::float AS cost
             FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id
             JOIN products p ON p.id = ii.product_id
             WHERE i.company_id = $1 AND i.issue_date >= current_date - 29 AND i.status <> 'void'
             GROUP BY p.id, p.sku, p.name
             ORDER BY revenue DESC LIMIT 6`,
            [ctx.companyId],
          ),
          query(
            `SELECT id, invoice_number, customer_name, issue_date, total_amount::float,
                    balance::float, status
             FROM invoices WHERE company_id = $1 AND status <> 'void'
             ORDER BY created_at DESC LIMIT 6`,
            [ctx.companyId],
          ),
        ])

        const revenue = number(todaySales?.revenue)
        const cost = number(todayItems?.cost)
        const margin = round2(revenue - cost)

        const trendMap = new Map(trend.map((row) => [String(row.date), row]))
        const series = []
        for (let offset = 13; offset >= 0; offset -= 1) {
          const date = new Date()
          date.setDate(date.getDate() - offset)
          const key = localDateKey(date)
          series.push({
            date: key,
            revenue: number(trendMap.get(key)?.revenue),
            count: number(trendMap.get(key)?.count),
          })
        }

        return {
          today: {
            sales: revenue,
            invoices: number(todaySales?.count),
            quantity: number(todayItems?.quantity),
            cost,
            margin,
            purchases: number(todayPurchases?.total),
            purchase_count: number(todayPurchases?.count),
            expenses: number(todayExpenses?.total),
            expense_count: number(todayExpenses?.count),
          },
          inventory: {
            cost_value: number(inventory?.cost_value),
            retail_value: number(inventory?.retail_value),
            quantity: number(inventory?.quantity),
            sku_count: number(inventory?.sku_count),
          },
          receivables: {
            total: number(receivables?.total),
            count: number(receivables?.count),
          },
          low_stock: number(lowStock?.count),
          expiring: number(expiring?.count),
          cash_position: number(cash?.balance),
          trend: series,
          top_products: topProducts,
          recent_invoices: recentInvoices,
        }
      },

      async dailySales(ctx, filters = {}) {
        const from = dateValue(filters.from, today().slice(0, 8) + '01')
        const to = dateValue(filters.to, today())
        const rows = await query(
          `SELECT i.issue_date AS date, COUNT(DISTINCT i.id)::int AS invoices,
                  COALESCE(SUM(ii.quantity),0)::float AS quantity,
                  COALESCE(SUM(ii.line_total),0)::float AS sales,
                  COALESCE(SUM(ii.quantity * ii.unit_cost),0)::float AS cost
           FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id
           WHERE i.company_id = $1 AND i.issue_date BETWEEN $2 AND $3 AND i.status <> 'void'
           GROUP BY i.issue_date ORDER BY i.issue_date`,
          [ctx.companyId, from, to],
        )
        return {
          from,
          to,
          rows: rows.map((row) => ({
            ...row,
            margin: round2(number(row.sales) - number(row.cost)),
            margin_percent:
              number(row.sales) > 0
                ? round2(((number(row.sales) - number(row.cost)) / number(row.sales)) * 100)
                : 0,
          })),
          totals: {
            invoices: rows.reduce((sum, row) => sum + number(row.invoices), 0),
            quantity: round3(rows.reduce((sum, row) => sum + number(row.quantity), 0)),
            sales: round2(rows.reduce((sum, row) => sum + number(row.sales), 0)),
            cost: round2(rows.reduce((sum, row) => sum + number(row.cost), 0)),
            margin: round2(
              rows.reduce((sum, row) => sum + number(row.sales) - number(row.cost), 0),
            ),
          },
        }
      },

      async dailyPurchases(ctx, filters = {}) {
        const from = dateValue(filters.from, today().slice(0, 8) + '01')
        const to = dateValue(filters.to, today())
        const rows = await query(
          `SELECT order_date AS date, COUNT(*)::int AS orders,
                  COALESCE(SUM(total_amount),0)::float AS total
           FROM purchase_orders
           WHERE company_id = $1 AND status = 'received' AND order_date BETWEEN $2 AND $3
           GROUP BY order_date ORDER BY order_date`,
          [ctx.companyId, from, to],
        )
        return {
          from,
          to,
          rows,
          total: round2(rows.reduce((sum, row) => sum + number(row.total), 0)),
        }
      },

      async dailyBalances(ctx, filters = {}) {
        const from = dateValue(filters.from, today().slice(0, 8) + '01')
        const to = dateValue(filters.to, today())
        const productId = filters.product_id || null
        const params = [ctx.companyId, from, to]
        let productFilter = ''
        if (productId) {
          params.push(productId)
          productFilter = ` AND product_id = $4`
        }
        const openingRow = await one(
          `SELECT COALESCE(SUM(quantity_delta),0)::float AS opening
           FROM stock_movements
           WHERE company_id = $1 AND created_at::date < $2${productFilter ? ' AND product_id = $4' : ''}`,
          productFilter ? [ctx.companyId, from, productId] : [ctx.companyId, from],
        )
        const rows = await query(
          `SELECT created_at::date AS date,
                  COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END),0)::float AS stock_in,
                  COALESCE(SUM(CASE WHEN quantity_delta < 0 THEN -quantity_delta ELSE 0 END),0)::float AS stock_out
           FROM stock_movements
           WHERE company_id = $1 AND created_at::date BETWEEN $2 AND $3${productFilter}
           GROUP BY created_at::date ORDER BY created_at::date`,
          params,
        )
        const map = new Map(rows.map((row) => [String(row.date), row]))
        let running = number(openingRow?.opening)
        const series = []
        const cursor = new Date(`${from}T00:00:00`)
        const last = new Date(`${to}T00:00:00`)
        while (cursor <= last && series.length < 370) {
          const key = localDateKey(cursor)
          const row = map.get(key)
          const stockIn = number(row?.stock_in)
          const stockOut = number(row?.stock_out)
          running = round3(running + stockIn - stockOut)
          series.push({ date: key, stock_in: stockIn, stock_out: stockOut, closing: running })
          cursor.setDate(cursor.getDate() + 1)
        }
        return { from, to, product_id: productId, opening: number(openingRow?.opening), rows: series }
      },

      async inventoryValuation(ctx) {
        const rows = await query(
          `SELECT p.id, p.sku, p.name, p.unit, p.quantity_on_hand::float AS quantity,
                  p.cost_price::float AS cost_price, p.selling_price::float AS selling_price,
                  (p.quantity_on_hand * p.cost_price)::float AS cost_value,
                  (p.quantity_on_hand * p.selling_price)::float AS retail_value,
                  (p.quantity_on_hand * (p.selling_price - p.cost_price))::float AS potential_margin,
                  c.name AS category_name
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.company_id = $1 AND p.status = 'active'
           ORDER BY cost_value DESC`,
          [ctx.companyId],
        )
        return {
          rows,
          totals: {
            quantity: round3(rows.reduce((sum, row) => sum + number(row.quantity), 0)),
            cost_value: round2(rows.reduce((sum, row) => sum + number(row.cost_value), 0)),
            retail_value: round2(rows.reduce((sum, row) => sum + number(row.retail_value), 0)),
            potential_margin: round2(
              rows.reduce((sum, row) => sum + number(row.potential_margin), 0),
            ),
          },
        }
      },

      async margins(ctx, filters = {}) {
        const from = dateValue(filters.from, today().slice(0, 8) + '01')
        const to = dateValue(filters.to, today())
        const rows = await query(
          `SELECT p.id, p.sku, p.name,
                  COALESCE(SUM(ii.quantity),0)::float AS quantity,
                  COALESCE(SUM(ii.line_total),0)::float AS revenue,
                  COALESCE(SUM(ii.quantity * ii.unit_cost),0)::float AS cost
           FROM invoice_items ii
           JOIN invoices i ON i.id = ii.invoice_id
           JOIN products p ON p.id = ii.product_id
           WHERE i.company_id = $1 AND i.issue_date BETWEEN $2 AND $3 AND i.status <> 'void'
           GROUP BY p.id, p.sku, p.name ORDER BY revenue DESC`,
          [ctx.companyId, from, to],
        )
        return {
          from,
          to,
          rows: rows.map((row) => ({
            ...row,
            margin: round2(number(row.revenue) - number(row.cost)),
            margin_percent:
              number(row.revenue) > 0
                ? round2(((number(row.revenue) - number(row.cost)) / number(row.revenue)) * 100)
                : 0,
          })),
        }
      },

      async receivables(ctx) {
        const rows = await query(
          `SELECT i.id, i.invoice_number, i.customer_name, i.issue_date, i.due_date,
                  i.total_amount::float, i.amount_paid::float, i.balance::float, i.status,
                  (current_date - i.due_date)::int AS days_overdue
           FROM invoices i
           WHERE i.company_id = $1 AND i.status NOT IN ('void','draft') AND i.balance > 0
           ORDER BY i.due_date NULLS LAST, i.issue_date`,
          [ctx.companyId],
        )
        const withAging = rows.map((row) => {
          const overdue = number(row.days_overdue)
          let bucket = 'Current'
          if (overdue > 60) bucket = '60+ days'
          else if (overdue > 30) bucket = '31-60 days'
          else if (overdue > 0) bucket = '1-30 days'
          return { ...row, bucket }
        })
        const buckets = withAging.reduce((acc, row) => {
          acc[row.bucket] = round2((acc[row.bucket] || 0) + number(row.balance))
          return acc
        }, {})
        return {
          rows: withAging,
          total: round2(withAging.reduce((sum, row) => sum + number(row.balance), 0)),
          buckets,
        }
      },

      async expenses(ctx, filters = {}) {
        const from = dateValue(filters.from, today().slice(0, 8) + '01')
        const to = dateValue(filters.to, today())
        const rows = await query(
          `SELECT entry_date AS date, category, SUM(amount)::float AS amount, COUNT(*)::int AS entries
           FROM cashbook_entries
           WHERE company_id = $1 AND entry_type = 'payment' AND entry_date BETWEEN $2 AND $3
           GROUP BY entry_date, category ORDER BY entry_date DESC, amount DESC`,
          [ctx.companyId, from, to],
        )
        const byCategory = await query(
          `SELECT category, SUM(amount)::float AS amount
           FROM cashbook_entries
           WHERE company_id = $1 AND entry_type = 'payment' AND entry_date BETWEEN $2 AND $3
           GROUP BY category ORDER BY amount DESC`,
          [ctx.companyId, from, to],
        )
        return {
          from,
          to,
          rows,
          byCategory,
          total: round2(rows.reduce((sum, row) => sum + number(row.amount), 0)),
        }
      },

      async lowStock(ctx) {
        return query(
          `SELECT p.id, p.sku, p.name, p.unit, p.quantity_on_hand::float AS quantity,
                  p.reorder_level::float AS reorder_level, c.name AS category_name
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.company_id = $1 AND p.status = 'active' AND p.quantity_on_hand <= p.reorder_level
           ORDER BY (p.quantity_on_hand - p.reorder_level), p.name`,
          [ctx.companyId],
        )
      },

      async expiring(ctx, days = 90) {
        return query(
          `SELECT p.id, p.sku, p.name, p.unit, p.quantity_on_hand::float AS quantity,
                  p.expiry_date, (p.expiry_date - current_date)::int AS days_left,
                  c.name AS category_name
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.company_id = $1 AND p.status = 'active' AND p.expiry_date IS NOT NULL
             AND p.expiry_date <= current_date + $2::int
           ORDER BY p.expiry_date`,
          [ctx.companyId, Math.max(0, Math.round(number(days, 90)))],
        )
      },
    },
  }

  return repo
}
