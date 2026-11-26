import { jsPDF } from 'jspdf'
import { formatDate, formatNumber } from './utils'

const INK = [11, 11, 13]
const BRAND = [193, 18, 31]
const BRAND_DARK = [127, 11, 20]
const GREY = [102, 115, 140]
const LIGHT = [246, 247, 249]
const LINE = [213, 218, 227]

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const CONTENT_W = PAGE_W - MARGIN * 2
const LOGO_URL = '/logo2.jpg'
const FOOTER_RESERVE = 118

const LETTERHEAD = {
  name: 'Devolve Enterprises (Pvt) Ltd',
  tagline: 'Suppliers of all Trucks, Buses & Trailer Spares, all Lubricants & General Hardware',
  address: 'Shop No. 37 H2, High Glen Complex, Harare',
  email: 'devolvetruckspares@gmail.com',
  phone: 'Tel: +263-24-2690508, Cell: +263 774 212 089 / +263 776 388 108 / +263 719 388 108',
  bank: [
    'Account  Name: Devolve Enterprises (PVT) LTD',
    'Bank: Nedbank Zimbabwe',
    'Branch: Southerton',
  ],
  accounts: ['Account Number (USD): 11991264320', 'Account Number (ZWL):61031011403'],
  vendor: 'VENDOR NUMBER: 717377',
}

function productName(value) {
  return String(value || '')
    .replace(/^\s*SKU[-\s]*\d+\s*[-–—:]\s*/i, '')
    .trim()
}

let logoPromise = null

function fetchImageData(url) {
  return fetch(url, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.blob() : null))
    .then(
      (blob) =>
        new Promise((resolve) => {
          if (!blob) return resolve(null)
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        }),
    )
    .catch(() => null)
}

async function getLogo(company) {
  const url = company?.logo_url || LOGO_URL
  if (!logoPromise || logoPromise.url !== url) {
    logoPromise = fetchImageData(url).then((data) => ({ url, data }))
    if (url !== LOGO_URL) {
      const primary = await logoPromise
      if (!primary.data) {
        const fallback = await fetchImageData(LOGO_URL)
        logoPromise = Promise.resolve({ url, data: fallback })
        return fallback
      }
      return primary.data
    }
  }
  const result = await logoPromise
  return result.data
}

function money(currency, value) {
  return `${currency || 'USD'} ${formatNumber(Number(value) || 0)}`
}

function amount(value) {
  const n = Number(value) || 0
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function documentTitle(payload) {
  if (payload.type === 'invoice' && payload.isDeliveryNote) return 'DELIVERY NOTE'
  return payload.type === 'invoice' ? 'INVOICE' : 'QUOTATION'
}

function buildPayload(record, type, company) {
  const isInvoice = type === 'invoice'
  return {
    type,
    number: isInvoice ? record.invoice_number : record.quote_number,
    purchaseOrderNumber: isInvoice ? record.purchase_order_number : null,
    isDeliveryNote: isInvoice && Boolean(record.is_delivery_note),
    issueDate: record.issue_date,
    secondaryDate: isInvoice ? record.due_date : record.valid_until,
    status: record.status,
    customer: {
      name: record.customer_name || record.customer_account_name || 'Walk-in customer',
      email: record.customer_email,
      phone: record.customer_phone,
      address: record.customer_address,
    },
    items: (record.items || []).map((item) => ({
      sku: item.sku,
      name: item.product_name || productName(item.description) || item.description,
      description: item.item_description ?? item.description,
      unit: item.unit,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unit_price) || 0,
      line_total: Number(item.line_total) || 0,
    })),
    subtotal: Number(record.subtotal) || 0,
    discount: Number(record.discount) || 0,
    taxRate: Number(record.tax_rate) || 0,
    taxAmount: Number(record.tax_amount) || 0,
    total: Number(record.total_amount) || 0,
    amountPaid: Number(record.amount_paid) || 0,
    balance: Number(record.balance) || 0,
    notes: record.notes,
    terms: isInvoice ? company?.invoice_terms : company?.quotation_terms,
    company,
  }
}

export function payloadFromInvoice(invoice, company) {
  return buildPayload(invoice, 'invoice', company)
}

export function payloadFromQuotation(quotation, company) {
  return buildPayload(quotation, 'quotation', company)
}

