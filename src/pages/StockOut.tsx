import { ArrowUpFromLine, Check, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductPicker } from '../components/domain'
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { daysBetween, fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { OUT_TYPES, type BatchStock, type MovementType } from '../lib/types'
import { fmtNum, fmtTotal } from '../lib/units'

interface Line {
  key: number
  product_id: string
  batch_id: string // '' = automatic FEFO
  qty: string
}
let seq = 1
const blank = (product_id = '', batch_id = '', qty = ''): Line => ({ key: seq++, product_id, batch_id, qty })

export function StockOut() {
  const { t, lang } = useI18n()
  const { org, today, refresh, version } = useOrg()
  const { toast } = useFeedback()
  const [params] = useSearchParams()
  const initialType = (OUT_TYPES as string[]).includes(params.get('type') ?? '') ? (params.get('type') as MovementType) : 'sale'

  const { data, loading, error, reload } = useLoad(async () => {
    const [catalog, batches] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<BatchStock>((a, b) => supabase.from('batch_stock').select('*').eq('org_id', org.id).gt('qty', 0).order('expiry_date').order('created_at').range(a, b)),
    ])
    return { catalog, batches: batches.map((b) => ({ ...b, qty: Number(b.qty) })) }
  }, [org.id, version])

  const [date, setDate] = useState(today)
  const [type, setType] = useState<MovementType>(initialType)
  const [party, setParty] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [blank(params.get('product') ?? '', params.get('batch') ?? '', params.get('qty') ?? '')])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => setDate(today), [today])

  const byProduct = useMemo(() => {
    const m = new Map<string, BatchStock[]>()
    for (const b of data?.batches ?? []) m.set(b.product_id, [...(m.get(b.product_id) ?? []), b])
    return m
  }, [data])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null
  const { catalog } = data

  /** batches this entry type may take from (sales never use expired stock) */
  const eligible = (productId: string) => (byProduct.get(productId) ?? []).filter((b) => type !== 'sale' || b.expiry_date >= date)
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const save = async () => {
    setErr('')
    for (const l of lines) {
      if (!l.product_id) return setErr(t('errChooseProduct'))
      if (!(Number(l.qty) > 0)) return setErr(t('errQty'))
    }
    setBusy(true)
    const { data: n, error } = await supabase.rpc('record_stock_out', {
      p_org: org.id,
      p_date: date,
      p_type: type,
      p_lines: lines.map((l) => ({ product_id: l.product_id, batch_id: l.batch_id || null, qty: Number(l.qty) })),
      p_party: party || null,
      p_reference: reference || null,
      p_note: note || null,
    })
    setBusy(false)
    if (error) return setErr(errText(error, t))
    toast(t('stockSaved', { n: n as number }))
    setLines([blank()])
    setParty('')
    setReference('')
    setNote('')
    refresh()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={<span className="flex items-center gap-2"><ArrowUpFromLine className="size-6 text-orange-500" /> {t('stockOutTitle')}</span>} />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('entryType')}>
            <Select value={type} onChange={(e) => setType(e.target.value as MovementType)}>
              {OUT_TYPES.map((x) => (
                <option key={x} value={x}>{t(`mv_${x}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('date')}>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={type === 'sale' ? t('customer') : type === 'return_out' ? t('supplier') : t('party')} hint={t('optional')}>
            <Input value={party} onChange={(e) => setParty(e.target.value)} />
          </Field>
          <Field label={t('invoiceNo')} hint={t('optional')}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {lines.map((l, i) => {
          const p = catalog.byId.get(l.product_id)
          const options = eligible(l.product_id)
          const chosen = options.find((b) => b.id === l.batch_id)
          const available = chosen ? chosen.qty : options.reduce((s, b) => s + b.qty, 0)
          const qty = Number(l.qty)
          const over = qty > available
          // preview which batches will be used (earliest expiry first)
          const plan: { b: BatchStock; take: number }[] = []
          if (qty > 0 && !over) {
            let need = qty
            for (const b of chosen ? [chosen] : options) {
              if (need <= 0) break
              const take = Math.min(need, b.qty)
              plan.push({ b, take })
              need -= take
            }
          }
          return (
            <Card key={l.key} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-500">{t('item')} {i + 1}</span>
                {lines.length > 1 && (
                  <button className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600 cursor-pointer" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t('remove')}>
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <ProductPicker products={catalog.products.filter((x) => x.qty > 0 || x.id === l.product_id)} value={l.product_id} onChange={(id) => set(l.key, { product_id: id, batch_id: '' })} />

              {p && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <Field label={t('batch')}>
                    <Select value={l.batch_id} onChange={(e) => set(l.key, { batch_id: e.target.value })}>
                      <option value="">{t('batchAuto')}</option>
                      {options.map((b) => {
                        const left = daysBetween(today, b.expiry_date)
                        return (
                          <option key={b.id} value={b.id}>
                            {b.batch_no} · {fmtDate(b.expiry_date, lang)} · {fmtNum(b.qty)} {t(`pt_${p.pack_type}`)}
                            {left < 0 ? ` · ${t('expired')}` : left <= org.expiry_alert_days ? ` · ${t('daysLeft', { n: left })}` : ''}
                          </option>
                        )
                      })}
                    </Select>
                  </Field>
                  <Field
                    label={`${t('qtyPacks')} (${t(`pt_${p.pack_type}`)})`}
                    required
                    error={over ? `${t('exceeds')} (${fmtNum(available)})` : undefined}
                    hint={`${t('available')}: ${fmtNum(available)}${p.pack_unit !== 'pcs' ? ` = ${fmtTotal(available, p.pack_size, p.pack_unit, lang)}` : ''}`}
                  >
                    <Input type="number" min="0" step="any" inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} />
                  </Field>
                </div>
              )}
              {p && plan.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
                  <span>→</span>
                  {plan.map(({ b, take }) => (
                    <span key={b.id} className="num rounded-full bg-stone-100 px-2 py-0.5">
                      {b.batch_no}: {fmtNum(take)} ({fmtDate(b.expiry_date, lang)})
                    </span>
                  ))}
                  {p.pack_unit !== 'pcs' && <span className="num font-medium">= {fmtTotal(qty, p.pack_size, p.pack_unit, lang)}</span>}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="mt-3">
        <Button variant="secondary" onClick={() => setLines((ls) => [...ls, blank()])}>
          <Plus className="size-4" /> {t('addLine')}
        </Button>
      </div>

      <Card className="mt-4 p-4">
        <Field label={t('note')} hint={t('optional')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
        <Button size="lg" variant="warning" className="mt-4 w-full sm:w-auto" onClick={save} loading={busy}>
          <Check className="size-5" /> {t('saveStock')} ({t('totalItems', { n: lines.length })})
        </Button>
      </Card>
    </div>
  )
}
