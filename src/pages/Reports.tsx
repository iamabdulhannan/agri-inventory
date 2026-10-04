import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PrintHeader, ProductName, ProductPicker, ReportButtons } from '../components/domain'
import { usePackLabel } from '../lib/packLabel'
import { Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, PageHeader, Tabs } from '../components/ui'
import { cx } from '../lib/cx'
import { useOrg } from '../lib/app'
import { loadCatalog, type Catalog } from '../lib/catalog'
import { downloadCsv } from '../lib/csv'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { addDays, fmtDate, fmtMonth, monthOf, monthRange, weekday } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { ProductStock, RegisterRow, SummaryRow } from '../lib/types'
import { baseOf, fmtBase, fmtNum, fmtPack, fmtTotal, measureOf } from '../lib/units'
import { ExpiryView } from './Expiry'

type Tab = 'daily' | 'monthly' | 'register' | 'stock' | 'expiry'

const num = (r: SummaryRow) => ({
  ...r,
  opening: +r.opening, purchased: +r.purchased, returned_in: +r.returned_in, sold: +r.sold, returned_out: +r.returned_out,
  damaged: +r.damaged, expired: +r.expired, adjusted: +r.adjusted, closing: +r.closing,
})
const inOf = (r: SummaryRow) => r.purchased + r.returned_in
const outOf = (r: SummaryRow) => r.sold + r.returned_out + r.damaged + r.expired
const moved = (r: SummaryRow) => inOf(r) !== 0 || outOf(r) !== 0 || r.adjusted !== 0

async function summary(orgId: string, from: string, to: string) {
  const rows = await fetchAll<SummaryRow>((a, b) =>
    supabase.rpc('stock_summary', { p_org: orgId, p_from: from, p_to: to }).order('product_id').range(a, b),
  )
  return rows.map(num)
}

export function Reports() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'daily'
  const setTab = (v: Tab) => setParams({ tab: v })

  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><BarChart3 className="size-6 text-brand-700" /> {t('reports')}</span>} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'daily', label: t('daily') },
          { value: 'monthly', label: t('monthly') },
          { value: 'register', label: t('dayByDay') },
          { value: 'stock', label: t('stockOnDate') },
          { value: 'expiry', label: t('expiryReport') },
        ]}
      />
      {tab === 'daily' && <DailyReport />}
      {tab === 'monthly' && <MonthlyReport />}
      {tab === 'register' && <RegisterReport />}
      {tab === 'stock' && <StockReport />}
      {tab === 'expiry' && <ExpiryView embedded />}
    </div>
  )
}

