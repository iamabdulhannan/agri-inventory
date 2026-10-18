import { idbAll, idbDel, idbGet, idbSet } from './idb'

/** A change made on this device that still has to reach the server */
export interface PendingOp {
  id: string // also the change's id on the server (it is applied once)
  org_id: string
  fn: 'record_sale' | 'record_stock_in' | 'record_party_payment' | 'add_cash_entry' | 'record_cheque'
  args: Record<string, unknown>
  /** what the user sees in the sync list, e.g. "Sale · INV-12 · Rs 1,500" */
  label: string
  created_at: string
  status: 'pending' | 'failed'
  error?: string
  /** reserved invoice number used by this sale */
  invoice_no?: number | null
  tries: number
}

type Listener = () => void
const listeners = new Set<Listener>()
export const onQueue = (l: Listener) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export const notifyQueue = () => listeners.forEach((l) => l())

export async function enqueue(op: PendingOp) {
  await idbSet('ops', op.id, op)
  notifyQueue()
}
export async function updateOp(id: string, patch: Partial<PendingOp>) {
  const cur = await idbGet<PendingOp>('ops', id)
  if (!cur) return
  await idbSet('ops', id, { ...cur, ...patch })
  notifyQueue()
}
export async function removeOp(id: string) {
  await idbDel('ops', id)
  notifyQueue()
}
/** oldest first: stock in before the sales that need it */
export async function listOps(orgId?: string): Promise<PendingOp[]> {
  const all = await idbAll<PendingOp>('ops').catch(() => [] as PendingOp[])
  return all.filter((o) => !orgId || o.org_id === orgId).sort((a, b) => a.created_at.localeCompare(b.created_at))
}
