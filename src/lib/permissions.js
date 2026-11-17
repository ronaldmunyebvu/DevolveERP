export const MODULES = [
  { key: 'inventory', label: 'Inventory', description: 'Products, stock levels and categories' },
  { key: 'purchases', label: 'Purchases', description: 'Supplier orders and receiving' },
  { key: 'sales', label: 'Sales & Invoices', description: 'Invoices and customer receipts' },
  { key: 'quotations', label: 'Quotations', description: 'Quotes and conversions' },
  { key: 'contacts', label: 'Customers & Suppliers', description: 'Trading contacts' },
  { key: 'transfers', label: 'Stock Transfers', description: 'Move stock between locations' },
  { key: 'cashbook', label: 'Cashbook', description: 'Cash receipts and payments' },
  { key: 'journals', label: 'Journals', description: 'Accounting entries' },
  { key: 'ledger', label: 'General ledger', description: 'Account balances and ledger activity' },
  { key: 'reports', label: 'Reports', description: 'Sales, stock and finance reports' },
  { key: 'activity', label: 'Activity log', description: 'Audit trail of team actions' },
]

export const MODULE_KEYS = MODULES.map((module) => module.key)
