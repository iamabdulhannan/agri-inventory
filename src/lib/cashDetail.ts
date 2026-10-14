import type { Lang, TFn } from './i18n'
import { fmtMoney } from './money'
import { supabase } from './supabase'
import type { CashEntry, CashKind, PackUnit } from './types'
import { fmtNum, fmtPack } from './units'

export type PayMethod = 'cash' | 'bank' | 'cheque' | 'wallet'

/** cash_entries row with the documents it belongs to */
export type CashEntryFull = CashEntry & {
  return_id?: string | null
  /** null = cash in hand */
  account_id?: string | null
  method?: PayMethod | null
  transfer_id?: string | null
  facility_id?: string | null
  advance_id?: string | null
  cheque_id?: string | null
  /** investor capital in / profit or capital paid out */
  investor_id?: string | null
  cheques?: { cheque_no: string | null; bank_name: string | null } | null
  purchases?: { purchase_no: number; supplier_name: string | null; reference: string | null; total: number; paid: number } | null
  sales?: { invoice_no: number; customer_name: string | null; total: number; paid: number } | null
  sale_returns?: { total: number; refund: number; sales: { invoice_no: number; customer_name: string | null } | null } | null
}

export const CASH_SELECT =
  '*, parties(name), purchases(purchase_no, supplier_name, reference, total, paid), sales(invoice_no, customer_name, total, paid), sale_returns(total, refund, sales(invoice_no, customer_name)), cheques(cheque_no, bank_name)'

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'stone' | 'orange'
const TONE: Record<CashKind, Tone> = {
  sale: 'green', receipt: 'green', cash_in: 'blue', purchase: 'orange', payment: 'orange', expense: 'red', cash_out: 'stone',
}
const MANUAL: CashKind[] = ['expense', 'cash_in', 'cash_out']

/** Type label + badge colour of a roznamcha line (transfers, crop advances and bank repayments get their own) */
export function cashType(e: CashEntryFull, t: TFn): { label: string; tone: Tone } {
  if (e.transfer_id) return { label: t('bankRzTransfer'), tone: 'blue' }
  if (e.advance_id) return e.amount >= 0 ? { label: t('bankRzAdvance'), tone: 'blue' } : { label: t('bankRzAdvanceRefund'), tone: 'stone' }
  if (e.facility_id) return e.kind === 'expense' ? { label: t('bankRzMarkup'), tone: 'red' } : { label: t('bankRzRepayment'), tone: 'orange' }
  if (e.investor_id) return e.amount >= 0 ? { label: t('invRzIn'), tone: 'blue' } : { label: t('invRzOut'), tone: 'stone' }
  return { label: t(`ck_${e.kind}`), tone: TONE[e.kind] }
}

/** Made by another screen (sale, purchase, return, cheque, crop advance, bank): changed there, not in the roznamcha */
export const isLinkedCash = (e: CashEntryFull) =>
  !!(e.sale_id || e.purchase_id || e.return_id || e.advance_id || e.facility_id || e.cheque_id || e.investor_id)

/** Lines the roznamcha may delete: own manual lines and transfers (both sides go together) */
export const canDeleteCash = (e: CashEntryFull) => !isLinkedCash(e) && (!!e.transfer_id || MANUAL.includes(e.kind))

/** The other side of each transfer: entry id -> account id of the other side (null = cash in hand) */
export async function loadTransferPeers(entries: CashEntryFull[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(entries.map((e) => e.transfer_id).filter(Boolean) as string[])]
  const map = new Map<string, string | null>()
  if (!ids.length) return map
  const { data, error } = await supabase.from('cash_entries').select('id, transfer_id, account_id').in('transfer_id', ids).limit(5000)
  if (error) throw error
  const rows = (data ?? []) as { id: string; transfer_id: string; account_id: string | null }[]
  for (const e of entries) {
    if (!e.transfer_id) continue
    const other = rows.find((r) => r.transfer_id === e.transfer_id && r.id !== e.id)
    if (other) map.set(e.id, other.account_id)
  }
  return map
}

/** System notes are saved in English ("Bank repayment · HBL · ..."): drop the English label, the type badge says it */
const SYSTEM_NOTE = /^(Crop advance|Advance refund|Bank repayment|Bank markup|Investment|Investor profit paid|Investor capital returned)( · |$)/
const cleanNote = (note: string | null) => (note ?? '').replace(SYSTEM_NOTE, '')

export interface CashCtx {
  /** entry id -> account of the other side of its transfer */
  peers: Map<string, string | null>
  /** account name; null = cash in hand */
  accountName: (id: string | null) => string
}

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
export function describeCash(e: CashEntryFull, items: Map<string, Item[]>, t: TFn, lang: Lang, pick: (en: string, ur?: string | null) => string, ctx?: CashCtx) {
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
  if (e.transfer_id) {
    const peer = ctx?.peers.get(e.id)
    const name = peer === undefined ? '' : ctx?.accountName(peer) ?? ''
    const out = e.amount < 0
    const here = !e.account_id
    const text = !name ? ''
      : out ? (here && peer ? t('bankRzDepositTo', { name }) : t('bankRzTo', { name }))
        : (here && peer ? t('bankRzWithdrawFrom', { name }) : t('bankRzFrom', { name }))
    return { party: '', detail: join(text, e.note ?? '') }
  }
  if (e.cheque_id || e.method === 'cheque') {
    const c = e.cheques
    return {
      party: e.parties?.name ?? '',
      detail: c ? join(c.cheque_no ? t('bankRzChequeNo', { no: c.cheque_no }) : t('bankRzCheque'), c.bank_name ?? '') : e.note ?? '',
    }
  }
  if (e.investor_id) {
    // note: "Investment · <investor> · <note>" / "Investor profit paid · ..." / "Investor capital returned · ..."
    const [label, name, ...rest] = (e.note ?? '').split(' · ')
    const what = label === 'Investor profit paid' ? t('invRzProfit') : label === 'Investor capital returned' ? t('invRzCapital') : ''
    return { party: name ?? '', detail: join(what, rest.join(' · ')) }
  }
  return { party: e.parties?.name ?? '', detail: cleanNote(e.note) }
}
