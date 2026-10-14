import { useEffect, useState } from 'react'
import { useOrg } from '../lib/app'
import { cx } from '../lib/cx'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { perKg, perPack } from '../lib/loose'
import { fmtMoney, r2 } from '../lib/money'
import { usePackLabel } from '../lib/packLabel'
import { supabase } from '../lib/supabase'
import type { PackType, PackUnit } from '../lib/types'
import { fmtNum, unitLabel } from '../lib/units'
import { Button, ErrorBox, Field, Input, Loading, Modal, useFeedback } from './ui'

interface Group {
  key: string
  product_id: string
  name: string
  name_ur: string | null
  pack: { pack_size: number; pack_unit: PackUnit; pack_type: PackType }
  loose: boolean
  packs: number
  rate: string // as shown: per pack, or per kg for loose bags
  oldRate: number
}
interface Loaded {
  invoice_no: number
  sale_date: string
  party: string | null
  khata: boolean
  total: number
  discount: number
  markup: number
  returned: boolean
  groups: Group[]
}

/** Fix wrong rates (and discount / markup) on a saved invoice. Owner / admin. */
export function CorrectRates({ saleId, onClose, onSaved }: { saleId: string | null; onClose: () => void; onSaved: (saleId: string) => void }) {
  const { t, lang, pick } = useI18n()
  const { org } = useOrg()
  const { toast, confirm } = useFeedback()
  const label = usePackLabel()
  const [data, setData] = useState<Loaded | null>(null)
  const [discount, setDiscount] = useState('')
  const [markup, setMarkup] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!saleId) return
    setData(null)
    setErr('')
    ;(async () => {
      const [s, m, r] = await Promise.all([
        supabase.from('sales').select('*, parties(name)').eq('id', saleId).single(),
        supabase.from('stock_movements').select('qty, unit_price, loose, batches(products(id, name, name_ur, pack_size, pack_unit, pack_type))').eq('sale_id', saleId).order('created_at'),
        supabase.from('sale_returns').select('id', { count: 'exact', head: true }).eq('sale_id', saleId),
      ])
      if (s.error || m.error) return setErr(errText(s.error ?? m.error, t))
      type Row = { qty: number; unit_price: number; loose?: boolean; batches: { products: { id: string; name: string; name_ur: string | null; pack_size: number; pack_unit: PackUnit; pack_type: PackType } } }
      const map = new Map<string, Group>()
      for (const x of (m.data ?? []) as unknown as Row[]) {
        const p = x.batches.products
        const loose = !!x.loose
        const key = `${p.id}|${loose}`
        const g = map.get(key)
        if (g) g.packs += -Number(x.qty)
        else {
          const size = Number(p.pack_size) || 1
          const rate = Number(x.unit_price)
          map.set(key, {
            key, product_id: p.id, name: p.name, name_ur: p.name_ur, pack: { pack_size: size, pack_unit: p.pack_unit, pack_type: p.pack_type },
            loose, packs: -Number(x.qty), oldRate: loose ? perKg(rate, size) : rate, rate: String(loose ? perKg(rate, size) : rate),
          })
        }
      }
      const sale = s.data
      setData({
        invoice_no: sale.invoice_no, sale_date: sale.sale_date, party: sale.parties?.name ?? sale.customer_name ?? null, khata: !!sale.party_id,
        total: Number(sale.total), discount: Number(sale.discount), markup: Number(sale.markup ?? 0), returned: (r.count ?? 0) > 0, groups: [...map.values()],
      })
      setDiscount(Number(sale.discount) ? String(Number(sale.discount)) : '')
      setMarkup(Number(sale.markup ?? 0) ? String(Number(sale.markup)) : '')
    })()
  }, [saleId, t])

  const setRate = (key: string, rate: string) => setData((d) => d && { ...d, groups: d.groups.map((g) => (g.key === key ? { ...g, rate } : g)) })
  const packRate = (g: Group) => (g.loose ? perPack(Number(g.rate) || 0, g.pack.pack_size) : Number(g.rate) || 0)
  const sub = data ? r2(data.groups.reduce((s, g) => s + r2(g.packs * packRate(g)), 0)) : 0
  const disc = Number(discount) || 0
  const mark = Number(markup) || 0
  const total = r2(sub - disc + mark)
  const diff = data ? r2(total - data.total) : 0
  const m = (v: number) => fmtMoney(v, lang)

  const save = async () => {
    if (!data || !saleId) return
    setErr('')
    if (data.groups.some((g) => g.rate === '' || !(Number(g.rate) >= 0))) return setErr(t('errInvalidPrice'))
    if (disc < 0 || disc > sub) return setErr(t('errInvalidDiscount'))
    if (!(await confirm(t('crConfirm', { n: data.invoice_no, from: m(data.total), to: m(total) })))) return
    setBusy(true)
    const { error } = await supabase.rpc('correct_sale_rates', {
      p_org: org.id, p_sale: saleId,
      p_lines: data.groups.map((g) => ({ product_id: g.product_id, loose: g.loose, unit_price: packRate(g) })),
      p_discount: disc, p_markup: mark,
    })
    setBusy(false)
    if (error) {
      const msg = String(error.message ?? '')
      return setErr(/correct_sale_rates|schema cache|PGRST20/.test(msg) ? t('errRunMigration', { n: '017' }) : errText(error, t))
    }
    toast(t('crSaved', { n: data.invoice_no }))
    onSaved(saleId)
  }

  return (
    <Modal
      open={!!saleId}
      onClose={onClose}
      title={data ? t('crTitle', { n: data.invoice_no }) : t('crTitleShort')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button onClick={save} loading={busy} disabled={!data || data.returned || diff === 0 && data.groups.every((g) => Number(g.rate) === g.oldRate)}>{t('save')}</Button>
      </>}
    >
      {!data ? (err ? <ErrorBox>{err}</ErrorBox> : <Loading />) : (
        <>
          <div className="mb-3 text-sm text-stone-600">
            <span className="num">{fmtDate(data.sale_date, lang)}</span> · {data.party ?? t('walkIn')}
          </div>
          {data.returned ? (
            <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">{t('errSaleHasReturns')}</div>
          ) : (
            <>
              <div className="space-y-2">
                {data.groups.map((g) => {
                  const changed = Number(g.rate) !== g.oldRate
                  const kg = unitLabel('kg', lang)
                  return (
                    <div key={g.key} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-stone-200 p-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{pick(g.name, g.name_ur)}</div>
                        <div className="num text-xs text-stone-500">
                          {label(g.pack)} · {g.loose ? `${fmtNum(g.packs * g.pack.pack_size, 3)} ${kg}` : `× ${fmtNum(g.packs, 3)}`}
                          {' · '}{t('crWas')} {m(g.oldRate)}{g.loose ? ` / ${kg}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input type="number" min="0" step="any" inputMode="decimal" value={g.rate} onChange={(e) => setRate(g.key, e.target.value)}
                          className={cx('num w-28 text-end', changed && 'border-brand-600 ring-2 ring-brand-600/20')} aria-label={t('rate')} />
                        <span className="num w-24 text-end text-sm font-semibold">{m(r2(g.packs * packRate(g)))}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t('discount')} optional><Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
                {(data.khata || data.markup > 0) && (
                  <Field label={t('saleMarkup')} optional><Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={markup} onChange={(e) => setMarkup(e.target.value)} /></Field>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">{t('crOldTotal')}</div><div className="num text-lg font-semibold">{m(data.total)}</div></div>
                <div className="rounded-lg bg-brand-50 p-3"><div className="text-xs text-stone-500">{t('crNewTotal')}</div><div className="num text-lg font-bold text-brand-800">{m(total)}</div></div>
              </div>
              {diff !== 0 && (
                <p className={cx('mt-2 rounded-lg px-3 py-2 text-sm', diff > 0 ? 'bg-amber-50 text-amber-900' : 'bg-sky-100 text-sky-800')}>
                  {data.khata
                    ? diff > 0 ? t('crKhataUp', { amount: m(diff), name: data.party ?? '' }) : t('crKhataDown', { amount: m(-diff), name: data.party ?? '' })
                    : diff > 0 ? t('crCollect', { amount: m(diff) }) : t('crGiveBack', { amount: m(-diff) })}
                </p>
              )}
              <p className="mt-2 text-xs text-stone-500">{t('crHint')}</p>
            </>
          )}
          {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
        </>
      )}
    </Modal>
  )
}
