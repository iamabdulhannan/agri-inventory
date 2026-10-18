import { supabase } from '../supabase'
import { isOnline } from './net'

/** This browser / installed app, so each device gets its own invoice numbers */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('agri.deviceId')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('agri.deviceId', id)
    }
    return id
  } catch {
    return 'unknown-device'
  }
}

const KEEP = 20 // top up when fewer than this are left
const BLOCK = 50
const key = (org: string) => `agri.invoiceNos.${org}`
const read = (org: string): number[] => {
  try { return JSON.parse(localStorage.getItem(key(org)) || '[]') as number[] } catch { return [] }
}
const write = (org: string, nos: number[]) => {
  try { localStorage.setItem(key(org), JSON.stringify([...new Set(nos)].sort((a, b) => a - b))) } catch { /* ignore */ }
}

let topping: Promise<void> | null = null
/** Keep a block of invoice numbers on this device (works only online; quietly skips before migration 019) */
export function topUpInvoiceNumbers(org: string): Promise<void> {
  if (topping || !isOnline()) return topping ?? Promise.resolve()
  topping = (async () => {
    let nos = read(org)
    if (!nos.length) {
      // a reinstalled app gets back the numbers it still holds
      const { data } = await supabase.rpc('my_reserved_invoices', { p_org: org, p_device: deviceId() })
      if (Array.isArray(data)) nos = data as number[]
    }
    if (nos.length < KEEP) {
      const { data, error } = await supabase.rpc('reserve_invoice_numbers', { p_org: org, p_device: deviceId(), p_count: BLOCK })
      if (!error && Array.isArray(data)) nos = [...nos, ...(data as number[])]
    }
    write(org, nos)
  })().finally(() => { topping = null })
  return topping
}

/** the next invoice number of this device (null = none left: the server gives one on sync) */
export function takeInvoiceNumber(org: string): number | null {
  const nos = read(org)
  const n = nos.shift()
  write(org, nos)
  return n ?? null
}
/** a sale that was not saved gives its number back */
export function returnInvoiceNumber(org: string, n: number | null | undefined) {
  if (n) write(org, [n, ...read(org)])
}
export const invoiceNumbersLeft = (org: string) => read(org).length
