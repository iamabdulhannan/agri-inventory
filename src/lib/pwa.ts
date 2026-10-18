/** Installable app: service worker registration, "install app" and "new version" prompts */
type L = () => void
const listeners = new Set<L>()
const emit = () => listeners.forEach((l) => l())
export const onPwa = (l: L) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let installEvent: InstallEvent | null = null
let waiting: ServiceWorker | null = null

export const canInstall = () => !!installEvent
export const updateReady = () => !!waiting

export async function promptInstall() {
  if (!installEvent) return
  await installEvent.prompt()
  await installEvent.userChoice.catch(() => null)
  installEvent = null
  emit()
}

/** switch to the new version (the page reloads once) */
export function applyUpdate() {
  if (!waiting) return location.reload()
  waiting.postMessage('skipWaiting')
}

export function registerPwa() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => { installEvent = null; emit() })
  // only the built app has a service worker (not the dev server)
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const track = (w: ServiceWorker | null) => {
        if (!w) return
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; emit() }
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; emit() }
      reg.addEventListener('updatefound', () => track(reg.installing))
      // look for a new version now and then
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    } catch {
      /* no offline app shell: the app still works online */
    }
  })
}