function drawLogoFallback(doc, x, y, size) {
  doc.setFillColor(...BRAND)
  doc.roundedRect(x, y, size, size, 8, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.text('D', x + size / 2, y + size * 0.68, { align: 'center' })
}

function drawHeader(doc, payload, logo, compact = false) {
  const currency = payload.company?.currency || 'USD'
  const y = MARGIN
  const logoSize = 60

  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', MARGIN, y, logoSize, logoSize)
    } catch {
      drawLogoFallback(doc, MARGIN, y, logoSize)
    }
  } else {
    drawLogoFallback(doc, MARGIN, y, logoSize)
  }

  const textX = MARGIN + 62
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(compact ? 11 : 13)
  doc.text(LETTERHEAD.name, textX, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.4)
  doc.setTextColor(...GREY)
  const tagline = doc.splitTextToSize(LETTERHEAD.tagline, 240).slice(0, 3)
  doc.text(tagline, textX, y + 23)
  let leftY = y + 23 + tagline.length * 9 + 3
  for (const line of [LETTERHEAD.address, LETTERHEAD.email, ...doc.splitTextToSize(LETTERHEAD.phone, 240)]) {
    doc.text(String(line), textX, leftY)
    leftY += 9
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(compact ? 8 : 9)
  doc.setTextColor(...BRAND)
  doc.text(LETTERHEAD.vendor, textX, leftY + 1)

  const rightX = PAGE_W - MARGIN
  doc.setTextColor(...BRAND)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(compact ? 14 : 19)
  doc.text(documentTitle(payload), rightX, y + 14, { align: 'right' })
  doc.setTextColor(...INK)
  doc.setFontSize(11)
  doc.text(payload.number || '', rightX, y + 31, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...GREY)
  const meta = [
    ['Date', formatDate(payload.issueDate)],
    payload.type === 'invoice'
      ? ['Due date', payload.secondaryDate ? formatDate(payload.secondaryDate) : 'On receipt']
      : ['Valid until', payload.secondaryDate ? formatDate(payload.secondaryDate) : '—'],
    ...(payload.purchaseOrderNumber ? [['P.O. number', payload.purchaseOrderNumber]] : []),
    ['Currency', currency],
  ]
  let metaY = y + 46
  for (const [label, value] of meta) {
    doc.text(label, rightX - 100, metaY)
    doc.setTextColor(...INK)
    doc.text(String(value), rightX, metaY, { align: 'right' })
    doc.setTextColor(...GREY)
    metaY += 11
  }

  const ruleY = Math.max(leftY + 2, metaY + 2, y + 62)
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(2)
  doc.line(MARGIN, ruleY, PAGE_W - MARGIN, ruleY)
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.8)
  doc.line(MARGIN, ruleY + 3, PAGE_W - MARGIN, ruleY + 3)
  return ruleY + 20
}

function drawCustomer(doc, payload, y) {
  const currency = payload.company?.currency || 'USD'
  doc.setTextColor(...GREY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(payload.type === 'invoice' ? 'BILL TO' : 'PREPARED FOR', MARGIN, y)

  doc.setTextColor(...INK)
  doc.setFontSize(11)
  doc.text(payload.customer.name || 'Walk-in customer', MARGIN, y + 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...GREY)
  let lineY = y + 28
  const lines = [
    payload.customer.address,
    payload.customer.phone,
    payload.customer.email,
  ].filter(Boolean)
  for (const line of lines) {
    const split = doc.splitTextToSize(String(line), 250)
    for (const part of split.slice(0, 2)) {
      doc.text(part, MARGIN, lineY)
      lineY += 10
    }
  }

  if (payload.type === 'invoice') {
    const rightX = PAGE_W - MARGIN
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GREY)
    doc.text('PAYMENT STATUS', rightX, y, { align: 'right' })
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text(String(payload.status || '').toUpperCase(), rightX, y + 15, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GREY)
    doc.text(`Invoice total: ${money(currency, payload.total)}`, rightX, y + 28, { align: 'right' })
    doc.text(`Paid to date: ${money(currency, payload.amountPaid)}`, rightX, y + 39, { align: 'right' })
    doc.setTextColor(...BRAND)
    doc.setFont('helvetica', 'bold')
    doc.text(`Balance due: ${money(currency, payload.balance)}`, rightX, y + 51, { align: 'right' })
  }

  return Math.max(lineY, y + 62)
}

