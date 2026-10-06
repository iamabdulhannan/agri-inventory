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
interface ReceiptData {
  sale: Sale
  lines: Line[]
  party: { name: string; phone: string | null; balance: number } | null
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
  let party: ReceiptData['party'] = null
  if (sale.party_id) {
    const { data } = await supabase.from('party_balances').select('name, phone, balance').eq('id', sale.party_id).single()
    if (data) party = { ...data, balance: Number(data.balance) }
  }
  return { sale: sale as Sale, lines: [...map.values()], party }
}

/** The printable receipt itself (used for preview and for printing) */
function ReceiptView({ data, paper }: { data: ReceiptData; paper: Paper }) {
  const { t, lang, pick } = useI18n()
  const { org } = useOrg()
  const label = usePackLabel()
  const { sale, lines, party } = data
  const due = Number(sale.total) - Number(sale.paid)
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
            <th className="py-0.5 text-end font-semibold">{t('qty')}</th>
            <th className="py-0.5 text-end font-semibold">{t('rate')}</th>
            <th className="py-0.5 text-end font-semibold">{t('amount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="align-top">
              <td className="py-0.5 pe-1">
                {pick(l.name, l.name_ur)}
                <div className="num text-[0.85em]">{label(l.pack)}</div>
              </td>
              <td className="num py-0.5 text-end whitespace-nowrap">{fmtNum(l.qty, 3)}{l.loose && ` ${unitLabel('kg', lang)}`}</td>
              <td className="num py-0.5 text-end">{fmtNum(l.rate)}</td>
              <td className="num py-0.5 text-end">{fmtNum(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="num space-y-0.5">
        <div className={row}><span>{t('subtotal')}</span><span>{fmtMoney(sale.subtotal, lang)}</span></div>
        {Number(sale.discount) > 0 && <div className={row}><span>{t('discount')}</span><span>- {fmtMoney(sale.discount, lang)}</span></div>}
        <div className={cx(row, 'text-[1.15em] font-bold')}><span>{t('grandTotal')}</span><span>{fmtMoney(sale.total, lang)}</span></div>
        <div className={row}><span>{t('received')}</span><span>{fmtMoney(sale.paid, lang)}</span></div>
        {due > 0 && <div className={cx(row, 'font-semibold')}><span>{t('balanceDue')}</span><span>{fmtMoney(due, lang)}</span></div>}
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
