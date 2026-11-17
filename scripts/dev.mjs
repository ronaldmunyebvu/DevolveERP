/**
 * Runs the API and Vite together so `npm run dev` works like the deployed app.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

const children = [
  spawn(process.execPath, ['--env-file=.env', path.join(here, 'dev-api.mjs')], {
    cwd: root,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteBin], { cwd: root, stdio: 'inherit' }),
]

function shutdown(signal) {
  for (const child of children) child.kill(signal)
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown('SIGTERM')
  })
}