const COLS = [
  { key: 'index', label: '#', x: 0, w: 24, align: 'left' },
  { key: 'description', label: 'Description', x: 24, w: 285, align: 'left' },
  { key: 'quantity', label: 'Qty', x: 309, w: 52, align: 'right' },
  { key: 'price', label: 'Unit price', x: 361, w: 74, align: 'right' },
  { key: 'total', label: 'Amount', x: 435, w: 76, align: 'right' },
]

function drawTableHead(doc, y) {
  doc.setFillColor(...INK)
  doc.rect(MARGIN, y, CONTENT_W, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  for (const col of COLS) {
    const x = MARGIN + col.x + (col.align === 'right' ? col.w - 6 : 6)
    doc.text(col.label.toUpperCase(), x, y + 14, { align: col.align })
  }
  return y + 22
}

function drawTableRow(doc, item, index, y) {
  const currency = item._currency
  const name = productName(item.name || item.description) || 'Item'
  const detail = productName(item.description)
  const sub = [detail && detail !== name ? detail : null, item.unit].filter(Boolean).join(' · ')
  const nameLines = doc.splitTextToSize(name, COLS[1].w - 12).slice(0, 2)
  const rowHeight = Math.max(24, 13 + nameLines.length * 10 + (sub ? 3 : 0))

  if (index % 2 === 0) {
    doc.setFillColor(...LIGHT)
    doc.rect(MARGIN, y, CONTENT_W, rowHeight, 'F')
  }
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y + rowHeight, PAGE_W - MARGIN, y + rowHeight)

  doc.setTextColor(...GREY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(String(index + 1), MARGIN + 6, y + 14)

  doc.setTextColor(...INK)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text(nameLines[0], MARGIN + COLS[1].x + 6, y + 13)
  if (nameLines[1]) {
    doc.setFont('helvetica', 'normal')
    doc.text(nameLines[1], MARGIN + COLS[1].x + 6, y + 23)
  }
  if (sub) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.text(sub, MARGIN + COLS[1].x + 6, y + rowHeight - 7)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...INK)
  doc.text(amount(item.quantity), MARGIN + COLS[2].x + COLS[2].w - 6, y + 14, { align: 'right' })
  doc.text(amount(item.unit_price), MARGIN + COLS[3].x + COLS[3].w - 6, y + 14, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.text(`${currency === item._currency ? '' : ''}${amount(item.line_total)}`, MARGIN + COLS[4].x + COLS[4].w - 6, y + 14, {
    align: 'right',
  })

  return y + rowHeight
}

function drawTotals(doc, payload, y) {
  const currency = payload.company?.currency || 'USD'
  const x = PAGE_W - MARGIN - 220
  const labelX = x + 6
  const valueX = PAGE_W - MARGIN - 6
  const rows = []
  rows.push(['Subtotal', money(currency, payload.subtotal), false])
  if (payload.discount > 0) rows.push(['Discount', `- ${money(currency, payload.discount)}`, false])
  if (payload.taxRate > 0) {
    rows.push([`Tax (${payload.taxRate}%)`, money(currency, payload.taxAmount), false])
  }
  rows.push(['Total', money(currency, payload.total), true])
  if (payload.type === 'invoice') {
    rows.push(['Amount paid', money(currency, payload.amountPaid), false])
    rows.push(['Balance due', money(currency, payload.balance), true])
  }

  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.6)
  doc.rect(x, y, 220, rows.length * 19 + 8, 'S')

  let rowY = y + 14
  for (const [label, value, strong] of rows) {
    if (strong) {
      doc.setDrawColor(...LINE)
      doc.line(x, rowY - 9, x + 220, rowY - 9)
    }
    doc.setFont('helvetica', strong ? 'bold' : 'normal')
    doc.setFontSize(strong ? 9.5 : 8.5)
    doc.setTextColor(...(label === 'Balance due' ? BRAND : INK))
    doc.text(label, labelX, rowY)
    doc.text(value, valueX, rowY, { align: 'right' })
    rowY += 19
  }
  return y + rows.length * 19 + 8
}

