import { createHash } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** every file in public/ (app icons, manifest, landing images) */
function publicFiles(dir = 'public'): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...publicFiles(full))
    else if (!name.startsWith('_') && !name.startsWith('.')) out.push('/' + relative('public', full))
  }
  return out
}

/**
 * Builds /sw.js: keeps the whole app (code, styles, icons) on the device so it opens
 * and works without internet. Data is kept separately by the app (src/lib/offline).
 */
function serviceWorker(): Plugin {
  return {
    name: 'agri-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['/', ...Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js').map((f) => '/' + f), ...publicFiles()]
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      const source = `/* Agri Inventory service worker (generated at build) */
const CACHE = 'agri-app-${version}'
const RUNTIME = 'agri-runtime'
const PRECACHE = ${JSON.stringify([...new Set(files)])}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== RUNTIME) await caches.delete(k)
    await self.clients.claim()
  })())
})

// the page asks the new version to take over (after the user taps "Reload")
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting() })

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // app pages: network first, the saved app when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () => (await caches.match('/')) || (await caches.match('/index.html')) || Response.error()))
    return
  }
  // the app's own files: from the device
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith('/assets/')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })))
    return
  }
  // fonts: use the saved copy, refresh it in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req)
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res }).catch(() => hit)
      return hit || net
    }))
  }
  // everything else (Supabase data) goes straight to the network; the app keeps its own offline copy
})
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
})
