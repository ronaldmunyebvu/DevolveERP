const ENDPOINT = '/api/auth'

export class AuthApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

async function call(action, payload = {}) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new AuthApiError('Could not reach the server. Check your connection and try again.', 0)
  }

  let result = null
  try {
    result = await response.json()
  } catch {
    result = null
  }

  if (!response.ok) {
    throw new AuthApiError(result?.error || 'The request could not be completed.', response.status)
  }
  return result
}

export async function restore() {
  const result = await call('session')
  return result?.account ?? null
}

export async function signIn(email, password, role) {
  const result = await call('signIn', { email, password, role })
  return result?.account ?? null
}

export async function requestSetup(email, role) {
  return call('requestSetup', { email, role })
}

export async function completeSetup({ email, code, password, confirmPassword }) {
  const result = await call('completeSetup', { email, code, password, confirmPassword })
  return result?.account ?? null
}

export async function requestPasswordReset(email, role) {
  return call('requestPasswordReset', { email, role })
}

export async function completePasswordReset({ email, code, password, confirmPassword }) {
  const result = await call('completePasswordReset', { email, code, password, confirmPassword })
  return result?.account ?? null
}

export async function changePassword({ currentPassword, password, confirmPassword }) {
  return call('changePassword', { currentPassword, password, confirmPassword })
}

export async function signOut() {
  await call('signOut')
}