function drawNotes(doc, payload, y) {
  let cursor = y + 18
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GREY)
  if (payload.notes) {
    doc.text('NOTES', MARGIN, cursor)
    cursor += 11
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...INK)
    for (const line of doc.splitTextToSize(payload.notes, CONTENT_W - 10).slice(0, 6)) {
      doc.text(line, MARGIN, cursor)
      cursor += 10
    }
    cursor += 6
  }
  if (payload.terms) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...GREY)
    doc.text('TERMS & CONDITIONS', MARGIN, cursor)
    cursor += 11
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    for (const line of doc.splitTextToSize(payload.terms, CONTENT_W - 10).slice(0, 8)) {
      doc.text(line, MARGIN, cursor)
      cursor += 9.5
    }
  }
  return cursor
}

function drawFooter(doc, payload) {
  const y = PAGE_H - 104
  doc.setFillColor(...LIGHT)
  doc.rect(MARGIN, y, CONTENT_W, 56, 'F')
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.6)
  doc.rect(MARGIN, y, CONTENT_W, 56, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND)
  doc.text('BANK DETAILS', MARGIN + 8, y + 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor(...INK)
  LETTERHEAD.bank.forEach((line, index) => {
    doc.text(line, MARGIN + 8, y + 23 + index * 9)
  })

  const bankX = MARGIN + 280
  LETTERHEAD.accounts.forEach((line, index) => {
    doc.text(line, bankX, y + 23 + index * 9)
  })

  doc.setDrawColor(...BRAND)
  doc.setLineWidth(1)
  doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GREY)
  doc.text(LETTERHEAD.email, MARGIN, PAGE_H - 20)
  doc.text(`${documentTitle(payload)} ${payload.number || ''}`, PAGE_W - MARGIN, PAGE_H - 20, { align: 'right' })
}

export async function generateDocumentPdf(payload) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const logo = await getLogo(payload.company)
  let y = drawHeader(doc, payload, logo)
  y = drawCustomer(doc, payload, y + 6)
  y = drawTableHead(doc, y + 8)

  const items = (payload.items || []).map((item) => ({
    ...item,
    _currency: payload.company?.currency || 'USD',
  }))

  for (let index = 0; index < items.length; index += 1) {
    if (y + 40 > PAGE_H - FOOTER_RESERVE) {
      drawFooter(doc, payload)
      doc.addPage()
      y = MARGIN + 10
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...INK)
      doc.text(`${documentTitle(payload)} ${payload.number} (continued)`, MARGIN, y)
      y = drawTableHead(doc, y + 8)
    }
    y = drawTableRow(doc, items[index], index, y)
  }

  if (y + 120 > PAGE_H - FOOTER_RESERVE - 10) {
    drawFooter(doc, payload)
    doc.addPage()
    y = MARGIN + 10
  }

  const totalsBottom = drawTotals(doc, payload, y + 12)
  drawNotes(doc, payload, totalsBottom)
  drawFooter(doc, payload)
  return doc
}

export async function downloadDocumentPdf(payload) {
  const doc = await generateDocumentPdf(payload)
  doc.save(`${payload.number || 'document'}.pdf`)
}

export async function documentPdfBase64(payload) {
  const doc = await generateDocumentPdf(payload)
  return doc.output('datauristring').split(',')[1] || ''
}

