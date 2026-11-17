/**
 * Local API server for `npm run dev`.
 *
 * It adapts Node's request/response objects to the same event shape the Vercel
 * function receives, so the exact production handlers run locally.
 */
import http from 'node:http'
import handler from '../api/index.js'

const PORT = Number(process.env.API_PORT || 3000)

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : null
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    const event = {
      httpMethod: request.method || 'GET',
      headers: request.headers,
      body: await readBody(request),
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    }

    const result = await handler(event)
    response.statusCode = result.statusCode || 200
    for (const [name, value] of Object.entries(result.headers || {})) {
      response.setHeader(name, value)
    }
    response.end(result.body ?? '')
  } catch (error) {
    console.error('[dev-api]', error)
    response.statusCode = 500
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ error: 'The request could not be completed.' }))
  }
})

server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT}`)
})
