import { supabase } from './supabase'
import type { PackType, PackUnit } from './types'

export interface Investor {
  id: string
  org_id: string
  name: string
  phone: string | null
  profit_share: number
  note: string | null
  is_active: boolean
  created_at: string
}

/** investor_summary(): money and stock of one investor */
export interface InvestorFigures {
  investor_id: string
  capital: number
  /** booked profit not yet paid or reinvested */
  profit_balance: number
  /** profit on his stock since the last booking (all of it) / his part of it */
  open_gross: number
  open_profit: number
  equity: number
  stock_cost: number
  available: number
  units_left: number
  products_left: number
  total_gross: number
  total_paid_out: number
}

export type InvestorRow = Investor & InvestorFigures & {
  /** profit he can take now (booked + his part of open) */
  profit_now: number
}

const n = (v: unknown) => Number(v ?? 0)

export async function loadInvestors(orgId: string): Promise<InvestorRow[]> {
  const [inv, sum] = await Promise.all([
    supabase.from('investors').select('*').eq('org_id', orgId).order('name'),
    supabase.rpc('investor_summary', { p_org: orgId }),
  ])
  if (inv.error) throw inv.error
  if (sum.error) throw sum.error
  const by = new Map(((sum.data ?? []) as InvestorFigures[]).map((x) => [x.investor_id, x]))
  return ((inv.data ?? []) as Investor[]).map((i) => {
    const f = by.get(i.id)
    const fig: InvestorFigures = {
      investor_id: i.id, capital: n(f?.capital), profit_balance: n(f?.profit_balance), open_gross: n(f?.open_gross), open_profit: n(f?.open_profit),
      equity: n(f?.equity), stock_cost: n(f?.stock_cost), available: n(f?.available), units_left: n(f?.units_left), products_left: n(f?.products_left),
      total_gross: n(f?.total_gross), total_paid_out: n(f?.total_paid_out),
    }
    return { ...i, profit_share: n(i.profit_share), ...fig, profit_now: fig.profit_balance + fig.open_profit }
  })
}

export type InvestorStatus = 'selling' | 'ready' | 'idle' | 'empty'
export function investorStatus(r: InvestorRow): InvestorStatus {
  if (r.units_left > 0.000001) return 'selling'
  if (Math.abs(r.open_gross) > 0.005 || Math.abs(r.profit_balance) > 0.005) return 'ready'
  if (r.equity > 0.005) return 'idle'
  return 'empty'
}

export interface LotStatus {
  id: string
  investor_id: string
  product_id: string
  qty: number
  unit_cost: number
  entry_date: string
  purchase_id: string | null
  note: string | null
  product_name: string
  product_name_ur: string | null
  pack_size: number
  pack_unit: PackUnit
  pack_type: PackType
  company_name: string | null
  sold: number
  left_qty: number
  revenue: number
  gross_profit: number
  last_sale: string | null
}

export interface InvestorEntry {
  id: string
  entry_date: string
  kind: 'deposit' | 'profit' | 'reinvest' | 'withdraw_profit' | 'withdraw_capital'
  amount: number
  settlement_id: string | null
  cash_entry_id: string | null
  note: string | null
  created_by_name: string | null
  created_at: string
}

export interface Settlement {
  id: string
  entry_date: string
  mode: string
  gross_profit: number
  share_pct: number
  investor_profit: number
  shop_profit: number
  created_at: string
}

export interface DailyProfit { day: string; qty: number; revenue: number; cost: number; gross_profit: number; investor_profit: number }

/** his part of a profit: share % of a profit, all of a loss (same rule as the database) */
export const investorPart = (gross: number, share: number) => Math.round((gross > 0 ? (gross * share) / 100 : gross) * 100) / 100
