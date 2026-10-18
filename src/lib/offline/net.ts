/** Online / offline state shared by the whole app */
type Listener = (online: boolean) => void
const listeners = new Set<Listener>()
let online = typeof navigator === 'undefined' ? true : navigator.onLine
let serverDown = false // the browser says online but Supabase can't be reached

function emit() {
  const v = isOnline()
  listeners.forEach((l) => l(v))
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true; serverDown = false; emit() })
  window.addEventListener('offline', () => { online = false; emit() })
}

export const isOnline = () => online && !serverDown
/** the device has a network (the server may still be unreachable): worth trying again */
export const browserOnline = () => online
/** a request failed because of the network: treat as offline until the next success */
export function markNetwork(ok: boolean) {
  if (serverDown === !ok) return
  serverDown = !ok
  emit()
}
export function onNetwork(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
