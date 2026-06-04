// Generate a PDF of the cs2026 reveal.js deck via decktape, served from a local
// `vite preview` of the built site. Output: public/talks/cs2026.pdf (committed,
// so it deploys to numericelements.com/talks/cs2026.pdf and the phone redirect
// in Talk.tsx has something to land on).
//
//   bun run pdf            # builds, then exports
//
// Requires decktape (fetched on demand via bunx) + a Chromium it can drive.
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4178
// ?interactive disables the phone redirect, so decktape always reaches the deck.
const DECK_URL = `http://localhost:${PORT}/talks/cs2026?interactive`
const OUT = 'public/talks/cs2026.pdf'

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error(`vite preview did not come up at ${url}`)
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    p.on('error', reject)
  })
}

await mkdir('public/talks', { recursive: true })

console.log('· starting vite preview…')
const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
})

try {
  await waitForServer(`http://localhost:${PORT}/`)
  console.log('· exporting deck with decktape…')
  await run('bunx', [
    'decktape@3',
    'reveal',
    '--size',
    '1600x900',
    '--load-pause',
    '1800', // let React + KaTeX + the canvas/SVG demos paint their initial state
    DECK_URL,
    OUT,
  ])
  console.log(`✓ wrote ${OUT}`)
} finally {
  preview.kill('SIGTERM')
}
