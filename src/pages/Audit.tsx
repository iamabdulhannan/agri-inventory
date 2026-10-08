import { Lock, LockOpen, ShieldCheck } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { PrintHeader, ReportButtons } from '../components/domain'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Tabs, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { downloadCsv } from '../lib/csv'
import { cx } from '../lib/cx'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { addDays, fmtDate, fmtDateTime } from '../lib/format'
import { useI18n, type TKey } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import { supabase } from '../lib/supabase'
import type { PackUnit } from '../lib/types'
import { fmtNum, fmtPack } from '../lib/units'

/* ------------------------------------------------------------------ */
/* FBR tax year: Tax Year 2027 = 1 Jul 2026 to 30 Jun 2027             */
/* ------------------------------------------------------------------ */
const taxYearOf = (d: string) => (Number(d.slice(5, 7)) >= 7 ? Number(d.slice(0, 4)) + 1 : Number(d.slice(0, 4)))
const taxYearRange = (ty: number): [string, string] => [`${ty - 1}-07-01`, `${ty}-06-30`]

type Tab = 'summary' | 'sales' | 'purchases' | 'stock' | 'expenses' | 'trail'

interface YearReport {
  opening_stock: number; purchases: number; purchase_bills: number; stock_without_bill: number; purchase_returns: number
  closing_stock: number; cost_of_goods_sold: number; written_off: number
  gross_sales: number; discounts: number; invoices: number; sale_returns: number; net_sales: number
  gross_profit: number; expenses: number; net_profit: number
  cash_opening: number; cash_in: number; cash_out: number; cash_closing: number
  receivable: number; payable: number; customer_advances: number; supplier_advances: number
  locked_until: string | null
}

export function Audit() {
  const { t, lang } = useI18n()
  const { org, today, isAdmin } = useOrg()
  const currentTy = taxYearOf(today)
  const firstTy = Math.min(taxYearOf(org.created_at.slice(0, 10)) - 1, currentTy - 1)
  const [ty, setTy] = useState<string>(String(currentTy))
  const [customFrom, setCustomFrom] = useState(taxYearRange(currentTy)[0])
  const [customTo, setCustomTo] = useState(today)
  const [tab, setTab] = useState<Tab>('summary')
  const [from, to] = ty === 'custom' ? [customFrom, customTo] : taxYearRange(Number(ty))
  const period = ty === 'custom'
    ? `${fmtDate(from, lang)} – ${fmtDate(to, lang)}`
    : `${t('taxYear', { n: ty })} (${fmtDate(from, lang)} – ${fmtDate(to, lang)})`

  const years = useMemo(() => {
    const list: number[] = []
    for (let y = currentTy; y >= firstTy; y--) list.push(y)
    return list
  }, [currentTy, firstTy])

  if (!isAdmin) return <Empty>{t('auditAdminOnly')}</Empty>

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><ShieldCheck className="size-6 text-brand-700" /> {t('auditTitle')}</span>}
        subtitle={t('auditSubtitle')}
      />

      <Card className="no-print mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <Field label={t('period')}>
            <Select value={ty} onChange={(e) => setTy(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {t('taxYear', { n: y })}{y === currentTy ? ` · ${t('current')}` : ''}
                </option>
              ))}
              <option value="custom">{t('customRange')}</option>
            </Select>
          </Field>
          {ty === 'custom' ? (
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Field label={t('from')}><Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} /></Field>
              <Field label={t('to')}><Input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="self-end pb-2.5 text-sm text-stone-600">{fmtDate(from, lang)} – {fmtDate(to, lang)}</div>
          )}
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'summary', label: t('yearReport') },
          { value: 'sales', label: t('salesRegister') },
          { value: 'purchases', label: t('purchaseRegister') },
          { value: 'stock', label: t('stockRegister') },
          { value: 'expenses', label: t('expensesList') },
          { value: 'trail', label: t('auditTrail') },
        ]}
      />

      {tab === 'summary' && <YearSummary from={from} to={to} period={period} isTaxYear={ty !== 'custom'} />}
      {tab === 'sales' && <SalesRegister from={from} to={to} period={period} />}
      {tab === 'purchases' && <PurchaseRegister from={from} to={to} period={period} />}
      {tab === 'stock' && <StockRegister from={from} to={to} period={period} />}
      {tab === 'expenses' && <ExpensesList from={from} to={to} period={period} />}
      {tab === 'trail' && <AuditTrail from={from} to={to} period={period} />}
    </div>
  )
}

