/**
 * The operation manifest shared by the browser and the API.
 *
 * The browser builds its repository proxy from these keys, and the server only
 * executes keys declared here. Every business operation requires a session;
 * `admin` operations additionally require the admin role.
 */
export const OPERATIONS = {
  'company.get': { auth: 'member' },
  'company.update': { auth: 'admin' },

  'users.list': { auth: 'member' },
  'users.create': { auth: 'admin' },
  'users.update': { auth: 'admin' },
  'users.remove': { auth: 'admin' },
  'users.sendSetupCode': { auth: 'admin' },

  'categories.list': { auth: 'member' },
  'categories.create': { auth: 'admin' },
  'categories.update': { auth: 'admin' },
  'categories.remove': { auth: 'admin' },

  'locations.list': { auth: 'member' },

  'products.list': { auth: 'member' },
  'products.get': { auth: 'member' },
  'products.create': { auth: 'member' },
  'products.update': { auth: 'member' },
  'products.remove': { auth: 'member' },
  'products.movements': { auth: 'member' },
  'products.adjust': { auth: 'member' },
  'products.nextSku': { auth: 'member' },

  'suppliers.list': { auth: 'member' },
  'suppliers.create': { auth: 'member' },
  'suppliers.update': { auth: 'member' },
  'suppliers.remove': { auth: 'member' },

  'customers.list': { auth: 'member' },
  'customers.create': { auth: 'member' },
  'customers.update': { auth: 'member' },
  'customers.remove': { auth: 'member' },
  'customers.statement': { auth: 'member' },

  'purchases.list': { auth: 'member' },
  'purchases.get': { auth: 'member' },
  'purchases.create': { auth: 'member' },
  'purchases.receive': { auth: 'member' },
  'purchases.remove': { auth: 'member' },

  'sales.list': { auth: 'member' },
  'sales.get': { auth: 'member' },
  'sales.create': { auth: 'member' },
  'sales.update': { auth: 'member' },
  'sales.addPayment': { auth: 'member' },
  'sales.remove': { auth: 'member' },
  'sales.payments': { auth: 'member' },

  'quotations.list': { auth: 'member' },
  'quotations.get': { auth: 'member' },
  'quotations.create': { auth: 'member' },
  'quotations.update': { auth: 'member' },
  'quotations.remove': { auth: 'member' },
  'quotations.convert': { auth: 'member' },

  'transfers.list': { auth: 'member' },
  'transfers.get': { auth: 'member' },
  'transfers.create': { auth: 'member' },
  'transfers.remove': { auth: 'member' },

  'cashbook.list': { auth: 'member' },
  'cashbook.create': { auth: 'member' },
  'cashbook.remove': { auth: 'member' },
  'cashbook.summary': { auth: 'member' },

  'journals.list': { auth: 'member' },
  'journals.create': { auth: 'member' },
  'journals.remove': { auth: 'member' },
  'journals.generalLedger': { auth: 'member' },

  'activity.list': { auth: 'member' },

  'reports.dashboard': { auth: 'member' },
  'reports.dailySales': { auth: 'member' },
  'reports.dailyPurchases': { auth: 'member' },
  'reports.dailyBalances': { auth: 'member' },
  'reports.inventoryValuation': { auth: 'member' },
  'reports.margins': { auth: 'member' },
  'reports.receivables': { auth: 'member' },
  'reports.expenses': { auth: 'member' },
  'reports.lowStock': { auth: 'member' },
  'reports.expiring': { auth: 'member' },
}

export function groupOf(operation) {
  const dot = operation.indexOf('.')
  return dot === -1 ? '' : operation.slice(0, dot)
}

export function methodOf(operation) {
  const dot = operation.indexOf('.')
  return dot === -1 ? operation : operation.slice(dot + 1)
}

export const OPERATION_KEYS = Object.freeze(Object.keys(OPERATIONS))
