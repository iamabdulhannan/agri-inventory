import { fetchAll } from './data'
import { supabase } from './supabase'
import type { PartyBalance, PartyKind } from './types'

export async function loadParties(orgId: string, kind?: PartyKind): Promise<PartyBalance[]> {
  const rows = await fetchAll<PartyBalance>((a, b) => {
    let q = supabase.from('party_balances').select('*').eq('org_id', orgId)
    if (kind) q = q.eq('kind', kind)
    return q.order('name').range(a, b)
  })
  return rows.map((p) => ({ ...p, balance: Number(p.balance), opening_balance: Number(p.opening_balance) }))
}