export async function emailDocument(payload, to, message = '') {
  const pdfBase64 = await documentPdfBase64(payload)
  const response = await fetch('/api/mail', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'sendDocument',
      type: payload.type,
      number: payload.number,
      isDeliveryNote: Boolean(payload.isDeliveryNote),
      to,
      customerName: payload.customer?.name,
      message,
      pdfBase64,
    }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || 'The email could not be sent.')
  return result
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function printDocument(payload) {
  const company = payload.company || {}
  const currency = company.currency || 'USD'
  const origin = window.location.origin
  const logo = company.logo_url ? `${origin}${company.logo_url}` : `${origin}${LOGO_URL}`
  const rows = (payload.items || [])
    .map((item, index) => {
      const name = productName(item.name || item.description) || 'Item'
      const detail = productName(item.description)
      const sub = [detail && detail !== name ? detail : null, item.unit].filter(Boolean).join(' · ')
      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>
            <div class="item">${escapeHtml(name)}</div>
            <div class="sub">${escapeHtml(sub)}</div>
          </td>
          <td class="num">${amount(item.quantity)}</td>
          <td class="num">${amount(item.unit_price)}</td>
          <td class="num strong">${amount(item.line_total)}</td>
        </tr>`
    })
    .join('')

  const meta = [
    ['Date', formatDate(payload.issueDate)],
    payload.type === 'invoice'
      ? ['Due date', payload.secondaryDate ? formatDate(payload.secondaryDate) : 'On receipt']
      : ['Valid until', payload.secondaryDate ? formatDate(payload.secondaryDate) : '—'],
    ...(payload.purchaseOrderNumber ? [['P.O. number', payload.purchaseOrderNumber]] : []),
    ['Currency', currency],
  ]
    .map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('')

  const totals = [
    ['Subtotal', money(currency, payload.subtotal)],
    payload.discount > 0 ? ['Discount', `- ${money(currency, payload.discount)}`] : null,
    payload.taxRate > 0 ? [`Tax (${payload.taxRate}%)`, money(currency, payload.taxAmount)] : null,
    ['Total', money(currency, payload.total)],
    payload.type === 'invoice' ? ['Amount paid', money(currency, payload.amountPaid)] : null,
    payload.type === 'invoice' ? ['Balance due', money(currency, payload.balance)] : null,
  ]
    .filter(Boolean)
    .map(([label, value], index, array) => {
      const last = index === array.length - 1
      const strong = label === 'Total' || last
      return `<tr class="${strong ? 'strong' : ''} ${label === 'Balance due' ? 'brand' : ''}">
        <th>${label}</th><td>${value}</td></tr>`
    })
    .join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(payload.number || documentTitle(payload))}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0b0b0d; font-size: 12px; margin: 0; }
  .head { display: flex; justify-content: space-between; gap: 24px; }
  .brand { display: flex; gap: 14px; }
  .brand img { width: 76px; height: 76px; border-radius: 8px; object-fit: cover; }
  .brand h1 { margin: 0; font-size: 21px; letter-spacing: .02em; }
  .brand p { margin: 3px 0 0; color: #66738c; font-size: 11px; }
  .doc { text-align: right; }
  .doc h2 { margin: 0; color: #c1121f; font-size: 23px; letter-spacing: .06em; }
  .doc .number { font-size: 14px; font-weight: 700; margin-top: 4px; }
  .meta { margin-top: 10px; border-collapse: collapse; margin-left: auto; }
  .meta th { text-align: right; color: #66738c; font-weight: 500; padding: 1px 10px 1px 0; font-size: 11px; }
  .meta td { text-align: right; font-weight: 600; font-size: 11px; }
  .rule { margin: 18px 0 20px; height: 4px; background: linear-gradient(90deg,#7f0b14,#c1121f 45%,#0b0b0d); border-radius: 2px; }
  .parties { display: flex; justify-content: space-between; gap: 24px; }
  .label { color: #66738c; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .customer { margin-top: 6px; font-size: 14px; font-weight: 700; }
  .customer-lines { margin-top: 4px; color: #515c73; line-height: 1.55; }
  .pay { text-align: right; }
  .pay .status { margin-top: 6px; font-size: 14px; font-weight: 700; text-transform: uppercase; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 24px; }
  table.items thead th { background: #0b0b0d; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 8px 8px; text-align: left; }
  table.items td { padding: 8px; border-bottom: 1px solid #eceef2; vertical-align: top; }
  table.items tbody tr:nth-child(even) td { background: #f6f7f9; }
  .num { text-align: right; white-space: nowrap; }
  .item { font-weight: 600; }
  .sub { color: #8592a8; font-size: 10px; margin-top: 2px; }
  .strong { font-weight: 700; }
  .bottom { display: flex; justify-content: space-between; gap: 28px; margin-top: 22px; }
  .notes { flex: 1; color: #515c73; font-size: 11px; line-height: 1.6; }
  .notes h3 { color: #66738c; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 3px; }
  .notes section + section { margin-top: 12px; }
  .totals { width: 250px; border-collapse: collapse; align-self: flex-start; }
  .totals th { text-align: left; font-weight: 500; color: #515c73; padding: 6px 8px; font-size: 11px; }
  .totals td { text-align: right; padding: 6px 8px; font-size: 11px; white-space: nowrap; }
  .totals tr.strong th, .totals tr.strong td { font-weight: 700; font-size: 13px; border-top: 1px solid #d5dae3; }
  .totals tr.brand th, .totals tr.brand td { color: #c1121f; }
  .bank { margin-top: 24px; padding: 11px 13px; background: #f6f7f9; border: 1px solid #d5dae3; display: flex; justify-content: space-between; gap: 24px; font-size: 10px; line-height: 1.5; }
  .bank h3 { margin: 0 0 4px; color: #c1121f; font-size: 9px; letter-spacing: .08em; }
  .bank p { margin: 0; white-space: nowrap; }
  .brand .vendor { margin: 4px 0 0; color: #c1121f; font-weight: 700; font-size: 10px; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 2px solid #c1121f; display: flex; justify-content: space-between; gap: 16px; color: #66738c; font-size: 10px; }
</style></head>
<body>
  <div class="head">
    <div class="brand">
      <img src="${logo}" alt="">
      <div>
        <h1>${escapeHtml(LETTERHEAD.name)}</h1>
        <p>${escapeHtml(LETTERHEAD.tagline)}</p>
        <p>${escapeHtml(LETTERHEAD.address)}<br>${escapeHtml(LETTERHEAD.email)}<br>${escapeHtml(LETTERHEAD.phone)}</p>
        <p class="vendor">${escapeHtml(LETTERHEAD.vendor)}</p>
      </div>
    </div>
    <div class="doc">
      <h2>${documentTitle(payload)}</h2>
      <div class="number">${escapeHtml(payload.number || '')}</div>
      <table class="meta">${meta}</table>
    </div>
  </div>
  <div class="rule"></div>
  <div class="parties">
    <div>
      <div class="label">${payload.type === 'invoice' ? 'Bill to' : 'Prepared for'}</div>
      <div class="customer">${escapeHtml(payload.customer?.name || 'Walk-in customer')}</div>
      <div class="customer-lines">
        ${[payload.customer?.address, payload.customer?.phone, payload.customer?.email]
          .filter(Boolean)
          .map(escapeHtml)
          .join('<br>')}
      </div>
    </div>
    ${
      payload.type === 'invoice'
        ? `<div class="pay">
            <div class="label">Payment status</div>
            <div class="status">${escapeHtml(payload.status || '')}</div>
            <div class="customer-lines">
              Invoice total: ${money(currency, payload.total)}<br>
              Paid to date: ${money(currency, payload.amountPaid)}<br>
              <strong style="color:#c1121f">Balance due: ${money(currency, payload.balance)}</strong>
            </div>
          </div>`
        : ''
    }
  </div>
  <table class="items">
    <thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div class="notes">
      ${payload.notes ? `<section><h3>Notes</h3><div>${escapeHtml(payload.notes).replace(/\n/g, '<br>')}</div></section>` : ''}
      ${payload.terms ? `<section><h3>Terms &amp; conditions</h3><div>${escapeHtml(payload.terms).replace(/\n/g, '<br>')}</div></section>` : ''}
    </div>
    <table class="totals">${totals}</table>
  </div>
  <div class="bank">
    <div>
      <h3>BANK DETAILS</h3>
      ${LETTERHEAD.bank.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    </div>
    <div>
      ${LETTERHEAD.accounts.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    </div>
  </div>
  <div class="foot">
    <span>${escapeHtml(LETTERHEAD.email)}</span>
    <span>${documentTitle(payload)} ${escapeHtml(payload.number || '')}</span>
  </div>
</body></html>`

  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) throw new Error('Allow pop-ups to print this document.')
  win.document.open()
  win.document.write(html)
  win.document.close()
  const trigger = () => {
    try {
      win.focus()
      win.print()
    } catch {
      // Ignore; the print dialog may be blocked by the browser.
    }
  }
  const image = win.document.querySelector('img')
  if (image && !image.complete) {
    image.addEventListener('load', trigger)
    image.addEventListener('error', trigger)
    setTimeout(trigger, 900)
  } else {
    setTimeout(trigger, 350)
  }
  return win
}
