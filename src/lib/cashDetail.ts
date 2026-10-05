import type { Lang, TFn } from './i18n'
import { fmtMoney } from './money'
import { supabase } from './supabase'
import type { CashEntry, PackUnit } from './types'
import { fmtNum, fmtPack } from './units'

/** cash_entries row with the documents it belongs to */
export type CashEntryFull = CashEntry & {
  return_id?: string | null
  purchases?: { purchase_no: number; supplier_name: string | null; reference: string | null; total: number; paid: number } | null
  sales?: { invoice_no: number; customer_name: string | null; total: number; paid: number } | null
  sale_returns?: { total: number; refund: number; sales: { invoice_no: number; customer_name: string | null } | null } | null
}

export const CASH_SELECT =
  '*, parties(name), purchases(purchase_no, supplier_name, reference, total, paid), sales(invoice_no, customer_name, total, paid), sale_returns(total, refund, sales(invoice_no, customer_name))'

interface Item { name: string; name_ur: string | null; size: number; unit: PackUnit; qty: number; company: string | null }
type MoveRow = {
  purchase_id: string | null
  sale_id: string | null
  return_id: string | null
  qty: number
  batches: { products: { name: string; name_ur: string | null; pack_size: number; pack_unit: PackUnit; companies: { name: string } | null } | null } | null
}

/** items of the purchases / sales / returns behind these cash entries, keyed by document id */
export async function loadCashItems(entries: CashEntryFull[]): Promise<Map<string, Item[]>> {
  const ids = (k: 'purchase_id' | 'sale_id' | 'return_id') => [...new Set(entries.map((e) => e[k]).filter(Boolean) as string[])]
  const sel = 'purchase_id, sale_id, return_id, qty, batches(products(name, name_ur, pack_size, pack_unit, companies(name)))'
  const queries = (['purchase_id', 'sale_id', 'return_id'] as const)
    .map((k) => [k, ids(k)] as const)
    .filter(([, list]) => list.length)
    .map(([k, list]) => supabase.from('stock_movements').select(sel).in(k, list).limit(5000))
  const map = new Map<string, Item[]>()
  for (const res of await Promise.all(queries)) {
    if (res.error) throw res.error
    for (const m of (res.data ?? []) as unknown as MoveRow[]) {
      const p = m.batches?.products
      const doc = m.purchase_id ?? m.sale_id ?? m.return_id
      if (!p || !doc) continue
      const list = map.get(doc) ?? []
      // FEFO can split one item over batches: merge by product
      const same = list.find((i) => i.name === p.name && i.size === Number(p.pack_size) && i.unit === p.pack_unit)
      if (same) same.qty += Math.abs(Number(m.qty))
      else list.push({ name: p.name, name_ur: p.name_ur, size: Number(p.pack_size), unit: p.pack_unit, qty: Math.abs(Number(m.qty)), company: p.companies?.name ?? null })
      map.set(doc, list)
    }
  }
  return map
}

/** Party and detail text for one roznamcha line */
export function describeCash(e: CashEntryFull, items: Map<string, Item[]>, t: TFn, lang: Lang, pick: (en: string, ur?: string | null) => string) {
  const list = items.get(e.purchase_id ?? e.sale_id ?? e.return_id ?? '') ?? []
  const itemsText = list.length
    ? list.slice(0, 2).map((i) => `${pick(i.name, i.name_ur)} ${fmtPack(i.size, i.unit, lang)} × ${fmtNum(i.qty, 3)}`).join(', ') +
      (list.length > 2 ? ` ${t('moreItems', { n: list.length - 2 })}` : '')
    : ''
  const companies = [...new Set(list.map((i) => i.company).filter(Boolean) as string[])]
  const companyText = companies.slice(0, 3).join(', ') + (companies.length > 3 ? ` ${t('moreItems', { n: companies.length - 3 })}` : '')
  const partial = (paid: number, total: number) =>
    Number(paid) < Number(total) ? t('paidOf', { paid: fmtMoney(paid, lang), total: fmtMoney(total, lang) }) : ''
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ')

  if (e.purchases) {
    const p = e.purchases
    return {
      party: e.parties?.name ?? p.supplier_name ?? companyText,
      detail: join(t('purchaseNo', { n: p.purchase_no }), p.reference ? t('billRef', { ref: p.reference }) : '', itemsText, partial(p.paid, p.total)),
    }
  }
  if (e.sales) {
    const s = e.sales
    return {
      party: e.parties?.name ?? s.customer_name ?? t('walkIn'),
      detail: join(`${t('invoiceNum')} ${s.invoice_no}`, itemsText, partial(s.paid, s.total)),
    }
  }
  if (e.sale_returns) {
    const r = e.sale_returns
    return {
      party: e.parties?.name ?? r.sales?.customer_name ?? t('walkIn'),
      detail: join(r.sales ? t('returnFromInvoice', { n: r.sales.invoice_no }) : '', itemsText),
    }
  }
  return { party: e.parties?.name ?? '', detail: e.note ?? '' }
}
