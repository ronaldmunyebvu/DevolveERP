/**
 * Single serverless entry point. Vercel routes every `/api/*` request here.
 */
import { warmPool } from './_lib/db.js'
import authHandler from './_lib/handler-auth.js'
import dataHandler from './_lib/handler-data.js'
import healthHandler from './_lib/handler-health.js'
import mailHandler from './_lib/handler-mail.js'

let warmed = false

function warmOnce() {
  if (warmed) return
  warmed = true
  warmPool().catch(() => {})
}

const ROUTES = new Map([
  ['/api/auth', authHandler],
  ['/api/data', dataHandler],
  ['/api/health', healthHandler],
  ['/api/mail', mailHandler],
])

async function dispatch(event) {
  const path = (event.path || event.rawPath || '').split('?')[0]
  const target = ROUTES.get(path)
  if (!target) {
    return {
      statusCode: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'Unknown endpoint.' }),
    }
  }
  if (path !== '/api/health') warmOnce()
  return target(event)
}

async function requestBody(request) {
  if (request.body !== undefined && request.body !== null) {
    return typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
  }
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : null
}

async function toEvent(request) {
  const headers = request.headers || {}
  const host = headers.host || 'localhost'
  const url = new URL(request.url || '/', `http://${host}`)
  return {
    httpMethod: request.method || 'GET',
    headers,
    body: await requestBody(request),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
  }
}

function writeResponse(response, result) {
  for (const [name, value] of Object.entries(result.headers || {})) {
    response.setHeader(name, value)
  }
  response.statusCode = result.statusCode || 200
  response.end(result.body ?? '')
}

export default async function handler(request, response) {
  // Direct event invocation (tests, local API server).
  if (!response) return dispatch(request)

  try {
    writeResponse(response, await dispatch(await toEvent(request)))
  } catch (error) {
    console.error('[api] unhandled request error', error)
    if (response.headersSent) {
      response.destroy(error)
      return
    }
    response.statusCode = 500
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify({ error: 'The request could not be completed.' }))
  }
}
