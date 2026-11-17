import { one } from './db.js'
import { json } from './http.js'

export default async function handler() {
  try {
    const row = await one('SELECT 1 AS ok')
    return json({ ok: Boolean(row), service: 'devolve-erp', time: new Date().toISOString() })
  } catch (error) {
    return json({ ok: false, error: error.message }, 503)
  }
}
