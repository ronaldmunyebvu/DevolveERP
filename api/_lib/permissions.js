export const MODULE_KEYS = [
  'inventory',
  'purchases',
  'sales',
  'quotations',
  'contacts',
  'transfers',
  'cashbook',
  'journals',
  'ledger',
  'reports',
  'activity',
]

export function normalizePermissions(value, role) {
  if (role === 'admin') return MODULE_KEYS
  const list = Array.isArray(value) ? value : []
  const allowed = new Set(MODULE_KEYS)
  return [...new Set(list.filter((key) => typeof key === 'string' && allowed.has(key)))]
}
