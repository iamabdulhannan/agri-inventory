import { daysLeft } from './due'
import { fetchAll } from './data'
import type { TFn, TKey } from './i18n'
import { supabase } from './supabase'
import type { LedgerRow, Party } from './types'

/* Types and helpers for the khata money features (recovery, cheques, crop advances). */

/** parties.due_rule (added in migration 013) */
export type PartyWithRule = Party & { due_rule?: string | null }

/** ledger kinds including the ones added in migration 013 */
export type LedgerKind = LedgerRow['kind'] | 'bank_paid' | 'advance_moved'
export const ledgerLabel = (kind: string, t: TFn) => t(`lk_${kind}` as TKey)

/** one unpaid bill of a customer (rpc customer_dues) */
export interface CustomerDue {
  party_id: string
  /** null = opening balance */
  sale_id: string | null
  invoice_no: number | null
  sale_date: string
  due_date: string | null
  amount: number
  outstanding: number
}

export async function loadDues(orgId: string, partyId?: string): Promise<CustomerDue[]> {
  let q = supabase.rpc('customer_dues', { p_org: orgId })
  if (partyId) q = q.eq('party_id', partyId)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as CustomerDue[]).map((d) => ({ ...d, amount: Number(d.amount), outstanding: Number(d.outstanding) }))
}

/** crop_advance_balances view */
export interface CropAdvance {
  id: string
  org_id: string
  party_id: string
  crop: string
  season: string | null
  note: string | null
  is_closed: boolean
  created_at: string
  party_name: string
  party_phone: string | null
  deposited: number
  used: number
  refunded: number
  moved_to_khata: number
  balance: number
  last_activity: string | null
}

export async function loadAdvances(orgId: string, partyId?: string): Promise<CropAdvance[]> {
  const rows = await fetchAll<CropAdvance>((a, b) => {
    let q = supabase.from('crop_advance_balances').select('*').eq('org_id', orgId)
    if (partyId) q = q.eq('party_id', partyId)
    return q.order('created_at', { ascending: false }).range(a, b)
  })
  return rows.map((r) => ({
    ...r,
    deposited: Number(r.deposited),
    used: Number(r.used),
    refunded: Number(r.refunded),
    moved_to_khata: Number(r.moved_to_khata),
    balance: Number(r.balance),
  }))
}

export type AdvanceKind = 'deposit' | 'use' | 'refund' | 'to_khata'
export interface AdvanceEntry {
  id: string
  advance_id: string
  entry_date: string
  kind: AdvanceKind
  amount: number
  sale_id: string | null
  cash_entry_id: string | null
  note: string | null
  created_by_name: string | null
  created_at: string
  sales: { invoice_no: number } | null
}

export async function loadAdvanceEntries(ids: string[]): Promise<AdvanceEntry[]> {
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('advance_entries')
    .select('id, advance_id, entry_date, kind, amount, sale_id, cash_entry_id, note, created_by_name, created_at, sales(invoice_no)')
    .in('advance_id', ids)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as AdvanceEntry[]).map((e) => ({ ...e, amount: Number(e.amount) }))
}

export interface Cheque {
  id: string
  direction: 'received' | 'issued'
  party_id: string
  amount: number
  cheque_no: string | null
  bank_name: string | null
  cheque_date: string
  received_on: string
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled'
}

export async function loadPendingCheques(partyId: string): Promise<Cheque[]> {
  const { data, error } = await supabase
    .from('cheques')
    .select('id, direction, party_id, amount, cheque_no, bank_name, cheque_date, received_on, status')
    .eq('party_id', partyId)
    .eq('status', 'pending')
    .order('cheque_date')
  if (error) throw error
  return ((data ?? []) as Cheque[]).map((c) => ({ ...c, amount: Number(c.amount) }))
}

// ------------------------------------------------------------------ due dates
export type DueGroup = 'overdue' | 'soon' | 'later' | 'none'

/** "12 days late" / "due today" / "due in 5 days" */
export function dueText(due: string, today: string, t: TFn): string {
  const n = daysLeft(due, today)
  if (n < 0) return t('khDaysLate', { n: -n })
  if (n === 0) return t('khDueToday')
  return t('khDueInDays', { n })
}

export function dueGroupOf(due: string | null, today: string): DueGroup {
  if (!due) return 'none'
  const n = daysLeft(due, today)
  return n < 0 ? 'overdue' : n <= 30 ? 'soon' : 'later'
}

export const DUE_TONE: Record<DueGroup, 'red' | 'amber' | 'stone'> = { overdue: 'red', soon: 'amber', later: 'stone', none: 'stone' }

// ------------------------------------------------------------------ WhatsApp
/** "0300-1234567" -> "923001234567"; null when it does not look like a phone number */
export function waNumber(phone: string | null | undefined): string | null {
  let d = String(phone ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('03')) return `92${d.slice(1)}`
  if (d.length === 10 && d.startsWith('3')) return `92${d}`
  if (d.length === 12 && d.startsWith('92')) return d
  if (d.length >= 11 && !d.startsWith('0')) return d
  return null
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}

/** polite payment reminder in the app language */
export function reminderText(
  t: TFn,
  o: { name: string; shop: string; shopPhone?: string | null; amount: string; due: string | null; dueLabel: string | null; today: string },
): string {
  const due = o.due && o.dueLabel ? (o.due < o.today ? t('khWaLate', { date: o.dueLabel }) : t('khWaDue', { date: o.dueLabel })) : ''
  const msg = t('khWaMsg', { name: o.name, shop: o.shop, amount: o.amount, due })
  return o.shopPhone ? `${msg}\n${o.shop} · ${o.shopPhone}` : msg
}

// ------------------------------------------------------------------ crops
export const CROPS: { name: string; key: TKey }[] = [
  { name: 'Potato', key: 'khCropPotato' },
  { name: 'Wheat', key: 'khCropWheat' },
  { name: 'Cotton', key: 'khCropCotton' },
  { name: 'Rice', key: 'khCropRice' },
  { name: 'Maize', key: 'khCropMaize' },
  { name: 'Sugarcane', key: 'khCropSugarcane' },
  { name: 'Vegetables', key: 'khCropVegetables' },
]

/** stored crop name -> label in the app language (known crops are stored in English) */
export function cropLabel(crop: string, t: TFn): string {
  const c = CROPS.find((x) => x.name.toLowerCase() === crop.trim().toLowerCase())
  return c ? t(c.key) : crop
}

/** typed / picked crop -> stored value (a known crop in any language is stored by its English name) */
export function cropToStore(v: string, t: TFn): string {
  const s = v.trim()
  const c = CROPS.find((x) => x.name.toLowerCase() === s.toLowerCase() || t(x.key) === s)
  return c ? c.name : s
}

export const advanceTitle = (a: Pick<CropAdvance, 'crop' | 'season'>, t: TFn) => [cropLabel(a.crop, t), a.season].filter(Boolean).join(' ')
