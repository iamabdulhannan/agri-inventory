import { fetchAll } from '../../lib/data'
import { supabase } from '../../lib/supabase'

/** money_position(): one account inside it */
export interface PositionAccount {
  id: string
  name: string
  kind: 'bank' | 'wallet'
  bank_name: string | null
  account_no: string | null
  is_active: boolean
  balance: number
}

/** money_position(): everything about the shop's money in one call */
export interface MoneyPosition {
  cash: number
  accounts: PositionAccount[]
  cheques_in_hand: number
  cheques_in_count: number
  cheques_due_week: number
  cheques_out_pending: number
  bank_owed: number
  next_bank_due: string | null
  guarantees_expiring: number
  crop_advances: number
  dues_overdue: number
  dues_next_30: number
}

const n = (v: unknown) => Number(v ?? 0) || 0

export async function loadPosition(orgId: string): Promise<MoneyPosition> {
  const { data, error } = await supabase.rpc('money_position', { p_org: orgId })
  if (error) throw error
  const d = (data ?? {}) as Record<string, unknown>
  return {
    cash: n(d.cash),
    accounts: ((d.accounts ?? []) as PositionAccount[]).map((a) => ({ ...a, balance: n(a.balance) })),
    cheques_in_hand: n(d.cheques_in_hand),
    cheques_in_count: n(d.cheques_in_count),
    cheques_due_week: n(d.cheques_due_week),
    cheques_out_pending: n(d.cheques_out_pending),
    bank_owed: n(d.bank_owed),
    next_bank_due: (d.next_bank_due as string | null) ?? null,
    guarantees_expiring: n(d.guarantees_expiring),
    crop_advances: n(d.crop_advances),
    dues_overdue: n(d.dues_overdue),
    dues_next_30: n(d.dues_next_30),
  }
}

export type ChequeStatus = 'pending' | 'cleared' | 'bounced' | 'cancelled'
export interface Cheque {
  id: string
  org_id: string
  direction: 'received' | 'issued'
  party_id: string
  amount: number
  cheque_no: string | null
  bank_name: string | null
  cheque_date: string
  received_on: string
  status: ChequeStatus
  account_id: string | null
  cleared_on: string | null
  note: string | null
  created_by_name: string | null
  created_at: string
  parties?: { name: string } | null
}

export async function loadCheques(orgId: string): Promise<Cheque[]> {
  const rows = await fetchAll<Cheque>((a, b) =>
    supabase.from('cheques').select('*, parties(name)').eq('org_id', orgId).order('cheque_date').range(a, b),
  )
  return rows.map((c) => ({ ...c, amount: n(c.amount) }))
}

export interface Facility {
  id: string
  org_id: string
  kind: 'finance' | 'guarantee'
  bank_name: string
  title: string | null
  limit_amount: number
  start_date: string | null
  expiry_date: string | null
  party_id: string | null
  account_id: string | null
  is_active: boolean
  note: string | null
  created_at: string
  parties?: { name: string } | null
}

export interface FacilityEntry {
  id: string
  org_id: string
  facility_id: string
  entry_date: string
  kind: 'drawdown' | 'repayment' | 'markup'
  amount: number
  party_id: string | null
  cash_entry_id: string | null
  note: string | null
  created_by_name: string | null
  created_at: string
  parties?: { name: string } | null
}

export interface FacilitySummary {
  facility_id: string
  drawn: number
  repaid: number
  markup_paid: number
  owed: number
  guarantee_used: number | null
}

export async function loadFacilities(orgId: string) {
  const [fac, sum, entries] = await Promise.all([
    supabase.from('bank_facilities').select('*, parties(name)').eq('org_id', orgId).order('is_active', { ascending: false }).order('created_at'),
    supabase.rpc('facility_summary', { p_org: orgId }),
    fetchAll<FacilityEntry>((a, b) =>
      supabase.from('facility_entries').select('*, parties(name)').eq('org_id', orgId)
        .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).range(a, b),
    ),
  ])
  if (fac.error) throw fac.error
  if (sum.error) throw sum.error
  const summary = new Map<string, FacilitySummary>()
  for (const s of (sum.data ?? []) as FacilitySummary[]) {
    summary.set(s.facility_id, {
      facility_id: s.facility_id, drawn: n(s.drawn), repaid: n(s.repaid), markup_paid: n(s.markup_paid), owed: n(s.owed),
      guarantee_used: s.guarantee_used == null ? null : n(s.guarantee_used),
    })
  }
  const byFacility = new Map<string, FacilityEntry[]>()
  for (const e of entries) {
    const list = byFacility.get(e.facility_id) ?? []
    list.push({ ...e, amount: n(e.amount) })
    byFacility.set(e.facility_id, list)
  }
  const facilities = ((fac.data ?? []) as Facility[]).map((f) => ({ ...f, limit_amount: n(f.limit_amount) }))
  return { facilities, summary, byFacility }
}

/** "123" from an <input type=number>, or NaN */
export const amountOf = (s: string) => (s.trim() === '' ? NaN : Number(s))
