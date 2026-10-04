import { Check, Search, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOrg } from '../lib/app'
import type { Catalog } from '../lib/catalog'
import { cx } from '../lib/cx'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney, r2 } from '../lib/money'
import { supabase } from '../lib/supabase'
import type { Sale } from '../lib/types'
import { fmtNum } from '../lib/units'
import { ProductName } from './domain'
import { Badge, Button, Card, ErrorBox, Field, Input, useFeedback, Segmented } from './ui'

interface Returnable {
  batch_id: string
  product_id: string
  batch_no: string
  expiry_date: string
  sold: number
  returned: number
  remaining: number
  rate: number
}
interface Loaded {
  sale: Sale & { parties: { name: string; phone: string | null } | null }
  lines: Returnable[]
}

/**
 * Customer return against a sale invoice: type the invoice number, the sold
 * items load with what can still be returned, choose quantities, save.
 */
export function InvoiceReturn({
  catalog, date, initialInvoice, onLoaded, onDone,
}: {
  catalog: Catalog
  date: string
  initialInvoice?: string
  /** tells the page whether an invoice is loaded (to hide manual entry) */
  onLoaded: (loaded: boolean) => void
  onDone: () => void
}) {
  const { t, lang } = useI18n()
  const { org } = useOrg()
  const { toast } = useFeedback()
  const [invoiceNo, setInvoiceNo] = useState(initialInvoice ?? '')
  const [data, setData] = useState<Loaded | null>(null)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [refund, setRefund] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async (no = invoiceNo) => {
    setError('')
    const n = Number(no)
    if (!(n > 0)) return
    setLoading(true)
    const { data: sale, error: e1 } = await supabase.from('sales').select('*, parties(name, phone)').eq('org_id', org.id).eq('invoice_no', n).maybeSingle()
    if (e1 || !sale) {
      setLoading(false)
      setData(null)
      onLoaded(false)
      return setError(e1 ? errText(e1, t) : t('invoiceNotFound', { n }))
    }
    const { data: lines, error: e2 } = await supabase.rpc('sale_returnable', { p_sale: sale.id })
    setLoading(false)
    if (e2) return setError(errText(e2, t))
    const rows = ((lines ?? []) as Returnable[]).map((l) => ({ ...l, sold: +l.sold, returned: +l.returned, remaining: +l.remaining, rate: +l.rate }))
    setData({ sale, lines: rows })
    setQty(Object.fromEntries(rows.map((l) => [l.batch_id, l.remaining > 0 ? String(l.remaining) : '0'])))
    setRefund('')
    setNote('')
    onLoaded(true)
  }

  // invoice number passed in the URL (Invoices page -> Return)
  useEffect(() => {
    if (initialInvoice) load(initialInvoice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInvoice])

  const clear = () => {
    setData(null)
    setInvoiceNo('')
    setError('')
    onLoaded(false)
  }

  if (!data) {
    return (
      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('saleInvoiceNo')} className="w-48">
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="e.g. 2"
              className="num"
            />
          </Field>
          <Button variant="secondary" onClick={() => load()} loading={loading} disabled={!invoiceNo}>
            <Search className="size-4" /> {t('loadInvoice')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-stone-500">{t('manualReturn')}</p>
        {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
      </Card>
    )
  }

  const { sale, lines } = data
  const factor = Number(sale.subtotal) > 0 ? Number(sale.total) / Number(sale.subtotal) : 1
  const value = r2(lines.reduce((s, l) => s + (Number(qty[l.batch_id]) || 0) * l.rate * factor, 0))
  const khata = !!sale.party_id
  const refundNum = khata ? (refund === '' ? 0 : Number(refund) || 0) : value
  const credit = r2(value - refundNum)
  const nothingLeft = lines.every((l) => l.remaining <= 0)
  const customer = sale.parties?.name ?? sale.customer_name ?? t('walkIn')

  const save = async () => {
    setError('')
    for (const l of lines) {
      const q = Number(qty[l.batch_id]) || 0
      if (q < 0 || q > l.remaining) return setError(`${t('errReturnTooMuch')} (${l.batch_no}: ${fmtNum(l.remaining)})`)
    }
    if (!(value > 0)) return setError(t('errQty'))
    if (refundNum < 0 || refundNum > value) return setError(t('errInvalidRefund'))
    setBusy(true)
    const { error } = await supabase.rpc('record_sale_return', {
      p_org: org.id,
      p_sale: sale.id,
      p_date: date,
      p_lines: lines.filter((l) => Number(qty[l.batch_id]) > 0).map((l) => ({ batch_id: l.batch_id, qty: Number(qty[l.batch_id]) })),
      p_refund: refundNum,
      p_note: note || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    toast(t('returnSaved', { amount: fmtMoney(value, lang) }))
    clear()
    onDone()
  }

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Undo2 className="size-5 text-brand-700" /> {t('returnFromInvoice', { n: sale.invoice_no })}
            </div>
            <div className="mt-1 text-sm text-stone-600">
              <span className="num">{fmtDate(sale.sale_date, lang)}</span> · {customer}
              {sale.parties?.phone && <span className="num"> · {sale.parties.phone}</span>} · {t('grandTotal')}{' '}
              <b className="num">{fmtMoney(sale.total, lang)}</b>
              {khata ? <Badge tone="amber" className="ms-2">{t('khataAccount')}</Badge> : <Badge className="ms-2">{t('walkIn')}</Badge>}
            </div>
            {Number(sale.discount) > 0 && <p className="mt-1 text-xs text-stone-500">{t('returnDiscountNote')}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={clear}><X className="size-4" /> {t('clearInvoice')}</Button>
        </div>
      </Card>

      <Card>
        {nothingLeft ? (
          <p className="p-4 text-sm text-stone-600">{t('nothingToReturn')}</p>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('product')}</th>
                  <th>{t('batch')}</th>
                  <th className="r">{t('sold')}</th>
                  <th className="r">{t('alreadyReturned')}</th>
                  <th className="r">{t('returnQty')}</th>
                  <th className="r">{t('rate')}</th>
                  <th className="r">{t('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const p = catalog.byId.get(l.product_id)
                  const q = Number(qty[l.batch_id]) || 0
                  const over = q > l.remaining
                  return (
                    <tr key={l.batch_id} className={cx(l.remaining <= 0 && 'opacity-50')}>
                      <td>{p ? <ProductName p={p} /> : '—'}</td>
                      <td className="num whitespace-nowrap">{l.batch_no}<div className="text-xs text-stone-500">{fmtDate(l.expiry_date, lang)}</div></td>
                      <td className="r num">{fmtNum(l.sold, 3)}</td>
                      <td className="r num text-stone-500">{l.returned ? fmtNum(l.returned, 3) : ''}</td>
                      <td className="r">
                        <Input
                          type="number"
                          min="0"
                          max={l.remaining}
                          step="any"
                          inputMode="decimal"
                          className={cx('num ms-auto h-9 w-24 text-end', over && 'border-red-500')}
                          value={qty[l.batch_id] ?? ''}
                          disabled={l.remaining <= 0}
                          onChange={(e) => setQty((s) => ({ ...s, [l.batch_id]: e.target.value }))}
                        />
                      </td>
                      <td className="r num">{fmtMoney(l.rate, lang)}</td>
                      <td className="r num font-medium">{q > 0 ? fmtMoney(r2(q * l.rate * factor), lang) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!nothingLeft && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-brand-50 p-3">
              <div className="text-sm text-stone-500">{t('returnValue')}</div>
              <div className="num text-2xl font-bold text-brand-800">{fmtMoney(value, lang)}</div>
            </div>
            {khata ? (
              <div>
                <Field label={t('refundNow')} hint={t('refundHintKhata')}>
                  <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={refund} onChange={(e) => setRefund(e.target.value)} />
                </Field>
                <Segmented
                  className="mt-2"
                  value={refundNum === 0 ? 'credit' : refundNum === value && value > 0 ? 'refund' : ''}
                  onChange={(v) => setRefund(v === 'credit' ? '0' : String(value))}
                  items={[{ value: 'credit', label: t('creditToKhata') }, { value: 'refund', label: t('refundCash'), tone: 'amber' }]}
                />
              </div>
            ) : (
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="text-sm text-stone-500">{t('refundNow')}</div>
                <div className="num text-lg font-semibold">{fmtMoney(value, lang)}</div>
                <div className="text-xs text-stone-500">{t('refundHintWalkIn')}</div>
              </div>
            )}
            {khata && (
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="text-sm text-stone-500">{t('creditToKhata')}</div>
                <div className="num text-lg font-semibold">{fmtMoney(credit, lang)}</div>
                <div className="text-xs text-stone-500">{customer}</div>
              </div>
            )}
          </div>
          <Field label={t('note')} optional className="mt-3">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
          <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={save} loading={busy} disabled={!(value > 0)}>
            <Check className="size-5" /> {t('saveReturn')} · {fmtMoney(value, lang)}
          </Button>
        </Card>
      )}
    </div>
  )
}
