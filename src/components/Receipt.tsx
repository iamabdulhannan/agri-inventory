import { Plus, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOrg } from '../lib/app'
import { cx } from '../lib/cx'
import { useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import { usePackLabel } from '../lib/packLabel'
import { supabase } from '../lib/supabase'
import type { PackType, PackUnit, Sale } from '../lib/types'
import { fmtNum, unitLabel } from '../lib/units'
import { Button, ErrorBox, Loading, Modal } from './ui'

type Paper = '80mm' | 'a4'
const PAPER_KEY = 'agri.receiptPaper'

interface Line {
  key: string
  name: string
  name_ur: string | null
  pack: { pack_size: number; pack_unit: PackUnit; pack_type: PackType }
  qty: number
  rate: number
  amount: number
  /** bag sold loose: qty in kg, rate per kg */
  loose: boolean
}
/** sale row with the money columns of migration 013 (missing before it runs) */
type SaleRow = Sale & { markup?: number | null; advance_used?: number | null; advance_id?: string | null; due_date?: string | null }
interface ReceiptData {
  sale: SaleRow
  lines: Line[]
  party: { name: string; phone: string | null; balance: number } | null
  /** crop advance the bill was (partly) paid from, e.g. "Potato 2026" */
  advance: string | null
  /** bank account / wallet the money was received into (null = cash) */
  account: string | null
}

async function loadReceipt(saleId: string): Promise<ReceiptData> {
  const [{ data: sale, error: e1 }, { data: moves, error: e2 }] = await Promise.all([
    supabase.from('sales').select('*').eq('id', saleId).single(),
    supabase
      .from('stock_movements')
      .select('qty, unit_price, loose, batches(products(id, name, name_ur, pack_size, pack_unit, pack_type))')
      .eq('sale_id', saleId)
      .order('created_at'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  // FEFO may split one item over several batches: merge them back per product + rate
  const map = new Map<string, Line>()
  type Row = { qty: number; unit_price: number; loose?: boolean; batches: { products: { id: string; name: string; name_ur: string | null; pack_size: number; pack_unit: PackUnit; pack_type: PackType } } }
  for (const m of (moves ?? []) as unknown as Row[]) {
    const p = m.batches.products
    const loose = !!m.loose
    const key = `${p.id}|${m.unit_price}|${loose}`
    const packs = -Number(m.qty)
    const amount = packs * Number(m.unit_price)
    // loose bags are shown in kg with a per-kg rate
    const size = Number(p.pack_size) || 1
    const qty = loose ? packs * size : packs
    const cur = map.get(key)
    if (cur) {
      cur.qty += qty
      cur.amount += amount
    } else {
      map.set(key, { key, name: p.name, name_ur: p.name_ur, pack: { pack_size: size, pack_unit: p.pack_unit, pack_type: p.pack_type }, qty, rate: loose ? Number(m.unit_price) / size : Number(m.unit_price), amount, loose })
    }
  }
  const s = sale as SaleRow
  const [partyRes, advRes, cashRes] = await Promise.all([
    s.party_id ? supabase.from('party_balances').select('name, phone, balance').eq('id', s.party_id).single() : null,
    s.advance_id && Number(s.advance_used) > 0 ? supabase.from('crop_advances').select('crop, season').eq('id', s.advance_id).maybeSingle() : null,
    Number(s.paid) > 0 ? supabase.from('cash_entries').select('account_id').eq('sale_id', saleId).eq('kind', 'sale').not('account_id', 'is', null).limit(1) : null,
  ])
  let party: ReceiptData['party'] = null
  if (partyRes?.data) party = { ...partyRes.data, balance: Number(partyRes.data.balance) }
  // extras are best effort: the receipt still prints if they cannot be read
  const a = advRes?.data as { crop: string; season: string | null } | null | undefined
  const advance = Number(s.advance_used) > 0 ? (a ? [a.crop, a.season].filter(Boolean).join(' ') : '') : null
  let account: string | null = null
  const accId = (cashRes?.data as { account_id: string | null }[] | null | undefined)?.[0]?.account_id
  if (accId) {
    const { data: acc } = await supabase.from('money_accounts').select('name').eq('id', accId).maybeSingle()
    account = (acc as { name: string } | null)?.name ?? null
  }
  return { sale: s, lines: [...map.values()], party, advance, account }
}

/** The printable receipt itself (used for preview and for printing) */
function ReceiptView({ data, paper }: { data: ReceiptData; paper: Paper }) {
  const { t, lang, pick } = useI18n()
  const { org } = useOrg()
  const label = usePackLabel()
  const { sale, lines, party, advance, account } = data
  const markup = Number(sale.markup) || 0
  const advUsed = Number(sale.advance_used) || 0
  const due = Math.round((Number(sale.total) - Number(sale.paid) - advUsed) * 100) / 100
  const time = new Date(sale.created_at).toLocaleTimeString(lang === 'ur' ? 'ur-PK' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const row = 'flex justify-between gap-3'
  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className={cx('receipt mx-auto bg-white text-black', paper === '80mm' ? 'w-[72mm] text-[11.5px] leading-snug' : 'w-full max-w-[180mm] text-[13px]')}
      style={{ fontFamily: lang === 'ur' ? 'Inter, "Noto Nastaliq Urdu", sans-serif' : 'Inter, sans-serif' }}
    >
      <div className="text-center">
        <div className={cx('font-bold', paper === '80mm' ? 'text-base' : 'text-xl')}>{org.name}</div>
        {org.address && <div>{org.address}</div>}
        {org.phone && <div dir="ltr">{org.phone}</div>}
        {org.ntn && <div className="num">{t('ntn')}: {org.ntn}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className={row}>
        <span>{t('invoiceNum')} <b className="num">{sale.invoice_no}</b></span>
        <span className="num">{fmtDate(sale.sale_date, lang)} {time}</span>
      </div>
      <div>
        {t('customer')}: <b>{party?.name ?? sale.customer_name ?? t('walkIn')}</b>
        {party?.phone && <span className="num"> · {party.phone}</span>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-start">
            <th className="py-0.5 text-start font-semibold">{t('item')}</th>
            <th className="whitespace-nowrap py-0.5 ps-3 text-end font-semibold">{t('qty')}</th>
            <th className="whitespace-nowrap py-0.5 ps-3 text-end font-semibold">{t('rate')}</th>
            <th className="whitespace-nowrap py-0.5 ps-3 text-end font-semibold">{t('amount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="align-top">
              <td className="py-0.5 pe-1">
                {pick(l.name, l.name_ur)}
                <div className="num text-[0.85em]">{label(l.pack)}</div>
              </td>
              <td className="num whitespace-nowrap py-0.5 ps-3 text-end">{fmtNum(l.qty, 3)}{l.loose && ` ${unitLabel('kg', lang)}`}</td>
              <td className="num whitespace-nowrap py-0.5 ps-3 text-end">{fmtNum(l.rate)}</td>
              <td className="num whitespace-nowrap py-0.5 ps-3 text-end">{fmtNum(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="num space-y-0.5">
        <div className={row}><span>{t('subtotal')}</span><span>{fmtMoney(sale.subtotal, lang)}</span></div>
        {Number(sale.discount) > 0 && <div className={row}><span>{t('discount')}</span><span>- {fmtMoney(sale.discount, lang)}</span></div>}
        {markup > 0 && <div className={row}><span>{t('saleMarkup')}</span><span>+ {fmtMoney(markup, lang)}</span></div>}
        <div className={cx(row, 'text-[1.15em] font-bold')}><span>{t('grandTotal')}</span><span>{fmtMoney(sale.total, lang)}</span></div>
        {advUsed > 0 && (
          <div className={row}>
            <span className="min-w-0">{t('salePaidFromAdvance')}{advance ? ` (${advance})` : ''}</span>
            <span className="shrink-0">{fmtMoney(advUsed, lang)}</span>
          </div>
        )}
        <div className={row}>
          <span className="min-w-0">{t('received')}{account && Number(sale.paid) > 0 ? ` (${account})` : ''}</span>
          <span className="shrink-0">{fmtMoney(sale.paid, lang)}</span>
        </div>
        {due > 0 && <div className={cx(row, 'font-semibold')}><span>{t('balanceDue')}</span><span>{fmtMoney(due, lang)}</span></div>}
        {due > 0 && sale.due_date && <div className={cx(row, 'font-semibold')}><span>{t('salePayBy')}</span><span>{fmtDate(sale.due_date, lang)}</span></div>}
        {party && <div className={cx(row, 'border-t border-black pt-0.5 font-semibold')}><span>{t('khataAccount')} {t('balance')}</span><span>{fmtMoney(party.balance, lang)}</span></div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {sale.created_by_name && <div className="text-center">{t('servedBy')}: {sale.created_by_name}</div>}
      <div className="mt-1 text-center font-semibold">{t('thankYou')}</div>
    </div>
  )
}

/** Preview + print a sale receipt */
export function ReceiptModal({ saleId, onClose, onNewSale }: { saleId: string | null; onClose: () => void; onNewSale?: () => void }) {
  const { t } = useI18n()
  const [paper, setPaper] = useState<Paper>(() => {
    try {
      return localStorage.getItem(PAPER_KEY) === 'a4' ? 'a4' : '80mm'
    } catch {
      return '80mm'
    }
  })
  const [printing, setPrinting] = useState(false)
  const { data, error, loading } = useLoad(() => (saleId ? loadReceipt(saleId) : Promise.resolve(null)), [saleId])

  const choosePaper = (p: Paper) => {
    setPaper(p)
    try {
      localStorage.setItem(PAPER_KEY, p)
    } catch {
      /* ignore */
    }
  }

  // print only the receipt: hide the app, show the print area, set the page size
  useEffect(() => {
    if (!printing) return
    const html = document.documentElement
    const style = document.createElement('style')
    style.textContent = paper === '80mm' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4; margin: 12mm; }'
    document.head.appendChild(style)
    html.classList.add('printing-receipt')
    const done = () => {
      html.classList.remove('printing-receipt')
      style.remove()
      setPrinting(false)
    }
    window.addEventListener('afterprint', done, { once: true })
    const id = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(id)
      window.removeEventListener('afterprint', done)
      html.classList.remove('printing-receipt')
      style.remove()
    }
  }, [printing, paper])

  return (
    <Modal
      open={!!saleId}
      onClose={onClose}
      title={t('receipt')}
      footer={
        <>
          <div className="me-auto inline-flex rounded-lg bg-stone-100 p-0.5 text-sm">
            {(['80mm', 'a4'] as const).map((p) => (
              <button key={p} type="button" onClick={() => choosePaper(p)} className={cx('rounded-md px-3 py-1 cursor-pointer', paper === p ? 'bg-surface font-medium shadow-sm' : 'text-stone-600')}>
                {p === '80mm' ? t('thermal') : t('a4')}
              </button>
            ))}
          </div>
          {onNewSale && (
            <Button variant="secondary" onClick={onNewSale}><Plus className="size-4" /> {t('newSale')}</Button>
          )}
          <Button onClick={() => setPrinting(true)} disabled={!data}><Printer className="size-4" /> {t('printReceipt')}</Button>
        </>
      }
    >
      {loading && !data ? <Loading /> : error ? <ErrorBox>{errText(error, t)}</ErrorBox> : data && (
        <div className="rounded-lg bg-stone-100 p-3">
          <div className="rounded bg-white p-3 shadow-sm">
            <ReceiptView data={data} paper={paper} />
          </div>
        </div>
      )}
      {printing && data && createPortal(<div id="print-area"><ReceiptView data={data} paper={paper} /></div>, document.body)}
    </Modal>
  )
}
