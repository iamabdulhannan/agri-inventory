import { ArrowUpFromLine, Check, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductPicker } from '../components/domain'
import { PartyPicker } from '../components/PartyPicker'
import { ReceiptModal } from '../components/Receipt'
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { cx } from '../lib/cx'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { daysBetween, fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney, r2 } from '../lib/money'
import { loadParties } from '../lib/parties'
import { supabase } from '../lib/supabase'
import { OUT_TYPES, type BatchStock, type MovementType } from '../lib/types'
import { fmtNum, fmtTotal } from '../lib/units'

interface Line {
  key: number
  product_id: string
  batch_id: string // '' = automatic, earliest expiry first
  qty: string
  rate: string // sale price per pack
}
const rateOf = (n?: number | null) => (Number(n) > 0 ? String(Number(n)) : '')
let seq = 1
const blank = (product_id = '', batch_id = '', qty = '', rate = ''): Line => ({ key: seq++, product_id, batch_id, qty, rate })

export function StockOut() {
  const { t, lang } = useI18n()
  const { org, today, refresh, version } = useOrg()
  const { toast } = useFeedback()
  const [params, setParams] = useSearchParams()
  const initialType = (OUT_TYPES as string[]).includes(params.get('type') ?? '') ? (params.get('type') as MovementType) : 'sale'

  const { data, loading, error, reload } = useLoad(async () => {
    const [catalog, batches, customers] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<BatchStock>((a, b) => supabase.from('batch_stock').select('*').eq('org_id', org.id).gt('qty', 0).order('expiry_date').order('created_at').range(a, b)),
      loadParties(org.id, 'customer'),
    ])
    return { catalog, batches: batches.map((b) => ({ ...b, qty: Number(b.qty) })), customers }
  }, [org.id, version])

  const [date, setDate] = useState(today)
  const [type, setType] = useState<MovementType>(initialType)
  const [party, setParty] = useState('') // free-text name (walk-in / other types)
  const [partyId, setPartyId] = useState(params.get('party') ?? '')
  const [pendingParty, setPendingParty] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [discount, setDiscount] = useState('')
  const [received, setReceived] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [blank(params.get('product') ?? '', params.get('batch') ?? '', params.get('qty') ?? '')])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [receiptFor, setReceiptFor] = useState<string | null>(null)

  useEffect(() => setDate(today), [today])

  const byProduct = useMemo(() => {
    const m = new Map<string, BatchStock[]>()
    for (const b of data?.batches ?? []) m.set(b.product_id, [...(m.get(b.product_id) ?? []), b])
    return m
  }, [data])

  // fill the sale price of a product pre-selected from the URL
  useEffect(() => {
    if (!data) return
    setLines((ls) => ls.map((l) => (l.product_id && !l.rate ? { ...l, rate: rateOf(data.catalog.byId.get(l.product_id)?.sale_price) } : l)))
  }, [data])
  // select a customer that was just created once the list has reloaded
  useEffect(() => {
    if (pendingParty && data?.customers.some((p) => p.id === pendingParty)) {
      setPartyId(pendingParty)
      setPendingParty(null)
    }
  }, [pendingParty, data])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null
  const { catalog } = data
  const isSale = type === 'sale'
  const customer = data.customers.find((c) => c.id === partyId)

  /** batches this entry type may take from (sales never use expired stock) */
  const eligible = (productId: string) => (byProduct.get(productId) ?? []).filter((b) => !isSale || b.expiry_date >= date)
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const subtotal = r2(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0))
  const disc = Number(discount) || 0
  const total = r2(subtotal - disc)
  const paidNum = received === '' ? total : Number(received) || 0
  const due = r2(total - paidNum)

  const reset = () => {
    setLines([blank()])
    setParty('')
    setPartyId('')
    setReference('')
    setNote('')
    setDiscount('')
    setReceived('')
    if (params.toString()) setParams({})
  }

  const save = async () => {
    setErr('')
    for (const l of lines) {
      if (!l.product_id) return setErr(t('errChooseProduct'))
      if (!(Number(l.qty) > 0)) return setErr(t('errQty'))
      if (isSale && !(Number(l.rate) >= 0 && l.rate !== '')) return setErr(t('errInvalidPrice'))
    }
    if (isSale) {
      if (disc < 0 || disc > subtotal) return setErr(t('errInvalidDiscount'))
      if (paidNum < 0 || paidNum > total) return setErr(t('errInvalidPaid'))
      if (due > 0 && !partyId) return setErr(t('errCreditNeedsParty'))
    }
    setBusy(true)
    if (isSale) {
      const { data: saleId, error } = await supabase.rpc('record_sale', {
        p_org: org.id,
        p_date: date,
        p_lines: lines.map((l) => ({ product_id: l.product_id, batch_id: l.batch_id || null, qty: Number(l.qty), unit_price: Number(l.rate) })),
        p_party_id: partyId || null,
        p_customer_name: partyId ? null : party || null,
        p_discount: disc,
        p_paid: paidNum,
        p_note: note || null,
      })
      setBusy(false)
      if (error) return setErr(errText(error, t))
      const { data: s } = await supabase.from('sales').select('invoice_no').eq('id', saleId as string).single()
      toast(t('saleSaved', { n: s?.invoice_no ?? '' }))
      reset()
      refresh()
      setReceiptFor(saleId as string)
      return
    }
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
    reset()
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
          {isSale ? (
            <>
              <Field label={`${t('customer')} (${t('khataAccount')})`}>
                <PartyPicker
                  kind="customer"
                  parties={data.customers}
                  value={partyId}
                  onChange={setPartyId}
                  onCreated={(id) => {
                    setPendingParty(id)
                    reload()
                  }}
                  noneLabel={t('walkIn')}
                />
              </Field>
              {partyId ? (
                <div className={cx('rounded-lg px-3 py-2', customer && customer.balance > 0 ? 'bg-amber-50' : 'bg-stone-50')}>
                  <div className="text-xs text-stone-500">{t('previousBalance')}</div>
                  <div className="num font-semibold">{fmtMoney(customer?.balance ?? 0, lang)}</div>
                </div>
              ) : (
                <Field label={t('customerName')} hint={t('optional')}>
                  <Input value={party} onChange={(e) => setParty(e.target.value)} />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label={type === 'return_out' ? t('supplier') : t('party')} hint={t('optional')}>
                <Input value={party} onChange={(e) => setParty(e.target.value)} />
              </Field>
              <Field label={t('invoiceNo')} hint={t('optional')}>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </>
          )}
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
          const lineAmount = (Number(l.qty) || 0) * (Number(l.rate) || 0)
          const cost = p ? Number(p.purchase_price) : 0
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
              <ProductPicker
                products={catalog.products.filter((x) => x.qty > 0 || x.id === l.product_id)}
                value={l.product_id}
                onChange={(id) => set(l.key, { product_id: id, batch_id: '', rate: rateOf(catalog.byId.get(id)?.sale_price) })}
              />

              {p && (
                <div className={cx('mt-3 grid gap-3', isSale ? 'sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]' : 'sm:grid-cols-[2fr_1fr]')}>
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
                  {isSale && (
                    <Field
                      label={`${t('rate')} / ${t(`pt_${p.pack_type}`)}`}
                      required
                      hint={
                        lineAmount > 0 ? (
                          <span>
                            = <b className="num">{fmtMoney(lineAmount, lang)}</b>
                            {cost > 0 && Number(l.rate) > 0 && (
                              <span className={cx('num ms-2', Number(l.rate) < cost ? 'text-red-600' : 'text-brand-700')}>
                                {t('profit')}: {fmtMoney((Number(l.rate) - cost) * (Number(l.qty) || 0), lang)}
                              </span>
                            )}
                          </span>
                        ) : Number(p.sale_price) > 0 ? `${t('mrp')}: ${fmtMoney(p.sale_price, lang)}` : undefined
                      }
                    >
                      <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={l.rate} onChange={(e) => set(l.key, { rate: e.target.value })} />
                    </Field>
                  )}
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
        {isSale && (
          <div className="mb-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="text-sm text-stone-500">{t('subtotal')}</div>
                <div className="num text-lg font-semibold">{fmtMoney(subtotal, lang)}</div>
              </div>
              <Field label={t('discount')} hint={t('optional')}>
                <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
              <div className="rounded-lg bg-brand-50 p-3">
                <div className="text-sm text-stone-500">{t('grandTotal')}</div>
                <div className="num text-2xl font-bold text-brand-800">{fmtMoney(total, lang)}</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('received')}>
                <Input type="number" min="0" step="any" inputMode="decimal" placeholder={String(total)} value={received} onChange={(e) => setReceived(e.target.value)} />
              </Field>
              <div className={cx('rounded-lg p-3 sm:col-span-2', due > 0 ? 'bg-amber-50' : 'bg-stone-50')}>
                <div className="text-sm text-stone-500">{t('balanceDue')}</div>
                <div className={cx('num text-lg font-bold', due > 0 && 'text-amber-800')}>{fmtMoney(due, lang)}</div>
                {due > 0 && !partyId && <div className="text-xs text-red-600">{t('errCreditNeedsParty')}</div>}
                {due > 0 && customer && (
                  <div className="num text-xs text-stone-600">{t('newBalance')}: {fmtMoney(customer.balance + due, lang)}</div>
                )}
              </div>
            </div>
          </div>
        )}
        <Field label={t('note')} hint={t('optional')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
        <Button size="lg" variant="warning" className="mt-4 w-full sm:w-auto" onClick={save} loading={busy}>
          <Check className="size-5" /> {isSale ? `${t('saveStock')} · ${fmtMoney(total, lang)}` : `${t('saveStock')} (${t('totalItems', { n: lines.length })})`}
        </Button>
      </Card>

      <ReceiptModal saleId={receiptFor} onClose={() => setReceiptFor(null)} onNewSale={() => setReceiptFor(null)} />
    </div>
  )
}