// ------------------------------------------------------------------ shared summary table
function SummaryTable({ rows, catalog, detailed }: { rows: SummaryRow[]; catalog: Catalog; detailed: boolean }) {
  const { t, lang } = useI18n()
  const label = usePackLabel()
  const list = rows.map((r) => ({ r, p: catalog.byId.get(r.product_id)! })).filter((x) => x.p)
  const ordered = catalog.products.map((p) => list.find((x) => x.p.id === p.id)).filter(Boolean) as typeof list

  // footer: liters and kg
  const tot = { volume: { o: 0, i: 0, x: 0, c: 0 }, weight: { o: 0, i: 0, x: 0, c: 0 } }
  for (const { r, p } of ordered) {
    const m = measureOf(p.pack_unit)
    if (m === 'count') continue
    const b = baseOf(p.pack_size, p.pack_unit)
    tot[m].o += r.opening * b
    tot[m].i += inOf(r) * b
    tot[m].x += outOf(r) * b
    tot[m].c += r.closing * b
  }
  if (!ordered.length) return <Empty>{t('noData')}</Empty>
  const cell = (v: number, cls?: string) => <td className={cx('r num', v === 0 && 'text-stone-300', cls)}>{fmtNum(v, 3)}</td>

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t('product')}</th>
            <th>{t('packSize')}</th>
            <th className="r">{t('opening')}</th>
            {detailed ? (
              <>
                <th className="r">{t('purchased')}</th>
                <th className="r">{t('returnIn')}</th>
                <th className="r">{t('sold')}</th>
                <th className="r">{t('returnOut')}</th>
                <th className="r">{t('damaged')}</th>
                <th className="r">{t('expiredCol')}</th>
              </>
            ) : (
              <>
                <th className="r">{t('in')}</th>
                <th className="r">{t('out')}</th>
              </>
            )}
            <th className="r">{t('adjusted')}</th>
            <th className="r">{t('closing')}</th>
            <th className="r">{t('closingTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(({ r, p }) => (
            <tr key={p.id}>
              <td><ProductName p={p} /></td>
              <td className="num whitespace-nowrap text-brand-800">{label(p)}</td>
              {cell(r.opening)}
              {detailed ? (
                <>
                  {cell(r.purchased, 'text-brand-700')}
                  {cell(r.returned_in, 'text-brand-700')}
                  {cell(r.sold, 'text-orange-700')}
                  {cell(r.returned_out, 'text-orange-700')}
                  {cell(r.damaged, 'text-red-700')}
                  {cell(r.expired, 'text-red-700')}
                </>
              ) : (
                <>
                  {cell(inOf(r), 'text-brand-700 font-medium')}
                  {cell(outOf(r), 'text-orange-700 font-medium')}
                </>
              )}
              {cell(r.adjusted)}
              <td className={cx('r num font-semibold', r.closing <= 0 && 'text-red-700')}>{fmtNum(r.closing, 3)}</td>
              <td className="r num whitespace-nowrap text-stone-600">{p.pack_unit === 'pcs' ? '' : fmtTotal(r.closing, p.pack_size, p.pack_unit, lang)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {(['volume', 'weight'] as const).map((m) =>
            tot[m].o || tot[m].i || tot[m].x || tot[m].c ? (
              <tr key={m}>
                <td colSpan={2}>{m === 'volume' ? t('liquidTotal') : t('dryTotal')}</td>
                <td className="r num">{fmtBase(tot[m].o, m, lang)}</td>
                {detailed ? <td className="r num" colSpan={2}>{fmtBase(tot[m].i, m, lang)}</td> : <td className="r num">{fmtBase(tot[m].i, m, lang)}</td>}
                {detailed ? <td className="r num" colSpan={4}>{fmtBase(tot[m].x, m, lang)}</td> : <td className="r num">{fmtBase(tot[m].x, m, lang)}</td>}
                <td />
                <td className="r num" colSpan={2}>{fmtBase(tot[m].c, m, lang)}</td>
              </tr>
            ) : null,
          )}
        </tfoot>
      </table>
    </div>
  )
}

function summaryCsv(name: string, rows: SummaryRow[], catalog: Catalog, t: ReturnType<typeof useI18n>['t']) {
  downloadCsv(name, [t('product'), t('company'), t('packSize'), t('opening'), t('purchased'), t('returnIn'), t('sold'), t('returnOut'), t('damaged'), t('expiredCol'), t('adjusted'), t('closing'), t('closingTotal')],
    catalog.products
      .map((p) => ({ p, r: rows.find((r) => r.product_id === p.id) }))
      .filter((x) => x.r)
      .map(({ p, r }) => [p.name, p.company_name, fmtPack(p.pack_size, p.pack_unit), r!.opening, r!.purchased, r!.returned_in, r!.sold, r!.returned_out, r!.damaged, r!.expired, r!.adjusted, r!.closing, fmtTotal(r!.closing, p.pack_size, p.pack_unit)]))
}

function Toolbar({ children, onExcel }: { children: React.ReactNode; onExcel?: () => void }) {
  return (
    <Card className="no-print mb-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <div className="ms-auto flex gap-2">
          <ReportButtons onExcel={onExcel} />
        </div>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ Daily
function DailyReport() {
  const { t, lang } = useI18n()
  const { org, today, version } = useOrg()
  const [params, setParams] = useSearchParams()
  const date = params.get('date') || today
  const setDate = (d: string) => setParams({ tab: 'daily', date: d })
  const [onlyMoved, setOnlyMoved] = useState(true)
  const [detailed, setDetailed] = useState(false)

  const { data, error, loading, reload } = useLoad(async () => {
    const [catalog, rows] = await Promise.all([loadCatalog(org.id), summary(org.id, date, date)])
    return { catalog, rows }
  }, [org.id, date, version])

  const rows = (data?.rows ?? []).filter((r) => (onlyMoved ? moved(r) : r.opening !== 0 || r.closing !== 0 || moved(r)))

  return (
    <div>
      <Toolbar onExcel={data ? () => summaryCsv(`daily-report-${date}`, rows, data.catalog, t) : undefined}>
        <Field label={t('date')}>
          <div className="flex items-center gap-1">
            <Button variant="secondary" onClick={() => setDate(addDays(date, -1))} aria-label="previous"><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
            <Input type="date" className="w-44" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Button variant="secondary" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="next"><ChevronRight className="size-4 rtl:rotate-180" /></Button>
            {date !== today && <Button variant="ghost" onClick={() => setDate(today)}>{t('today')}</Button>}
          </div>
        </Field>
        <Checkbox checked={onlyMoved} onChange={setOnlyMoved} label={t('onlyMoved')} />
        <Checkbox checked={detailed} onChange={setDetailed} label={t('detailed')} />
      </Toolbar>
      <PrintHeader title={t('dailyReport')} subtitle={`${fmtDate(date, lang)} (${weekday(date, lang)})`} />
      <h2 className="no-print mb-2 font-semibold">{t('dailyReport')} · <span className="num">{fmtDate(date, lang)}</span> <span className="text-stone-500">({weekday(date, lang)})</span></h2>
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : data && (
        <Card className="print-plain"><SummaryTable rows={rows} catalog={data.catalog} detailed={detailed} /></Card>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Monthly
function MonthlyReport() {
  const { t, lang } = useI18n()
  const { org, today, version } = useOrg()
  const [, setParams] = useSearchParams()
  const [month, setMonth] = useState(monthOf(today))
  const [onlyMoved, setOnlyMoved] = useState(false)
  const [detailed, setDetailed] = useState(true)
  const [from, lastDay] = monthRange(month)
  const to = lastDay > today ? today : lastDay

  const { data, error, loading, reload } = useLoad(async () => {
    if (from > today) return null
    const [catalog, rows, reg] = await Promise.all([
      loadCatalog(org.id),
      summary(org.id, from, to),
      fetchAll<RegisterRow>((a, b) =>
        supabase.rpc('daily_register', { p_org: org.id, p_from: from, p_to: to, p_product: null, p_only_moves: true }).order('day').order('product_id').range(a, b),
      ),
    ])
    return { catalog, rows, reg }
  }, [org.id, from, to, version])

  const days = useMemo(() => {
    if (!data) return []
    const map = new Map<string, { day: string; pin: number; pout: number; li: number; lo: number; di: number; dout: number; items: number }>()
    for (const r of data.reg) {
      const p = data.catalog.byId.get(r.product_id)
      if (!p) continue
      const d = map.get(r.day) ?? { day: r.day, pin: 0, pout: 0, li: 0, lo: 0, di: 0, dout: 0, items: 0 }
      const b = baseOf(p.pack_size, p.pack_unit)
      const m = measureOf(p.pack_unit)
      d.pin += +r.qty_in
      d.pout += +r.qty_out
      d.items += 1
      if (m === 'volume') { d.li += +r.qty_in * b; d.lo += +r.qty_out * b }
      if (m === 'weight') { d.di += +r.qty_in * b; d.dout += +r.qty_out * b }
      map.set(r.day, d)
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
  }, [data])

  const rows = (data?.rows ?? []).filter((r) => (onlyMoved ? moved(r) : r.opening !== 0 || r.closing !== 0 || moved(r)))
  const dayTot = days.reduce((s, d) => ({ pin: s.pin + d.pin, pout: s.pout + d.pout, li: s.li + d.li, lo: s.lo + d.lo, di: s.di + d.di, dout: s.dout + d.dout }), { pin: 0, pout: 0, li: 0, lo: 0, di: 0, dout: 0 })

  return (
    <div className="space-y-4">
      <Toolbar onExcel={data ? () => summaryCsv(`monthly-report-${month}`, rows, data.catalog, t) : undefined}>
        <Field label={t('month')}>
          <Input type="month" className="w-44" value={month} max={monthOf(today)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
        <Checkbox checked={onlyMoved} onChange={setOnlyMoved} label={t('onlyMoved')} />
        <Checkbox checked={detailed} onChange={setDetailed} label={t('detailed')} />
      </Toolbar>
      <PrintHeader title={t('monthlyReport')} subtitle={`${fmtMonth(month, lang)} (${fmtDate(from, lang)} – ${fmtDate(to, lang)})`} />
      <h2 className="no-print font-semibold">{t('monthlyReport')} · {fmtMonth(month, lang)}</h2>

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : !data ? <Empty>{t('noData')}</Empty> : (
        <>
          <Card className="print-plain"><SummaryTable rows={rows} catalog={data.catalog} detailed={detailed} /></Card>

          <Card className="print-plain" title={`${t('dailyTotals')} · ${fmtMonth(month, lang)}`}>
            {days.length === 0 ? <Empty>{t('noEntries')}</Empty> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th className="r">{t('itemsCol')}</th>
                      <th className="r">{t('packsIn')}</th>
                      <th className="r">{t('packsOut')}</th>
                      <th className="r">{t('liquidIn')}</th>
                      <th className="r">{t('liquidOut')}</th>
                      <th className="r">{t('dryIn')}</th>
                      <th className="r">{t('dryOut')}</th>
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d.day}>
                        <td className="num whitespace-nowrap">{fmtDate(d.day, lang)} <span className="text-xs text-stone-400">{weekday(d.day, lang)}</span></td>
                        <td className="r num">{d.items}</td>
                        <td className="r num text-brand-700">{fmtNum(d.pin)}</td>
                        <td className="r num text-orange-700">{fmtNum(d.pout)}</td>
                        <td className="r num">{d.li ? fmtBase(d.li, 'volume', lang) : ''}</td>
                        <td className="r num">{d.lo ? fmtBase(d.lo, 'volume', lang) : ''}</td>
                        <td className="r num">{d.di ? fmtBase(d.di, 'weight', lang) : ''}</td>
                        <td className="r num">{d.dout ? fmtBase(d.dout, 'weight', lang) : ''}</td>
                        <td className="no-print r">
                          <Button size="sm" variant="ghost" onClick={() => setParams({ tab: 'daily', date: d.day })}>{t('openDay')}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{t('total')}</td>
                      <td />
                      <td className="r num">{fmtNum(dayTot.pin)}</td>
                      <td className="r num">{fmtNum(dayTot.pout)}</td>
                      <td className="r num">{fmtBase(dayTot.li, 'volume', lang)}</td>
                      <td className="r num">{fmtBase(dayTot.lo, 'volume', lang)}</td>
                      <td className="r num">{fmtBase(dayTot.di, 'weight', lang)}</td>
                      <td className="r num">{fmtBase(dayTot.dout, 'weight', lang)}</td>
                      <td className="no-print" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Day-by-day register for one product
function RegisterReport() {
  const { t, lang, pick } = useI18n()
  const { org, today, version } = useOrg()
  const label = usePackLabel()
  const [product, setProduct] = useState('')
  const [from, setFrom] = useState(monthRange(monthOf(today))[0])
  const [to, setTo] = useState(today)
  const [onlyMoves, setOnlyMoves] = useState(false)

  const { data, error, loading, reload } = useLoad(async () => {
    const catalog = await loadCatalog(org.id)
    if (!product) return { catalog, reg: [] as RegisterRow[] }
    const reg = await fetchAll<RegisterRow>((a, b) =>
      supabase.rpc('daily_register', { p_org: org.id, p_from: from, p_to: to, p_product: product, p_only_moves: onlyMoves }).order('day').range(a, b),
    )
    return { catalog, reg }
  }, [org.id, product, from, to, onlyMoves, version])

  const p: ProductStock | undefined = data?.catalog.byId.get(product)
  const totIn = (data?.reg ?? []).reduce((s, r) => s + +r.qty_in, 0)
  const totOut = (data?.reg ?? []).reduce((s, r) => s + +r.qty_out, 0)
  const tl = (n: number) => (p && p.pack_unit !== 'pcs' ? fmtTotal(n, p.pack_size, p.pack_unit, lang) : '')

  const exportCsv = () =>
    p && downloadCsv(`register-${p.name}-${fmtPack(p.pack_size, p.pack_unit)}-${from}-${to}`, [t('date'), t('opening'), t('in'), t('out'), t('closing'), t('closingTotal')],
      (data?.reg ?? []).map((r) => [r.day, r.opening, r.qty_in, r.qty_out, r.closing, tl(+r.closing)]))

  return (
    <div>
      <Toolbar onExcel={p ? exportCsv : undefined}>
        <Field label={t('product')} className="min-w-72 flex-1">
          {data && <ProductPicker products={data.catalog.products} value={product} onChange={setProduct} />}
        </Field>
        <Field label={t('from')}><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('to')}><Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
        <Checkbox checked={onlyMoves} onChange={setOnlyMoves} label={t('onlyMoveDays')} />
      </Toolbar>
      {p && <PrintHeader title={`${t('registerReport')} · ${pick(p.name, p.name_ur)} ${label(p)}`} subtitle={`${fmtDate(from, lang)} – ${fmtDate(to, lang)}`} />}

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : !p ? (
        <Card><Empty>{t('pickProduct')}</Empty></Card>
      ) : (
        <Card className="print-plain" title={<span className="no-print"><ProductName p={p} /></span>}>
          {data!.reg.length === 0 ? <Empty>{t('noEntries')}</Empty> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th className="r">{t('opening')}</th>
                    <th className="r">{t('in')}</th>
                    <th className="r">{t('out')}</th>
                    <th className="r">{t('closing')}</th>
                    <th className="r">{t('closingTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.reg.map((r) => {
                    const active = +r.qty_in !== 0 || +r.qty_out !== 0
                    return (
                      <tr key={r.day} className={active ? undefined : 'text-stone-400'}>
                        <td className="num whitespace-nowrap">{fmtDate(r.day, lang)} <span className="text-xs text-stone-400">{weekday(r.day, lang)}</span></td>
                        <td className="r num">{fmtNum(+r.opening, 3)}</td>
                        <td className="r num text-brand-700">{+r.qty_in ? fmtNum(+r.qty_in, 3) : ''}</td>
                        <td className="r num text-orange-700">{+r.qty_out ? fmtNum(+r.qty_out, 3) : ''}</td>
                        <td className="r num font-semibold">{fmtNum(+r.closing, 3)}</td>
                        <td className="r num">{tl(+r.closing)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t('total')}</td>
                    <td className="r num">{fmtNum(+data!.reg[0].opening, 3)}</td>
                    <td className="r num">{fmtNum(totIn, 3)}<div className="text-xs font-normal">{tl(totIn)}</div></td>
                    <td className="r num">{fmtNum(totOut, 3)}<div className="text-xs font-normal">{tl(totOut)}</div></td>
                    <td className="r num">{fmtNum(+data!.reg[data!.reg.length - 1].closing, 3)}</td>
                    <td className="r num">{tl(+data!.reg[data!.reg.length - 1].closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Stock on a date
function StockReport() {
  const { t, lang, pick } = useI18n()
  const { org, today, version } = useOrg()
  const label = usePackLabel()
  const [date, setDate] = useState(today)
  const [hideZero, setHideZero] = useState(true)

  const { data, error, loading, reload } = useLoad(async () => {
    const [catalog, rows] = await Promise.all([loadCatalog(org.id), summary(org.id, date, date)])
    return { catalog, rows }
  }, [org.id, date, version])

  const groups = useMemo(() => {
    if (!data) return []
    const closing = new Map(data.rows.map((r) => [r.product_id, r.closing]))
    return data.catalog.categories
      .map((c) => ({
        c,
        items: data.catalog.products
          .filter((p) => p.category_id === c.id)
          .map((p) => ({ p, qty: closing.get(p.id) ?? 0 }))
          .filter((x) => !hideZero || x.qty !== 0),
      }))
      .filter((g) => g.items.length)
  }, [data, hideZero])

  const all = groups.flatMap((g) => g.items)
  const sum = (m: 'volume' | 'weight') => all.filter((x) => measureOf(x.p.pack_unit) === m).reduce((s, x) => s + x.qty * baseOf(x.p.pack_size, x.p.pack_unit), 0)

  const exportCsv = () =>
    downloadCsv(`stock-${date}`, [t('category'), t('product'), t('company'), t('packSize'), t('stock'), t('total')],
      all.map(({ p, qty }) => [p.category_name, p.name, p.company_name, fmtPack(p.pack_size, p.pack_unit), qty, fmtTotal(qty, p.pack_size, p.pack_unit)]))

  return (
    <div>
      <Toolbar onExcel={data ? exportCsv : undefined}>
        <Field label={t('date')}><Input type="date" className="w-44" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
        <Checkbox checked={hideZero} onChange={setHideZero} label={t('hideZero')} />
      </Toolbar>
      <PrintHeader title={t('stockReport')} subtitle={fmtDate(date, lang)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : (
        <Card className="print-plain">
          {all.length === 0 ? <Empty>{t('noData')}</Empty> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('product')}</th>
                    <th>{t('packSize')}</th>
                    <th className="r">{t('stock')}</th>
                    <th className="r">{t('total')}</th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.c.id}>
                    <tr className="bg-stone-50">
                      <td colSpan={4} className="font-semibold text-stone-700">{pick(g.c.name, g.c.name_ur)} <span className="num text-xs font-normal text-stone-400">({g.items.length})</span></td>
                    </tr>
                    {g.items.map(({ p, qty }) => (
                      <tr key={p.id}>
                        <td className="ps-6"><ProductName p={p} /></td>
                        <td className="num text-brand-800">{label(p)}</td>
                        <td className={cx('r num font-semibold', qty < 0 && 'text-red-700')}>{fmtNum(qty, 3)}</td>
                        <td className="r num">{p.pack_unit === 'pcs' ? '' : fmtTotal(qty, p.pack_size, p.pack_unit, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t('liquidTotal')}</td>
                    <td />
                    <td className="r num">{fmtBase(sum('volume'), 'volume', lang)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}>{t('dryTotal')}</td>
                    <td />
                    <td className="r num">{fmtBase(sum('weight'), 'weight', lang)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
