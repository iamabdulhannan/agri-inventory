import { supabase } from '../supabase'
import { deviceId, returnInvoiceNumber } from './device'
import { browserOnline, isOnline, markNetwork, onNetwork } from './net'
import { enqueue, listOps, removeOp, updateOp, type PendingOp } from './queue'

type Fn = PendingOp['fn']
export type ApplyResult = { status: 'done'; result: unknown } | { status: 'queued'; op: PendingOp }

/** network trouble (not a real answer from the server) */
const isNetworkError = (e: unknown) => {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET|timeout/i.test(m)
}
const missingFn = (msg: string) => /offline_apply|schema cache|PGRST202/.test(msg)

/** send one change; returns ok/result, a server error (nothing saved), or throws on network trouble */
async function send(op: PendingOp): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('offline_apply', { p_org: op.org_id, p_op: op.id, p_fn: op.fn, p_args: op.args, p_device: deviceId() })
  if (error) {
    if (isNetworkError(error)) throw error
    // before migration 019: call the function directly (no duplicate protection, online only)
    if (missingFn(String(error.message))) {
      const args: Record<string, unknown> = { p_org: op.org_id, ...op.args }
      delete args.p_invoice_no
      const r = await supabase.rpc(op.fn, args)
      if (r.error) {
        if (isNetworkError(r.error)) throw r.error
        return { ok: false, error: r.error.message }
      }
      return { ok: true, result: r.data }
    }
    return { ok: false, error: error.message }
  }
  const d = data as { ok: boolean; result?: unknown; error?: string; detail?: string }
  return d.ok ? { ok: true, result: d.result } : { ok: false, error: [d.error, d.detail].filter(Boolean).join(' · ') }
}

/**
 * Save a change. Online: it is applied now (errors are thrown as usual).
 * No internet (or the connection drops): it is kept on this device and sent later, exactly once.
 */
export async function applyChange(orgId: string, fn: Fn, args: Record<string, unknown>, label: string, invoiceNo?: number | null): Promise<ApplyResult> {
  const op: PendingOp = { id: crypto.randomUUID(), org_id: orgId, fn, args, label, created_at: new Date().toISOString(), status: 'pending', invoice_no: invoiceNo ?? null, tries: 0 }
  // changes made earlier on this device go first (stock in before the sale that needs it)
  const waiting = (await listOps(orgId)).some((o) => o.status === 'pending')
  if (isOnline() && !waiting) {
    try {
      const r = await send(op)
      markNetwork(true)
      if (r.ok) return { status: 'done', result: r.result }
      returnInvoiceNumber(orgId, invoiceNo)
      throw new Error(r.error)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      markNetwork(false)
    }
  }
  await enqueue(op)
  void syncNow()
  return { status: 'queued', op }
}

let running: Promise<number> | null = null
const doneListeners = new Set<(n: number) => void>()
/** called after changes reached the server (the app reloads its data) */
export const onSynced = (l: (n: number) => void) => {
  doneListeners.add(l)
  return () => { doneListeners.delete(l) }
}

/** Send everything that is waiting, oldest first. Returns how many were saved. */
export function syncNow(): Promise<number> {
  if (running) return running
  running = (async () => {
    let saved = 0
    // also tried when the server was unreachable a moment ago: a success switches back to online
    if (!browserOnline()) return 0
    for (const op of await listOps()) {
      if (op.status !== 'pending') continue
      try {
        const r = await send(op)
        markNetwork(true)
        if (r.ok) {
          await removeOp(op.id)
          saved++
        } else {
          await updateOp(op.id, { status: 'failed', error: r.error, tries: op.tries + 1 })
        }
      } catch (e) {
        if (isNetworkError(e)) { markNetwork(false); break }
        await updateOp(op.id, { status: 'failed', error: String((e as Error)?.message ?? e), tries: op.tries + 1 })
      }
    }
    if (saved) doneListeners.forEach((l) => l(saved))
    return saved
  })().finally(() => { running = null })
  return running
}

/** try a held change again (after fixing the reason) */
export async function retryOp(id: string) {
  await updateOp(id, { status: 'pending', error: undefined })
  return syncNow()
}

/** drop a change that should not be saved; a sale gives its invoice number back */
export async function discardOp(op: PendingOp) {
  await removeOp(op.id)
  returnInvoiceNumber(op.org_id, op.invoice_no)
}

// send automatically when the internet comes back, and every 30 seconds
if (typeof window !== 'undefined') {
  onNetwork((on) => { if (on) void syncNow() })
  setInterval(() => { if (browserOnline()) void syncNow() }, 30_000)
}