interface PeriodProps { from: string; to: string; period: string }

/* ------------------------------------------------------------------ */
/* Year report: trading account, P&L, position, lock                  */
/* ------------------------------------------------------------------ */
function YearSummary({ from, to, period, isTaxYear }: PeriodProps & { isTaxYear: boolean }) {
  const { t, lang } = useI18n()
  const { org, role, today, version, refresh, reloadOrgs } = useOrg()
  const { toast, confirm } = useFeedback()
  const [busy, setBusy] = useState(false)
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.rpc('year_report', { p_org: org.id, p_from: from, p_to: to })
    if (error) throw error
    return data as YearReport
  }, [org.id, from, to, version])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{migrationHint(error, t)}</ErrorBox>
  if (!data) return null
  const r = data
  const m = (n: number) => fmtMoney(n, lang)
  const lockedUntil = r.locked_until
  const isOwner = role === 'owner'
  const yearLocked = !!lockedUntil && lockedUntil >= to
  const yearOver = to < today

  const setLock = async (until: string | null, question: string) => {
    if (!(await confirm(question, !until))) return
    setBusy(true)
    const { error } = await supabase.rpc('set_locked_until', { p_org: org.id, p_until: until })
    setBusy(false)
    if (error) return toast(migrationHint(error, t), 'err')
    toast(until ? t('lockedToast', { date: fmtDate(until, lang) }) : t('unlockedToast'))
    await reloadOrgs()
    refresh()
  }

  const rows: [string, number | null, 'add' | 'sub' | 'total' | 'grand' | 'info'][] = [
    [t('openingStockCost'), r.opening_stock, 'add'],
    [`${t('purchasesBills')} (${r.purchase_bills})`, r.purchases, 'add'],
    ...(Number(r.stock_without_bill) ? [[t('stockWithoutBill'), r.stock_without_bill, 'add'] as [string, number, 'add']] : []),
    ...(Number(r.purchase_returns) ? [[t('returnsToSuppliers'), r.purchase_returns, 'sub'] as [string, number, 'sub']] : []),
    [t('closingStock'), r.closing_stock, 'sub'],
    [t('costOfGoodsSold'), r.cost_of_goods_sold, 'total'],
  ]
  const salesRows: [string, number, 'add' | 'sub' | 'total' | 'grand'][] = [
    [`${t('grossSales')} (${r.invoices} ${t('invoicesWord')})`, r.gross_sales, 'add'],
    ...(Number(r.discounts) ? [[t('discountsGiven'), r.discounts, 'sub'] as [string, number, 'sub']] : []),
    ...(Number(r.sale_returns) ? [[t('customerReturns'), r.sale_returns, 'sub'] as [string, number, 'sub']] : []),
    [t('netSales'), r.net_sales, 'total'],
  ]

  const exportCsv = () =>
    downloadCsv(`year-report-${from}-to-${to}`, [t('item'), t('amount')], [
      [period, ''],
      ...(org.ntn ? [[t('ntn'), org.ntn]] : []),
      ['', ''],
      [t('tradingAccount'), ''],
      ...rows.map(([l, v, k]) => [`${k === 'sub' ? '- ' : ''}${l}`, v]),
      ...salesRows.map(([l, v, k]) => [`${k === 'sub' ? '- ' : ''}${l}`, v]),
      [t('grossProfit'), r.gross_profit],
      [`- ${t('expensesWord')}`, r.expenses],
      [t('netProfit'), r.net_profit],
      ['', ''],
      [t('positionOn', { date: fmtDate(to, 'en') }), ''],
      [t('cashInHand'), r.cash_closing],
      [t('totalReceivable'), r.receivable],
      [t('totalPayable'), r.payable],
      [t('customerAdvances'), r.customer_advances],
      [t('supplierAdvance'), r.supplier_advances],
      [t('stockAtCost'), r.closing_stock],
    ])

  return (
    <div className="space-y-4">
      <div className="no-print flex justify-end"><ReportButtons onExcel={exportCsv} /></div>
      <PrintHeader title={t('yearReport')} subtitle={period} />

      {/* lock status */}
      <Card className={cx('no-print flex flex-wrap items-center justify-between gap-3 p-4', yearLocked ? 'border-brand-200 bg-brand-50' : '')}>
        <div className="flex items-start gap-3">
          {yearLocked ? <Lock className="mt-0.5 size-5 text-brand-700" /> : <LockOpen className="mt-0.5 size-5 text-stone-400" />}
          <div>
            <div className="font-semibold">{yearLocked ? t('yearLocked') : t('yearOpen')}</div>
            <div className="text-sm text-stone-600">
              {lockedUntil ? t('lockedUntilText', { date: fmtDate(lockedUntil, lang) }) : t('nothingLocked')}
              {!yearLocked && !yearOver && ` ${t('lockAfterYearEnd', { date: fmtDate(to, lang) })}`}
            </div>
            {!isOwner && <div className="mt-1 text-xs text-stone-500">{t('onlyOwnerLocks')}</div>}
          </div>
        </div>
        {isOwner && isTaxYear && (
          yearLocked ? (
            <Button variant="secondary" loading={busy} onClick={() => setLock(addDays(from, -1), t('unlockConfirm', { date: fmtDate(from, lang) }))}>
              <LockOpen className="size-4" /> {t('unlockYear')}
            </Button>
          ) : yearOver ? (
            <Button loading={busy} onClick={() => setLock(to, t('lockConfirm', { date: fmtDate(to, lang) }))}>
              <Lock className="size-4" /> {t('lockYear')}
            </Button>
          ) : null
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="print-plain">
          <SectionTitle>{t('tradingAccount')}</SectionTitle>
          <table className="tbl">
            <tbody>
              {rows.map(([label, value, kind]) => <Line key={label} label={label} value={value} kind={kind} />)}
              <tr><td colSpan={2} className="h-2 border-0 p-0" /></tr>
              {salesRows.map(([label, value, kind]) => <Line key={label} label={label} value={value} kind={kind} />)}
              <Line label={t('grossProfit')} value={r.gross_profit} kind="total" tone={r.gross_profit < 0 ? 'red' : 'green'} />
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="print-plain">
            <SectionTitle>{t('profitAndLoss')}</SectionTitle>
            <table className="tbl">
              <tbody>
                <Line label={t('grossProfit')} value={r.gross_profit} kind="add" />
                <Line label={t('expensesWord')} value={r.expenses} kind="sub" />
                <Line label={t('netProfit')} value={r.net_profit} kind="grand" tone={r.net_profit < 0 ? 'red' : 'green'} />
              </tbody>
            </table>
          </Card>

          <Card className="print-plain">
            <SectionTitle>{t('positionOn', { date: fmtDate(to, lang) })}</SectionTitle>
            <table className="tbl">
              <tbody>
                <Line label={t('stockAtCost')} value={r.closing_stock} />
                <Line label={t('cashInHand')} value={r.cash_closing} tone={r.cash_closing < 0 ? 'red' : undefined} />
                <Line label={t('totalReceivable')} value={r.receivable} />
                <Line label={t('totalPayable')} value={r.payable} />
                {Number(r.customer_advances) > 0 && <Line label={t('customerAdvances')} value={r.customer_advances} />}
                {Number(r.supplier_advances) > 0 && <Line label={t('supplierAdvance')} value={r.supplier_advances} />}
              </tbody>
            </table>
          </Card>

          <Card className="print-plain">
            <SectionTitle>{t('cashMovement')}</SectionTitle>
            <table className="tbl">
              <tbody>
                <Line label={t('openingCash')} value={r.cash_opening} />
                <Line label={t('cashIn')} value={r.cash_in} kind="add" />
                <Line label={t('cashOut')} value={r.cash_out} kind="sub" />
                <Line label={t('closingCash')} value={r.cash_closing} kind="total" />
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <div className="space-y-1 text-xs text-stone-500">
        <p>• {t('auditNoteValuation')}</p>
        {Number(r.written_off) > 0 && <p>• {t('auditNoteWrittenOff', { amount: m(r.written_off) })}</p>}
        {r.cash_closing < 0 && <p className="text-amber-700">• {t('auditNoteNegativeCash')}</p>}
        <p>• {t('auditDisclaimer')}</p>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="border-b border-stone-200 px-4 py-3 font-semibold">{children}</div>
}

function Line({ label, value, kind, tone }: { label: string; value: number | null; kind?: 'add' | 'sub' | 'total' | 'grand' | 'info'; tone?: 'red' | 'green' }) {
  const { lang } = useI18n()
  const strong = kind === 'total' || kind === 'grand'
  return (
    <tr className={cx(strong && 'bg-stone-50', kind === 'grand' && 'text-base')}>
      <td className={cx(strong && 'font-semibold')}>
        {kind === 'sub' && <span className="me-1 text-stone-400">−</span>}
        {label}
      </td>
      <td className={cx('r num whitespace-nowrap', strong && 'font-bold', tone === 'red' && 'text-red-700', tone === 'green' && 'text-brand-800')}>
        {value == null ? '' : fmtMoney(value, lang)}
      </td>
    </tr>
  )
}

/** Friendly message when migration 012 has not been run yet */
function migrationHint(e: unknown, t: ReturnType<typeof useI18n>['t']) {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
  return /year_report|year_stock|set_locked_until|audit_log|schema cache|PGRST20/.test(msg) ? t('errRunMigration', { n: '012' }) : errText(e, t)
}

/* ------------------------------------------------------------------ */
/* Registers                                                          */
/* ------------------------------------------------------------------ */
type SaleRow = { id: string; invoice_no: number; sale_date: string; customer_name: string | null; subtotal: number; discount: number; total: number; paid: number; parties: { name: string } | null }
type ReturnRow = { id: string; return_date: string; total: number; refund: number; sales: { invoice_no: number; customer_name: string | null } | null; parties: { name: string } | null }

function SalesRegister({ from, to, period }: PeriodProps) {
  const { t, lang } = useI18n()
  const { org, version } = useOrg()
  const { data, error, loading, reload } = useLoad(async () => {
    const [sales, returns] = await Promise.all([
      fetchAll<SaleRow>((a, b) => supabase.from('sales').select('*, parties(name)')
        .eq('org_id', org.id).gte('sale_date', from).lte('sale_date', to).order('sale_date').order('invoice_no').range(a, b)),
      fetchAll<ReturnRow>((a, b) => supabase.from('sale_returns').select('*, sales(invoice_no, customer_name), parties(name)')
        .eq('org_id', org.id).gte('return_date', from).lte('return_date', to).order('return_date').range(a, b)),
    ])
    return { sales, returns }
  }, [org.id, from, to, version])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null
  const sum = (k: keyof SaleRow) => data.sales.reduce((s, x) => s + Number(x[k] ?? 0), 0)
  const retTotal = data.returns.reduce((s, x) => s + Number(x.total), 0)
  const who = (x: SaleRow) => x.parties?.name ?? x.customer_name ?? t('walkIn')

  const exportCsv = () =>
    downloadCsv(`sales-register-${from}-to-${to}`, [t('date'), t('invoiceNum'), t('customer'), t('subtotal'), t('discount'), t('grandTotal'), t('received'), t('balanceDue')], [
      ...data.sales.map((x) => [x.sale_date, x.invoice_no, who(x), x.subtotal, x.discount, x.total, x.paid, Number(x.total) - Number(x.paid)]),
      ...data.returns.map((r) => [r.return_date, `${t('returnWord')} INV-${r.sales?.invoice_no ?? ''}`, r.parties?.name ?? r.sales?.customer_name ?? t('walkIn'), '', '', -Number(r.total), -Number(r.refund), '']),
      [t('total'), '', '', sum('subtotal'), sum('discount'), sum('total') - retTotal, sum('paid'), sum('total') - sum('paid')],
    ])

  return (
    <RegisterShell title={t('salesRegister')} period={period} onExcel={exportCsv} empty={!data.sales.length && !data.returns.length}>
      <table className="tbl">
        <thead>
          <tr>
            <th>{t('date')}</th><th>{t('invoiceNum')}</th><th>{t('customer')}</th>
            <th className="r">{t('subtotal')}</th><th className="r">{t('discount')}</th><th className="r">{t('grandTotal')}</th>
            <th className="r">{t('received')}</th><th className="r">{t('balanceDue')}</th>
          </tr>
        </thead>
        <tbody>
          {data.sales.map((x) => (
            <tr key={x.id}>
              <td className="num whitespace-nowrap">{fmtDate(x.sale_date, lang)}</td>
              <td className="num">INV-{x.invoice_no}</td>
              <td>{who(x)}</td>
              <td className="r num">{fmtMoney(x.subtotal, lang)}</td>
              <td className="r num">{Number(x.discount) ? fmtMoney(x.discount, lang) : ''}</td>
              <td className="r num font-medium">{fmtMoney(x.total, lang)}</td>
              <td className="r num">{fmtMoney(x.paid, lang)}</td>
              <td className="r num">{Number(x.total) - Number(x.paid) > 0 ? fmtMoney(Number(x.total) - Number(x.paid), lang) : ''}</td>
            </tr>
          ))}
          {data.returns.map((r) => (
            <tr key={r.id} className="text-red-700">
              <td className="num whitespace-nowrap">{fmtDate(r.return_date, lang)}</td>
              <td className="num">{t('returnWord')} INV-{r.sales?.invoice_no}</td>
              <td>{r.parties?.name ?? r.sales?.customer_name ?? t('walkIn')}</td>
              <td /><td />
              <td className="r num">−{fmtMoney(r.total, lang)}</td>
              <td className="r num">{Number(r.refund) ? `−${fmtMoney(r.refund, lang)}` : ''}</td>
              <td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={3}>{t('total')} ({data.sales.length} {t('invoicesWord')})</td>
            <td className="r num">{fmtMoney(sum('subtotal'), lang)}</td>
            <td className="r num">{fmtMoney(sum('discount'), lang)}</td>
            <td className="r num">{fmtMoney(sum('total') - retTotal, lang)}</td>
            <td className="r num">{fmtMoney(sum('paid'), lang)}</td>
            <td className="r num">{fmtMoney(sum('total') - sum('paid'), lang)}</td>
          </tr>
        </tfoot>
      </table>
    </RegisterShell>
  )
}

type PurchaseRow = { id: string; purchase_no: number; purchase_date: string; supplier_name: string | null; reference: string | null; total: number; paid: number; parties: { name: string } | null }

function PurchaseRegister({ from, to, period }: PeriodProps) {
  const { t, lang } = useI18n()
  const { org, version } = useOrg()
  const { data, error, loading, reload } = useLoad(
    () => fetchAll<PurchaseRow>((a, b) => supabase.from('purchases').select('*, parties(name)')
      .eq('org_id', org.id).gte('purchase_date', from).lte('purchase_date', to).order('purchase_date').order('purchase_no').range(a, b)),
    [org.id, from, to, version],
  )
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null
  const total = data.reduce((s, x) => s + Number(x.total), 0)
  const paid = data.reduce((s, x) => s + Number(x.paid), 0)
  const who = (x: PurchaseRow) => x.parties?.name ?? x.supplier_name ?? ''

  const exportCsv = () =>
    downloadCsv(`purchase-register-${from}-to-${to}`, [t('date'), t('purchaseNum'), t('supplier'), t('billRefCol'), t('grandTotal'), t('paidCol'), t('balanceDue')], [
      ...data.map((x) => [x.purchase_date, x.purchase_no, who(x), x.reference, x.total, x.paid, Number(x.total) - Number(x.paid)]),
      [t('total'), '', '', '', total, paid, total - paid],
    ])

  return (
    <RegisterShell title={t('purchaseRegister')} period={period} onExcel={exportCsv} empty={!data.length}>
      <table className="tbl">
        <thead>
          <tr>
            <th>{t('date')}</th><th>{t('purchaseNum')}</th><th>{t('supplier')}</th><th>{t('billRefCol')}</th>
            <th className="r">{t('grandTotal')}</th><th className="r">{t('paidCol')}</th><th className="r">{t('balanceDue')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((x) => (
            <tr key={x.id}>
              <td className="num whitespace-nowrap">{fmtDate(x.purchase_date, lang)}</td>
              <td className="num">#{x.purchase_no}</td>
              <td>{who(x)}</td>
              <td className="num">{x.reference}</td>
              <td className="r num font-medium">{fmtMoney(x.total, lang)}</td>
              <td className="r num">{fmtMoney(x.paid, lang)}</td>
              <td className="r num">{Number(x.total) - Number(x.paid) > 0 ? fmtMoney(Number(x.total) - Number(x.paid), lang) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={4}>{t('total')} ({data.length})</td>
            <td className="r num">{fmtMoney(total, lang)}</td>
            <td className="r num">{fmtMoney(paid, lang)}</td>
            <td className="r num">{fmtMoney(total - paid, lang)}</td>
          </tr>
        </tfoot>
      </table>
    </RegisterShell>
  )
}

type YearStockRow = { product_id: string; opening_qty: number; in_qty: number; out_qty: number; closing_qty: number; opening_value: number; closing_value: number }

function StockRegister({ from, to, period }: PeriodProps) {
  const { t, lang, pick } = useI18n()
  const { org, version } = useOrg()
  const { data, error, loading, reload } = useLoad(async () => {
    const [catalog, rows] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<YearStockRow>((a, b) => supabase.rpc('year_stock', { p_org: org.id, p_from: from, p_to: to }).order('product_id').range(a, b)),
    ])
    const list = rows
      .map((r) => ({ ...r, p: catalog.byId.get(r.product_id) }))
      .filter((r) => r.p && (Number(r.opening_qty) || Number(r.in_qty) || Number(r.out_qty) || Number(r.closing_qty)))
      .sort((a, b) => a.p!.name.localeCompare(b.p!.name) || a.p!.pack_size - b.p!.pack_size)
    return list
  }, [org.id, from, to, version])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{migrationHint(error, t)}</ErrorBox>
  if (!data) return null
  const openV = data.reduce((s, r) => s + Number(r.opening_value), 0)
  const closeV = data.reduce((s, r) => s + Number(r.closing_value), 0)

  const exportCsv = () =>
    downloadCsv(`stock-register-${from}-to-${to}`, [t('product'), t('company'), t('packSize'), t('opening'), t('inLabel'), t('outLabel'), t('closing'), t('openingValue'), t('closingValue')], [
      ...data.map((r) => [r.p!.name, r.p!.company_name, fmtPack(r.p!.pack_size, r.p!.pack_unit), r.opening_qty, r.in_qty, r.out_qty, r.closing_qty, r.opening_value, r.closing_value]),
      [t('total'), '', '', '', '', '', '', openV, closeV],
    ])

  return (
    <RegisterShell title={t('stockRegister')} period={period} onExcel={exportCsv} empty={!data.length} note={t('auditNoteValuation')}>
      <table className="tbl">
        <thead>
          <tr>
            <th>{t('product')}</th><th>{t('packSize')}</th>
            <th className="r">{t('opening')}</th><th className="r">{t('inLabel')}</th><th className="r">{t('outLabel')}</th><th className="r">{t('closing')}</th>
            <th className="r">{t('openingValue')}</th><th className="r">{t('closingValue')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.product_id}>
              <td>
                <div className="font-medium">{pick(r.p!.name, r.p!.name_ur)}</div>
                {r.p!.company_name && <div className="text-xs text-stone-500">{r.p!.company_name}</div>}
              </td>
              <td className="num whitespace-nowrap">{fmtPack(r.p!.pack_size, r.p!.pack_unit, lang)} {t(`pt_${r.p!.pack_type}`)}</td>
              <td className="r num">{fmtNum(r.opening_qty, 3)}</td>
              <td className="r num text-brand-700">{Number(r.in_qty) ? fmtNum(r.in_qty, 3) : ''}</td>
              <td className="r num text-orange-700">{Number(r.out_qty) ? fmtNum(r.out_qty, 3) : ''}</td>
              <td className="r num font-semibold">{fmtNum(r.closing_qty, 3)}</td>
              <td className="r num">{fmtMoney(r.opening_value, lang)}</td>
              <td className="r num font-medium">{fmtMoney(r.closing_value, lang)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={6}>{t('total')} ({data.length})</td>
            <td className="r num">{fmtMoney(openV, lang)}</td>
            <td className="r num">{fmtMoney(closeV, lang)}</td>
          </tr>
        </tfoot>
      </table>
    </RegisterShell>
  )
}

type ExpenseRow = { id: string; entry_date: string; amount: number; note: string | null; created_by_name: string | null }

function ExpensesList({ from, to, period }: PeriodProps) {
  const { t, lang } = useI18n()
  const { org, version } = useOrg()
  const { data, error, loading, reload } = useLoad(
    () => fetchAll<ExpenseRow>((a, b) => supabase.from('cash_entries').select('id, entry_date, amount, note, created_by_name')
      .eq('org_id', org.id).eq('kind', 'expense').gte('entry_date', from).lte('entry_date', to).order('entry_date').range(a, b)),
    [org.id, from, to, version],
  )
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null
  const total = data.reduce((s, x) => s - Number(x.amount), 0)
  const exportCsv = () =>
    downloadCsv(`expenses-${from}-to-${to}`, [t('date'), t('note'), t('amount'), t('by')], [
      ...data.map((x) => [x.entry_date, x.note, -Number(x.amount), x.created_by_name]),
      [t('total'), '', total, ''],
    ])
  return (
    <RegisterShell title={t('expensesList')} period={period} onExcel={exportCsv} empty={!data.length}>
      <table className="tbl">
        <thead><tr><th>{t('date')}</th><th>{t('note')}</th><th className="r">{t('amount')}</th><th>{t('by')}</th></tr></thead>
        <tbody>
          {data.map((x) => (
            <tr key={x.id}>
              <td className="num whitespace-nowrap">{fmtDate(x.entry_date, lang)}</td>
              <td>{x.note}</td>
              <td className="r num font-medium">{fmtMoney(-Number(x.amount), lang)}</td>
              <td className="text-stone-500">{x.created_by_name}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-semibold"><td colSpan={2}>{t('total')} ({data.length})</td><td className="r num">{fmtMoney(total, lang)}</td><td /></tr></tfoot>
      </table>
    </RegisterShell>
  )
}

function RegisterShell({ title, period, onExcel, empty, note, children }: { title: string; period: string; onExcel: () => void; empty: boolean; note?: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      <div className="no-print flex justify-end"><ReportButtons onExcel={onExcel} /></div>
      <PrintHeader title={title} subtitle={period} />
      <Card className="print-plain">
        {empty ? <Empty>{t('noEntries')}</Empty> : <div className="table-wrap">{children}</div>}
      </Card>
      {note && <p className="text-xs text-stone-500">{note}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */
type AuditRow = {
  id: number; at: string; user_name: string | null; table_name: string; action: 'update' | 'delete'
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null
}
const TABLE_KEY: Record<string, TKey> = {
  stock_movements: 'atStock', sales: 'atInvoice', purchases: 'atPurchase', sale_returns: 'atReturn',
  cash_entries: 'atCash', parties: 'atParty', products: 'atProduct', organizations: 'atShop',
}
/** fields that are bookkeeping, not business data */
const HIDDEN = new Set(['id', 'org_id', 'created_at', 'created_by', 'created_by_name', 'invoice_seq', 'purchase_seq', 'batch_id', 'purchase_id', 'sale_id', 'return_id', 'party_id', 'category_id', 'company_id'])

function AuditTrail({ from, to, period }: PeriodProps) {
  const { t, lang, pick } = useI18n()
  const { org, version } = useOrg()
  const [action, setAction] = useState<'' | 'update' | 'delete'>('')
  const { data, error, loading, reload } = useLoad(async () => {
    const [catalog, rows] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<AuditRow>((a, b) => supabase.from('audit_log').select('id, at, user_name, table_name, action, old_data, new_data')
        .eq('org_id', org.id).gte('at', `${from}T00:00:00+05:00`).lt('at', `${addDays(to, 1)}T00:00:00+05:00`).order('at', { ascending: false }).range(a, b)),
    ])
    // product names for stock entries (their batches may be gone)
    const batchIds = [...new Set(rows.map((r) => (r.old_data?.batch_id as string) ?? '').filter(Boolean))]
    const batches = new Map<string, { batch_no: string; product_id: string }>()
    for (let i = 0; i < batchIds.length; i += 200) {
      const { data } = await supabase.from('batches').select('id, batch_no, product_id').in('id', batchIds.slice(i, i + 200))
      for (const b of data ?? []) batches.set(b.id, b)
    }
    return { rows, catalog, batches }
  }, [org.id, from, to, version])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{migrationHint(error, t)}</ErrorBox>
  if (!data) return null
  const rows = data.rows.filter((r) => !action || r.action === action)

  const fmtVal = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v, 3) : String(v))
  /** what the row was: "INV-12", "Purchase #7 · Bill 123", "Bectal 200 ml · Sale -2" */
  const what = (r: AuditRow) => {
    const o = r.old_data ?? {}
    switch (r.table_name) {
      case 'sales': return `INV-${o.invoice_no} · ${fmtMoney(Number(o.total), lang)}`
      case 'purchases': return `#${o.purchase_no}${o.reference ? ` · ${t('billRef', { ref: String(o.reference) })}` : ''} · ${fmtMoney(Number(o.total), lang)}`
      case 'sale_returns': return fmtMoney(Number(o.total), lang)
      case 'cash_entries': return `${t(`ck_${o.kind}` as TKey)} · ${fmtMoney(Math.abs(Number(o.amount)), lang)}${o.note ? ` · ${o.note}` : ''}`
      case 'parties':
      case 'organizations': return String(o.name ?? '')
      case 'products': return `${o.name} ${fmtPack(Number(o.pack_size), o.pack_unit as PackUnit, lang)}`
      case 'stock_movements': {
        const b = data.batches.get(String(o.batch_id))
        const p = b ? data.catalog.byId.get(b.product_id) : undefined
        return [p ? `${pick(p.name, p.name_ur)} ${fmtPack(p.pack_size, p.pack_unit, lang)}` : '', t(`mv_${o.type}` as TKey), fmtNum(Number(o.qty), 3), o.movement_date ? fmtDate(String(o.movement_date), lang) : '', o.reference ? String(o.reference) : '']
          .filter(Boolean).join(' · ')
      }
      default: return ''
    }
  }
  const changes = (r: AuditRow) =>
    r.action === 'update' && r.new_data
      ? Object.keys(r.new_data)
          .filter((k) => !HIDDEN.has(k) && JSON.stringify(r.old_data?.[k]) !== JSON.stringify(r.new_data?.[k]))
          .map((k) => `${k.replace(/_/g, ' ')}: ${fmtVal(r.old_data?.[k])} → ${fmtVal(r.new_data?.[k])}`)
      : []

  const exportCsv = () =>
    downloadCsv(`audit-trail-${from}-to-${to}`, [t('when'), t('by'), t('record'), t('actionCol'), t('details'), t('changes')],
      rows.map((r) => [r.at, r.user_name, t(TABLE_KEY[r.table_name] ?? 'atStock'), r.action === 'delete' ? t('deletedWord') : t('editedWord'), what(r), changes(r).join('; ')]))

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Select value={action} onChange={(e) => setAction(e.target.value as typeof action)} className="w-48" aria-label={t('actionCol')}>
          <option value="">{t('allChanges')}</option>
          <option value="update">{t('editedWord')}</option>
          <option value="delete">{t('deletedWord')}</option>
        </Select>
        <ReportButtons onExcel={exportCsv} />
      </div>
      <PrintHeader title={t('auditTrail')} subtitle={period} />
      <Card className="print-plain">
        {rows.length === 0 ? (
          <Empty>{t('noAuditEntries')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>{t('when')}</th><th>{t('by')}</th><th>{t('record')}</th><th>{t('details')}</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="num whitespace-nowrap">{fmtDateTime(r.at, lang)}</td>
                    <td>{r.user_name || '—'}</td>
                    <td className="whitespace-nowrap">
                      <Badge tone={r.action === 'delete' ? 'red' : 'amber'}>{r.action === 'delete' ? t('deletedWord') : t('editedWord')}</Badge>
                      <div className="mt-1 text-xs text-stone-500">{t(TABLE_KEY[r.table_name] ?? 'atStock')}</div>
                    </td>
                    <td>
                      <div className="font-medium">{what(r)}</div>
                      {changes(r).map((c) => <div key={c} className="num text-xs text-stone-600">{c}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-stone-500">{t('auditTrailNote')}</p>
    </div>
  )
}
