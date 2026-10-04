import { ArrowDownToLine, Check, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductPicker } from '../components/domain'
import { ProductForm } from '../components/ProductForm'
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, useFeedback } from '../components/ui'
import { cx } from '../lib/cx'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { daysBetween, fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { BatchStock, MovementType } from '../lib/types'
import { fmtTotal } from '../lib/units'

interface Line {
  key: number
  product_id: string
  batch_no: string
  mfg_date: string
  expiry_date: string
  qty: string
}
let seq = 1
const blank = (product_id = ''): Line => ({ key: seq++, product_id, batch_no: '', mfg_date: '', expiry_date: '', qty: '' })

export function StockIn() {
  const { t, lang } = useI18n()
  const { org, today, refresh, version } = useOrg()
  const { toast } = useFeedback()
  const [params] = useSearchParams()

  const { data, loading, error, reload } = useLoad(async () => {
    const [catalog, batches] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<BatchStock>((a, b) => supabase.from('batch_stock').select('*').eq('org_id', org.id).order('expiry_date').range(a, b)),
    ])
    return { catalog, batches }
  }, [org.id, version])

  const [date, setDate] = useState(today)
  const [type, setType] = useState<MovementType>('purchase')
  const [party, setParty] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [blank(params.get('product') ?? '')])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newFor, setNewFor] = useState<number | null>(null)

  useEffect(() => setDate(today), [today])

  const batchesByProduct = useMemo(() => {
    const m = new Map<string, BatchStock[]>()
    for (const b of data?.batches ?? []) m.set(b.product_id, [...(m.get(b.product_id) ?? []), b])
    return m
  }, [data])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null
  const { catalog } = data

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const save = async () => {
    setErr('')
    for (const l of lines) {
      if (!l.product_id) return setErr(t('errChooseProduct'))
      if (!l.expiry_date) return setErr(t('errExpiryRequired'))
      if (!(Number(l.qty) > 0)) return setErr(t('errQty'))
      if (l.mfg_date && l.mfg_date > l.expiry_date) return setErr(`${t('mfgDate')} > ${t('expiryDate')}`)
    }
    setBusy(true)
    const { data: n, error } = await supabase.rpc('record_stock_in', {
      p_org: org.id,
      p_date: date,
      p_type: type,
      p_lines: lines.map((l) => ({
        product_id: l.product_id,
        batch_no: l.batch_no.trim() || null,
        mfg_date: l.mfg_date || null,
        expiry_date: l.expiry_date,
        qty: Number(l.qty),
      })),
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
      <PageHeader title={<span className="flex items-center gap-2"><ArrowDownToLine className="size-6 text-brand-700" /> {t('stockInTitle')}</span>} />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('entryType')}>
            <Select value={type} onChange={(e) => setType(e.target.value as MovementType)}>
              <option value="purchase">{t('mv_purchase')}</option>
              <option value="return_in">{t('mv_return_in')}</option>
            </Select>
          </Field>
          <Field label={t('date')}>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={type === 'purchase' ? t('supplier') : t('customer')}>
            <Input value={party} onChange={(e) => setParty(e.target.value)} />
          </Field>
          <Field label={t('invoiceNo')}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {lines.map((l, i) => {
          const p = catalog.byId.get(l.product_id)
          const existing = (batchesByProduct.get(l.product_id) ?? []).slice(-8)
          const known = existing.find((b) => b.batch_no.toLowerCase() === l.batch_no.trim().toLowerCase())
          const expLeft = l.expiry_date ? daysBetween(today, l.expiry_date) : null
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
              <ProductPicker products={catalog.products} value={l.product_id} onChange={(id) => set(l.key, { product_id: id, batch_no: '', expiry_date: '', mfg_date: '' })} onCreate={() => setNewFor(l.key)} />

              {existing.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-stone-500">{t('existingBatches')}:</span>
                  {existing.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => set(l.key, { batch_no: b.batch_no, expiry_date: b.expiry_date, mfg_date: b.mfg_date ?? '' })}
                      className={cx('num rounded-full px-2.5 py-1 ring-1 cursor-pointer', known?.id === b.id ? 'bg-primary text-white ring-primary' : 'bg-stone-50 ring-stone-200 hover:ring-brand-600')}
                    >
                      {b.batch_no} · {fmtDate(b.expiry_date, lang)}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t('batchNo')} hint={t('batchNoHint')}>
                  <Input
                    value={l.batch_no}
                    onChange={(e) => {
                      const v = e.target.value
                      const match = existing.find((b) => b.batch_no.toLowerCase() === v.trim().toLowerCase())
                      set(l.key, match ? { batch_no: v, expiry_date: match.expiry_date, mfg_date: match.mfg_date ?? '' } : { batch_no: v })
                    }}
                  />
                </Field>
                <Field label={t('mfgDate')} hint={t('optional')}>
                  <Input type="date" value={l.mfg_date} onChange={(e) => set(l.key, { mfg_date: e.target.value })} disabled={!!known} />
                </Field>
                <Field
                  label={t('expiryDate')}
                  required
                  error={expLeft !== null && expLeft < 0 ? t('expiredAgo', { n: -expLeft }) : undefined}
                  hint={expLeft !== null && expLeft <= org.expiry_alert_days ? <span className="text-amber-700">{t('daysLeft', { n: expLeft })}</span> : undefined}
                >
                  <Input type="date" value={l.expiry_date} onChange={(e) => set(l.key, { expiry_date: e.target.value })} disabled={!!known} required />
                </Field>
                <Field label={`${t('qtyPacks')}${p ? ` (${t(`pt_${p.pack_type}`)})` : ''}`} required hint={p && Number(l.qty) > 0 && p.pack_unit !== 'pcs' ? `= ${fmtTotal(Number(l.qty), p.pack_size, p.pack_unit, lang)}` : undefined}>
                  <Input type="number" min="0" step="any" inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} />
                </Field>
              </div>
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
        <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={save} loading={busy}>
          <Check className="size-5" /> {t('saveStock')} ({t('totalItems', { n: lines.length })})
        </Button>
      </Card>

      <ProductForm
        open={newFor !== null}
        onClose={() => setNewFor(null)}
        catalog={catalog}
        onSaved={async (ids) => {
          const key = newFor
          setNewFor(null)
          refresh()
          if (key !== null && ids[0]) set(key, { product_id: ids[0] })
          if (ids.length > 1) setLines((ls) => [...ls, ...ids.slice(1).map((id) => blank(id))])
          toast(ids.length > 1 ? t('productsSaved', { n: ids.length }) : t('productSaved'))
        }}
      />
    </div>
  )
}
