import { ArrowUpFromLine, Check, Plus, Sprout, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductPicker } from '../components/domain'
import { PartyPicker } from '../components/PartyPicker'
import { AccountPicker } from '../components/AccountPicker'
import { ReceiptModal } from '../components/Receipt'
import { Button, Card, Checkbox, ErrorBox, Field, Input, Loading, PageHeader, Select, useFeedback, Segmented } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { cx } from '../lib/cx'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { DUE_PRESETS, dueFromRule } from '../lib/due'
import { daysBetween, fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney, r2 } from '../lib/money'
import { loadParties } from '../lib/parties'
import { supabase } from '../lib/supabase'
import { OUT_TYPES, type BatchStock, type MovementType, type ProductStock } from '../lib/types'
import { fmtNum, fmtTotal, unitLabel } from '../lib/units'
import { canSellLoose, exceeds, kgFits, kgToPacks, packsToKg, perKg, perPack, type SaleUnit } from '../lib/loose'

interface Line {
  key: number
  product_id: string
  batch_id: string // '' = automatic, earliest expiry first
  qty: string
  rate: string // sale price per pack (or per kg when sold loose)
  unit: SaleUnit // bags can be sold loose by kg
}
const rateOf = (n?: number | null) => (Number(n) > 0 ? String(Number(n)) : '')
/** product_stock row with the credit (udhaar) price per pack (migration 013) */
type WithCredit = ProductStock & { credit_price?: number | null }
type RateMode = 'cash' | 'credit'
/** an open crop advance of the selected customer */
interface Advance { id: string; crop: string; season: string | null; balance: number }
let seq = 1
const blank = (product_id = '', batch_id = '', qty = '', rate = ''): Line => ({ key: seq++, product_id, batch_id, qty, rate, unit: 'pack' })

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
  // credit sale extras (only for khata customers)
  const [rateMode, setRateMode] = useState<RateMode>('cash')
  const [markupPct, setMarkupPct] = useState('')
  const [useAdvance, setUseAdvance] = useState(false)
  const [advanceId, setAdvanceId] = useState('')
  const [advanceAmt, setAdvanceAmt] = useState('') // '' = as much as fits
  const [account, setAccount] = useState('') // '' = cash in hand
  const [dueDate, setDueDate] = useState('')
  const [dueTouched, setDueTouched] = useState(false)

  const { data: accounts } = useAccounts()
  const hasAccounts = (accounts ?? []).some((a) => a.is_active)

  // open crop advances of the chosen customer (empty before migration 013)
  const advLoad = useLoad(async () => {
    if (!partyId) return { partyId, list: [] as Advance[] }
    const { data: rows, error: e } = await supabase
      .from('crop_advance_balances')
      .select('id, crop, season, balance')
      .eq('org_id', org.id)
      .eq('party_id', partyId)
      .eq('is_closed', false)
      .gt('balance', 0)
      .order('created_at')
    if (e) return { partyId, list: [] as Advance[] }
    return { partyId, list: ((rows ?? []) as Advance[]).map((a) => ({ ...a, balance: Number(a.balance) })) }
  }, [org.id, partyId, version])

  const dueRule = (data?.customers.find((c) => c.id === partyId) as { due_rule?: string | null } | undefined)?.due_rule ?? null
  // default promised date from the customer's rule, until the user picks one
  useEffect(() => {
    if (!dueTouched) setDueDate(partyId ? dueFromRule(dueRule, date) ?? '' : '')
  }, [partyId, dueRule, date, dueTouched])

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
      setUseAdvance(false)
      setAdvanceId('')
      setAdvanceAmt('')
      setDueTouched(false)
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
  /** line sold loose by kg (only bags) */
  const looseOf = (l: Line) => l.unit === 'kg' && canSellLoose(catalog.byId.get(l.product_id))
  const sizeOf = (l: Line) => Number(catalog.byId.get(l.product_id)?.pack_size) || 1
  /** quantity in packs, as stored */
  const packsOf = (l: Line) => (looseOf(l) ? kgToPacks(Number(l.qty) || 0, sizeOf(l)) : Number(l.qty) || 0)
  /** rate per pack, as stored */
  const packRateOf = (l: Line) => (looseOf(l) ? perPack(Number(l.rate) || 0, sizeOf(l)) : Number(l.rate) || 0)
  /** line amount exactly as the server calculates it */
  const amountOf = (l: Line) => r2(packsOf(l) * packRateOf(l))
  const switchUnit = (l: Line, unit: SaleUnit) => {
    if (unit === l.unit) return
    const size = sizeOf(l)
    const q = Number(l.qty)
    const r = Number(l.rate)
    set(l.key, unit === 'kg'
      ? { unit, qty: q > 0 ? String(packsToKg(q, size)) : l.qty, rate: r > 0 ? String(perKg(r, size)) : l.rate }
      : { unit, qty: q > 0 ? String(kgToPacks(q, size)) : l.qty, rate: r > 0 ? String(perPack(r, size)) : l.rate })
  }

  // ---- cash / credit rate (khata customers only)
  const creditOf = (id: string) => Number((catalog.byId.get(id) as WithCredit | undefined)?.credit_price) || 0
  /** rate per pack for a mode: credit price when set, otherwise the cash rate (MRP) */
  const packPriceFor = (id: string, mode: RateMode) => (mode === 'credit' && creditOf(id) > 0 ? creditOf(id) : Number(catalog.byId.get(id)?.sale_price) || 0)
  const creditMode = isSale && !!partyId && rateMode === 'credit'
  /** switch mode: only lines whose product has a credit rate change, others keep what was typed */
  const applyRateMode = (mode: RateMode) => {
    setRateMode(mode)
    setLines((ls) =>
      ls.map((l) => {
        if (!l.product_id || !(creditOf(l.product_id) > 0)) return l
        const r = packPriceFor(l.product_id, mode)
        return { ...l, rate: r > 0 ? String(looseOf(l) ? perKg(r, sizeOf(l)) : r) : '' }
      }),
    )
  }
  const noCreditRate = creditMode ? lines.filter((l) => l.product_id && !(creditOf(l.product_id) > 0)).length : 0

  const chooseCustomer = (id: string) => {
    setPartyId(id)
    setReceived('')
    setUseAdvance(false)
    setAdvanceId('')
    setAdvanceAmt('')
    setDueTouched(false)
    // walk-in sales are always at the cash rate
    if (!id && rateMode === 'credit') applyRateMode('cash')
  }

  const subtotal = r2(lines.reduce((s, l) => s + amountOf(l), 0))
  const disc = Number(discount) || 0
  // markup % on a credit bill (khata customers only), rounded like the server
  const pct = isSale && partyId ? Number(markupPct) || 0 : 0
  const markup = pct > 0 ? r2(((subtotal - disc) * pct) / 100) : 0
  const total = r2(subtotal - disc + markup)

  // ---- crop advance of this customer
  const advances = isSale && partyId && advLoad.data?.partyId === partyId ? advLoad.data.list : []
  const adv = advances.find((a) => a.id === advanceId) ?? advances[0]
  const advOn = useAdvance && !!adv
  const advDefault = adv ? r2(Math.max(0, Math.min(adv.balance, total))) : 0
  const advNum = advOn ? (advanceAmt === '' ? advDefault : Number(advanceAmt) || 0) : 0
  const advTooMuch = advOn && adv && (advNum > adv.balance || advNum > total)
  const advLabel = (a: Advance) => [a.crop, a.season].filter(Boolean).join(' ')

  // empty Received: walk-in = paid in full (cash only); khata customer = nothing received (all on credit)
  const paidNum = received === '' ? (partyId ? 0 : total) : Number(received) || 0
  const toPay = r2(total - advNum) // what is left after the advance
  const due = r2(total - paidNum - advNum)
  const dueIn = dueDate ? daysBetween(today, dueDate) : null

  const reset = () => {
    setLines([blank()])
    setParty('')
    setPartyId('')
    setReference('')
    setNote('')
    setDiscount('')
    setReceived('')
    setRateMode('cash')
    setMarkupPct('')
    setUseAdvance(false)
    setAdvanceId('')
    setAdvanceAmt('')
    setAccount('')
    setDueDate('')
    setDueTouched(false)
    if (params.toString()) setParams({})
  }

  const save = async () => {
    setErr('')
    for (const l of lines) {
      if (!l.product_id) return setErr(t('errChooseProduct'))
      if (!(Number(l.qty) > 0)) return setErr(t('errQty'))
      if (looseOf(l) && !kgFits(Number(l.qty))) return setErr(t('errKgStep'))
      if (isSale && !(Number(l.rate) >= 0 && l.rate !== '')) return setErr(t('errInvalidPrice'))
    }
    if (isSale) {
      if (disc < 0 || disc > subtotal) return setErr(t('errInvalidDiscount'))
      if (partyId && Number(markupPct) < 0) return setErr(t('errInvalidAmount'))
      if (advOn && (advNum < 0 || advTooMuch)) return setErr(t('errAdvanceTooMuch'))
      if (paidNum < 0 || r2(paidNum + advNum) > total) return setErr(t('errInvalidPaid'))
      if (due > 0 && !partyId) return setErr(t('errCreditNeedsParty'))
    }
    setBusy(true)
    if (isSale) {
      const args: Record<string, unknown> = {
        p_org: org.id,
        p_date: date,
        p_lines: lines.map((l) => ({ product_id: l.product_id, batch_id: l.batch_id || null, qty: packsOf(l), unit_price: packRateOf(l), loose: looseOf(l) })),
        p_party_id: partyId || null,
        p_customer_name: partyId ? null : party || null,
        p_discount: disc,
        p_paid: paidNum,
        p_note: note || null,
      }
      // the money extras are only sent when used, so a plain sale also works before migration 013
      if (markup > 0) args.p_markup = markup
      if (due > 0 && partyId && dueDate) args.p_due_date = dueDate
      if (paidNum > 0 && account) args.p_account = account
      if (advNum > 0 && adv) {
        args.p_advance = adv.id
        args.p_advance_amount = advNum
      }
      const { data: saleId, error } = await supabase.rpc('record_sale', args)
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
              <Field label={t('customer')}>
                <PartyPicker
                  kind="customer"
                  parties={data.customers}
                  value={partyId}
                  onChange={chooseCustomer}
                  onCreated={(id) => {
                    setPendingParty(id)
                    setReceived('')
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
                <Field label={t('customerName')} optional>
                  <Input value={party} onChange={(e) => setParty(e.target.value)} />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label={type === 'return_out' ? t('supplier') : t('party')} optional>
                <Input value={party} onChange={(e) => setParty(e.target.value)} />
              </Field>
              <Field label={t('invoiceNo')} optional>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        {isSale && partyId && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-stone-100 pt-3">
            <span className="text-sm font-medium text-stone-700">{t('saleRateLabel')}</span>
            <Segmented
              value={rateMode}
              onChange={applyRateMode}
              items={[{ value: 'cash', label: t('saleRateCash') }, { value: 'credit', label: t('saleRateCredit'), tone: 'amber' }]}
            />
            {noCreditRate > 0 && <span className="text-xs text-stone-500">{t('saleNoCreditRate', { n: noCreditRate })}</span>}
          </div>
        )}
      </Card>

      <div className="mt-4 space-y-3">
        {lines.map((l, i) => {
          const p = catalog.byId.get(l.product_id)
          const options = eligible(l.product_id)
          const chosen = options.find((b) => b.id === l.batch_id)
          const available = chosen ? chosen.qty : options.reduce((s, b) => s + b.qty, 0)
          const loose = looseOf(l)
          const size = Number(p?.pack_size) || 1
          const qty = packsOf(l)
          const over = exceeds(qty, available)
          const badStep = loose && Number(l.qty) > 0 && !kgFits(Number(l.qty))
          const kg = unitLabel('kg', lang)
          const unitName = p ? (loose ? kg : t(`pt_${p.pack_type}`)) : ''
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
          const lineAmount = amountOf(l)
          const cost = p ? Number(p.purchase_price) / (loose ? size : 1) : 0
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
                onChange={(id) => set(l.key, { product_id: id, batch_id: '', unit: 'pack', rate: rateOf(packPriceFor(id, creditMode ? 'credit' : 'cash')) })}
              />

              {p && (
                <div className={cx('mt-3 grid gap-3', isSale ? 'sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr]' : 'sm:grid-cols-[2fr_1fr]')}>
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
                    label={`${t('qtyPacks')} (${unitName})`}
                    required
                    error={
                      over ? `${t('exceeds')} (${loose ? `${fmtNum(packsToKg(available, size), 3)} ${kg}` : fmtNum(available)})`
                      : badStep ? t('errKgStep')
                      : undefined
                    }
                    hint={
                      loose
                        ? `${t('available')}: ${fmtNum(packsToKg(available, size), 3)} ${kg} (${fmtNum(available, 3)} ${t(`pt_${p.pack_type}`)})`
                        : `${t('available')}: ${fmtNum(available)}${p.pack_unit !== 'pcs' ? ` = ${fmtTotal(available, p.pack_size, p.pack_unit, lang)}` : ''}`
                    }
                  >
                    <div className="flex gap-2">
                      <Input type="number" min="0" step="any" inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} className="min-w-0 flex-1" />
                      {isSale && canSellLoose(p) && (
                        <Select value={l.unit} onChange={(e) => switchUnit(l, e.target.value as SaleUnit)} className="w-24 shrink-0" aria-label={t('saleUnit')}>
                          <option value="pack">{t(`pt_${p.pack_type}`)}</option>
                          <option value="kg">{kg}</option>
                        </Select>
                      )}
                    </div>
                  </Field>
                  {isSale && (
                    <Field
                      label={loose ? t('perKgRate') : `${t('rate')} / ${t(`pt_${p.pack_type}`)}`}
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
                        ) : Number(p.sale_price) > 0 ? `${t('mrp')}: ${fmtMoney(loose ? perKg(Number(p.sale_price), size) : p.sale_price, lang)}${loose ? ` / ${kg}` : ''}` : undefined
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
            <div className={cx('grid gap-3', partyId ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}>
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="text-sm text-stone-500">{t('subtotal')}</div>
                <div className="num text-lg font-semibold">{fmtMoney(subtotal, lang)}</div>
              </div>
              <Field label={t('discount')} optional>
                <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
              {partyId && (
                <Field
                  label={t('saleMarkupPct')}
                  hint={markup > 0 ? <span className="num">+ {fmtMoney(markup, lang)}</span> : t('saleMarkupHint')}
                >
                  <Input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} />
                </Field>
              )}
              <div className="rounded-lg bg-brand-50 p-3">
                <div className="text-sm text-stone-500">{t('grandTotal')}</div>
                <div className="num text-2xl font-bold text-brand-800">{fmtMoney(total, lang)}</div>
                {markup > 0 && <div className="num text-xs text-stone-600">+ {t('saleMarkup')} {fmtMoney(markup, lang)}</div>}
              </div>
            </div>

            {advances.length > 0 && adv && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Sprout className="size-4 shrink-0 text-brand-700" />
                    <span className="font-medium text-stone-800">{t('saleCropAdvance')}</span>
                    {advances.length === 1 && (
                      <span className="min-w-0 truncate text-stone-600">
                        {advLabel(adv)} · <span className="num">{t('saleLeft', { amount: fmtMoney(adv.balance, lang) })}</span>
                      </span>
                    )}
                  </div>
                  <Checkbox
                    checked={useAdvance}
                    onChange={(v) => {
                      setUseAdvance(v)
                      setAdvanceAmt('')
                      setReceived('') // the advance changes what is left to pay
                    }}
                    label={t('salePayFromAdvance')}
                  />
                </div>
                {(advances.length > 1 || advOn) && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {advances.length > 1 && (
                      <Select
                        value={adv.id}
                        onChange={(e) => {
                          setAdvanceId(e.target.value)
                          setAdvanceAmt('')
                          setReceived('')
                        }}
                        aria-label={t('saleCropAdvance')}
                      >
                        {advances.map((a) => (
                          <option key={a.id} value={a.id}>
                            {advLabel(a)} · {t('saleLeft', { amount: fmtMoney(a.balance, lang) })}
                          </option>
                        ))}
                      </Select>
                    )}
                    {advOn && (
                      <Field label={t('saleAdvanceAmount')} error={advTooMuch ? t('errAdvanceTooMuch') : undefined}>
                        <Input type="number" min="0" step="any" inputMode="decimal" placeholder={String(advDefault)} value={advanceAmt} onChange={(e) => setAdvanceAmt(e.target.value)} />
                      </Field>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Field label={t('received')} hint={partyId ? t('receivedHintKhata') : t('receivedHintWalkIn')}>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder={partyId ? '0' : String(total)}
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      className="min-w-0 flex-1"
                    />
                    {hasAccounts && paidNum > 0 && (
                      <AccountPicker value={account} onChange={setAccount} className="w-32 shrink-0" aria-label={t('saleReceivedInto')} />
                    )}
                  </div>
                </Field>
                {partyId && toPay > 0 && (
                  <Segmented
                    className="mt-2"
                    value={paidNum === toPay ? 'full' : paidNum === 0 ? 'credit' : ''}
                    onChange={(v) => setReceived(v === 'full' ? String(toPay) : '0')}
                    items={[{ value: 'full', label: t('fullPayment') }, { value: 'credit', label: t('onCredit'), tone: 'amber' }]}
                  />
                )}
              </div>
              <div className={cx('rounded-lg p-3 sm:col-span-2', due > 0 ? 'bg-amber-50' : 'bg-stone-50')}>
                <div className="text-sm text-stone-500">{t('balanceDue')}</div>
                <div className={cx('num text-lg font-bold', due > 0 && 'text-amber-800')}>{fmtMoney(due, lang)}</div>
                {advNum > 0 && <div className="num text-xs text-stone-600">{t('salePaidFromAdvance')}: {fmtMoney(advNum, lang)}</div>}
                {due > 0 && !partyId && <div className="text-xs text-red-600">{t('errCreditNeedsParty')}</div>}
                {due > 0 && customer && (
                  <div className="num text-xs text-stone-600">{t('newBalance')}: {fmtMoney(customer.balance + due, lang)}</div>
                )}
              </div>
            </div>

            {due > 0 && partyId && (
              <div>
                <div className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-stone-700">
                  {t('salePayBy')} <span className="text-xs font-normal text-stone-400">({t('optional')})</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {DUE_PRESETS.map((d) => {
                    const v = dueFromRule(d.rule, date) ?? ''
                    const on = !!dueDate && dueDate === v
                    return (
                      <button
                        key={d.rule}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setDueDate(on ? '' : v)
                          setDueTouched(true)
                        }}
                        className={cx(
                          'h-8 rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-colors cursor-pointer',
                          on ? 'bg-primary text-white ring-primary' : 'bg-surface text-stone-700 ring-stone-300 hover:ring-brand-600',
                        )}
                      >
                        {t(d.key)}
                      </button>
                    )
                  })}
                  <div className="w-40">
                    <Input
                      type="date"
                      value={dueDate}
                      min={date}
                      onChange={(e) => {
                        setDueDate(e.target.value)
                        setDueTouched(true)
                      }}
                      aria-label={t('salePayBy')}
                    />
                  </div>
                </div>
                {dueDate && dueIn !== null && (
                  <div className="num mt-1 text-xs text-stone-500">
                    {fmtDate(dueDate, lang)} · {dueIn >= 0 ? t('daysLeft', { n: dueIn }) : t('saleOverdueDays', { n: -dueIn })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <Field label={t('note')} optional>
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
