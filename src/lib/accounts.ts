import { useOrg } from './app'
import { useLoad } from './data'
import { supabase } from './supabase'

/** A bank account or mobile wallet. Cash in hand is not a row: it is "no account" (null). */
export interface MoneyAccount {
  id: string
  org_id: string
  kind: 'bank' | 'wallet'
  name: string
  bank_name: string | null
  account_no: string | null
  opening_balance: number
  is_active: boolean
  created_at: string
}

export async function loadAccounts(orgId: string): Promise<MoneyAccount[]> {
  const { data, error } = await supabase.from('money_accounts').select('*').eq('org_id', orgId).order('name')
  // before migration 013 the table does not exist: behave as "cash only"
  if (error) return []
  return (data ?? []) as MoneyAccount[]
}

/** Accounts of the current organization (reloads after refresh()) */
export function useAccounts() {
  const { org, version } = useOrg()
  return useLoad(() => loadAccounts(org.id), [org.id, version])
}
