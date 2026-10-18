import { idbGet, idbSet } from './idb'
import { browserOnline, isOnline, markNetwork } from './net'

/**
 * fetch() used by the Supabase client.
 *  - Reads (table selects and read-only reports) are saved on the device after every
 *    successful load, and served from there when there is no internet.
 *  - Writes always go to the server (offline writes are queued by src/lib/offline/sync.ts).
 */
const READ_RPC = /\/rest\/v1\/rpc\/(stock_summary|daily_register|product_sales|sales_days|money_summary|money_position|cash_days|customer_dues|facility_summary|year_report|year_stock|investor_summary|investor_daily|sale_returnable|party_ledger|advance_balance|my_reserved_invoices)\b/

interface Saved { status: number; headers: [string, string][]; body: string; at: number }

const keyOf = async (req: Request) => {
  const body = req.method === 'POST' ? await req.clone().text() : ''
  // the same data for every token: drop the auth part, keep url + body
  return `${req.method} ${req.url} ${body}`
}

export const OFFLINE_HEADER = 'x-agri-offline'

export function makeOfflineFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init)
    const url = req.url
    const isRead = (req.method === 'GET' && url.includes('/rest/v1/') && !url.includes('/rest/v1/rpc/'))
      || (req.method === 'POST' && READ_RPC.test(url))
    if (!isRead) {
      try {
        const res = await baseFetch(req)
        markNetwork(true)
        return res
      } catch (e) {
        markNetwork(false)
        throw e
      }
    }
    const key = await keyOf(req)
    const fromDevice = async () => {
      const saved = await idbGet<Saved>('reads', key).catch(() => undefined)
      if (!saved) return null
      const headers = new Headers(saved.headers)
      headers.set(OFFLINE_HEADER, String(saved.at))
      return new Response(saved.body, { status: saved.status, headers })
    }
    // no network at all: straight from the device
    if (!browserOnline()) {
      const hit = await fromDevice()
      if (hit) return hit
    }
    try {
      // the server was unreachable a moment ago: try again, but don't wait long
      const res = await (isOnline() ? baseFetch(req) : withTimeout(baseFetch(req), 6000))
      markNetwork(true)
      if (res.ok) {
        const body = await res.clone().text()
        const headers: [string, string][] = []
        res.headers.forEach((v, k) => { if (k === 'content-type' || k === 'content-range') headers.push([k, v]) })
        idbSet('reads', key, { status: res.status, headers, body, at: Date.now() } satisfies Saved).catch(() => {})
      }
      return res
    } catch (e) {
      markNetwork(false)
      const hit = await fromDevice()
      if (hit) return hit
      throw e
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new TypeError('Failed to fetch (timeout)')), ms)
    p.then((v) => { clearTimeout(id); resolve(v) }, (e) => { clearTimeout(id); reject(e) })
  })
}
