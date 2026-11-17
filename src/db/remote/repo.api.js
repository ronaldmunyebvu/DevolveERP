import { OPERATIONS, groupOf, methodOf } from '../operations'

const ENDPOINT = '/api/data'

export class ApiRequestError extends Error {
  constructor(message, status, payload = null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.payload = payload
  }
}

async function send(operation, args) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation, args }),
    })
  } catch {
    throw new ApiRequestError('Could not reach the server. Check your connection and try again.', 0)
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ApiRequestError(
      payload?.error || 'The request could not be completed.',
      response.status,
      payload,
    )
  }
  return payload?.data ?? null
}

function withGeneratedId(operation, args) {
  const prepared = structuredClone(args)
  if (operation.endsWith('.create') && prepared[0] && typeof prepared[0] === 'object') {
    prepared[0].id ||= crypto.randomUUID()
  }
  return prepared
}

export function createApiRepository() {
  const repo = { mode: 'api', onChange: () => () => {} }
  for (const operation of Object.keys(OPERATIONS)) {
    const group = groupOf(operation)
    const method = methodOf(operation)
    const call = (...inputArgs) => send(operation, withGeneratedId(operation, inputArgs))
    if (!group) {
      repo[method] = call
    } else {
      repo[group] = repo[group] || {}
      repo[group][method] = call
    }
  }
  return repo
}
