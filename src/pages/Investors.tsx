import { ArrowLeft, Banknote, HandCoins, PackagePlus, Pencil, Plus, Scale, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccountPicker } from '../components/AccountPicker'
import { PrintHeader, ProductName, ProductPicker, ReportButtons } from '../components/domain'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Tabs, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { downloadCsv } from '../lib/csv'
import { cx } from '../lib/cx'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate, fmtMonth, monthOf, monthRange } from '../lib/format'
import { useI18n, type TKey } from '../lib/i18n'
import {
  investorStatus, loadInvestors, type DailyProfit, type InvestorEntry, type InvestorRow, type InvestorStatus, type LotStatus, type Settlement,
} from '../lib/investors'
import { fmtMoney, r2 } from '../lib/money'
import { supabase } from '../lib/supabase'
import { fmtNum, fmtPack } from '../lib/units'

const STATUS: Record<InvestorStatus, { key: TKey; tone: 'amber' | 'green' | 'blue' | 'stone' }> = {
  selling: { key: 'invStatusSelling', tone: 'amber' },
  ready: { key: 'invStatusReady', tone: 'green' },
  idle: { key: 'invStatusIdle', tone: 'blue' },
  empty: { key: 'invStatusEmpty', tone: 'stone' },
}

/** errors of an investor action; migration 015 not run yet -> say so */
function useErr() {
  const { t } = useI18n()
  return (e: unknown) => {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
    return /investor|schema cache|PGRST20/.test(msg) && !/INVESTOR_/.test(msg) ? t('errRunMigration', { n: '015' }) : errText(e, t)
  }
}

function Figure({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'green' | 'red' | 'blue' }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-surface p-4 shadow-sm">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={cx('num mt-1 text-xl font-bold', tone === 'green' && 'text-brand-800', tone === 'red' && 'text-red-700', tone === 'blue' && 'text-sky-800')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </div>
  )
}

const statusText = (r: InvestorRow, t: ReturnType<typeof useI18n>['t']) => {
  const st = investorStatus(r)
  return t(STATUS[st].key, { n: fmtNum(r.units_left, 3) })
}

// ===================================================================== list
export function InvestorsList() {
  const { t, lang } = useI18n()
  const { org, version, isAdmin, refresh } = useOrg()
  const nav = useNavigate()
  const errOf = useErr()
  const [adding, setAdding] = useState(false)
  const { data, error, loading, reload } = useLoad(() => loadInvestors(org.id), [org.id, version])

  if (!isAdmin) return <Empty>{t('auditAdminOnly')}</Empty>
  const list = data ?? []
  const tot = list.reduce((s, r) => ({ capital: s.capital + r.capital, stock: s.stock + r.stock_cost, profit: s.profit + r.profit_now, avail: s.avail + r.available }), { capital: 0, stock: 0, profit: 0, avail: 0 })
  const m = (v: number) => fmtMoney(v, lang)

  const exportCsv = () =>
    downloadCsv('investors', [t('name'), t('invShare'), t('invCapital'), t('invInStock'), t('invProfitSoFar'), t('invAvailable'), t('invPaidOut'), t('status')],
      list.map((r) => [r.name, r.profit_share, r.capital, r.stock_cost, r.profit_now, r.available, r.total_paid_out, statusText(r, t)]))

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><HandCoins className="size-6 text-brand-700" /> {t('invTitle')}</span>}
        subtitle={t('invSubtitle')}
        actions={<>
          <ReportButtons onExcel={exportCsv} />
          <Button onClick={() => setAdding(true)}><Plus className="size-4" /> {t('invAdd')}</Button>
        </>}
      />
      <PrintHeader title={t('invTitle')} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errOf(error)}</ErrorBox> : (
        <>
          {list.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label={t('invTotalCapital')} value={m(tot.capital)} />
              <Figure label={t('invTotalStock')} value={m(tot.stock)} />
              <Figure label={t('invTotalProfit')} value={m(tot.profit)} tone={tot.profit < 0 ? 'red' : 'green'} />
              <Figure label={t('invTotalAvailable')} value={m(tot.avail)} tone="blue" />
            </div>
          )}
          <Card className="print-plain">
            {list.length === 0 ? (
              <Empty>
                {t('invNone')}
                <Button className="mt-2" onClick={() => setAdding(true)}><Plus className="size-4" /> {t('invAdd')}</Button>
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t('name')}</th>
                      <th className="r">{t('invCapital')}</th>
                      <th className="r">{t('invInStock')}</th>
                      <th className="r">{t('invProfitSoFar')}</th>
                      <th className="r">{t('invAvailable')}</th>
                      <th>{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const st = investorStatus(r)
                      return (
                        <tr key={r.id} className={cx('cursor-pointer', !r.is_active && 'opacity-60')} onClick={() => nav(`/investors/${r.id}`)}>
                          <td>
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-stone-500">{t('invShareShort', { n: fmtNum(r.profit_share) })}{r.phone ? ` · ${r.phone}` : ''}</div>
                          </td>
                          <td className="r num font-medium">{m(r.capital)}</td>
                          <td className="r num">{m(r.stock_cost)}</td>
                          <td className={cx('r num font-semibold', r.profit_now < 0 ? 'text-red-700' : 'text-brand-700')}>{m(r.profit_now)}</td>
                          <td className="r num text-sky-800">{m(r.available)}</td>
                          <td><Badge tone={STATUS[st].tone}>{statusText(r, t)}</Badge></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      <InvestorForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); refresh(); nav(`/investors/${id}`) }} />
    </div>
  )
}

// ===================================================================== add / edit
function InvestorForm({ open, investor, onClose, onSaved }: { open: boolean; investor?: InvestorRow; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useI18n()
  const { org, today } = useOrg()
  const { toast } = useFeedback()
  const errOf = useErr()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [share, setShare] = useState('50')
  const [note, setNote] = useState('')
  const [capital, setCapital] = useState('')
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [last, setLast] = useState<boolean | null>(null)
  if (open !== last) {
    setLast(open)
    if (open) {
      setName(investor?.name ?? ''); setPhone(investor?.phone ?? ''); setShare(String(investor?.profit_share ?? 50))
      setNote(investor?.note ?? ''); setCapital(''); setAccount(''); setErr('')
    }
  }

  const save = async () => {
    setErr('')
    const pct = Number(share)
    if (!name.trim()) return setErr(t('invName'))
    if (!(pct >= 0 && pct <= 100)) return setErr(t('invShareHint'))
    setBusy(true)
    const row = { name: name.trim(), phone: phone.trim() || null, profit_share: pct, note: note.trim() || null }
    const res = investor
      ? await supabase.from('investors').update(row).eq('id', investor.id).select('id').single()
      : await supabase.from('investors').insert({ ...row, org_id: org.id }).select('id').single()
    if (res.error) { setBusy(false); return setErr(errOf(res.error)) }
    const id = res.data.id as string
    if (!investor && Number(capital) > 0) {
      const { error } = await supabase.rpc('investor_deposit', { p_org: org.id, p_investor: id, p_date: today, p_amount: Number(capital), p_account: account || null, p_note: null })
      if (error) { setBusy(false); toast(errOf(error), 'err'); return onSaved(id) }
    }
    setBusy(false)
    toast(t('saved'))
    onSaved(id)
  }

  return (
    <Modal open={open} onClose={onClose} title={investor ? t('invEdit') : t('invAdd')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button onClick={save} loading={busy}>{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('invName')} required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t('phone')} optional><Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" /></Field>
        <Field label={t('invShare')} required hint={t('invShareHint')} className="sm:col-span-2">
          <Input type="number" min="0" max="100" step="any" value={share} onChange={(e) => setShare(e.target.value)} className="w-32" />
        </Field>
        {!investor && (<>
          <Field label={t('invFirstCapital')} optional><Input type="number" min="0" step="any" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} /></Field>
          <Field label={t('accountLabel')}><AccountPicker value={account} onChange={setAccount} /></Field>
        </>)}
        <Field label={t('note')} optional className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
    </Modal>
  )
}

// ===================================================================== detail
type Tab = 'stock' | 'daily' | 'history'

export function InvestorDetail() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const { org, version, isAdmin, refresh } = useOrg()
  const errOf = useErr()
  const [tab, setTab] = useState<Tab>('stock')
  const [dialog, setDialog] = useState<null | 'capital' | 'stock' | 'withdraw' | 'settle' | 'edit'>(null)
  const { data, error, loading, reload } = useLoad(async () => {
    const [all, lots] = await Promise.all([
      loadInvestors(org.id),
      fetchAll<LotStatus>((a, b) => supabase.from('investor_lot_status').select('*').eq('investor_id', id).order('entry_date', { ascending: false }).range(a, b)),
    ])
    return { inv: all.find((x) => x.id === id) ?? null, lots: lots.map((l) => ({ ...l, qty: +l.qty, unit_cost: +l.unit_cost, sold: +l.sold, left_qty: +l.left_qty, revenue: +l.revenue, gross_profit: +l.gross_profit })) }
  }, [org.id, id, version])

  if (!isAdmin) return <Empty>{t('auditAdminOnly')}</Empty>
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errOf(error)}</ErrorBox>
  if (!data?.inv) return <Empty>{t('errNotFound')}</Empty>
  const r = data.inv
  const m = (v: number) => fmtMoney(v, lang)
  const st = investorStatus(r)
  const done = () => { setDialog(null); refresh() }

  return (
    <div className="space-y-4">
      <Link to="/investors" className="no-print inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t('invTitle')}
      </Link>
      <PageHeader
        title={r.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone="green">{t('invShareShort', { n: fmtNum(r.profit_share) })}</Badge>
          {r.phone && <span className="num">{r.phone}</span>}
          <Badge tone={STATUS[st].tone}>{statusText(r, t)}</Badge>
        </span>}
        actions={<>
          <Button onClick={() => setDialog('capital')}><Banknote className="size-4" /> {t('invAddCapital')}</Button>
          <Button variant="secondary" onClick={() => setDialog('stock')}><PackagePlus className="size-4" /> {t('invAddStock')}</Button>
          <Button variant="secondary" onClick={() => setDialog('withdraw')} disabled={r.profit_now <= 0}><Wallet className="size-4" /> {t('invWithdrawProfit')}</Button>
          <Button variant={st === 'ready' ? 'warning' : 'secondary'} onClick={() => setDialog('settle')} disabled={st === 'empty'}><Scale className="size-4" /> {t('invSettle')}</Button>
          <Button variant="ghost" onClick={() => setDialog('edit')} aria-label={t('edit')}><Pencil className="size-4" /></Button>
        </>}
      />
      <PrintHeader title={`${t('invTitle')} · ${r.name}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={t('invCapital')} value={m(r.capital)} sub={r.total_paid_out ? `${t('invPaidOut')}: ${m(r.total_paid_out)}` : undefined} />
        <Figure label={t('invInStock')} value={m(r.stock_cost)} sub={r.units_left > 0 ? t('invUnitsLeft', { n: fmtNum(r.units_left, 3) }) : undefined} />
        <Figure label={t('invProfitSoFar')} value={m(r.profit_now)} tone={r.profit_now < 0 ? 'red' : 'green'}
          sub={r.open_gross ? `${t('invGross')}: ${m(r.open_gross)} · ${t('invShopShare')}: ${m(r.open_gross - r.open_profit)}` : undefined} />
        <Figure label={t('invAvailable')} value={m(r.available)} tone="blue" />
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { value: 'stock', label: t('invTabStock') },
        { value: 'daily', label: t('invTabDaily') },
        { value: 'history', label: t('invTabHistory') },
      ]} />
      {tab === 'stock' && <LotsTable lots={data.lots} share={r.profit_share} />}
      {tab === 'daily' && <DailyTable investor={r} />}
      {tab === 'history' && <HistoryTable investor={r} />}

      <MoneyDialog kind="capital" open={dialog === 'capital'} investor={r} onClose={() => setDialog(null)} onDone={done} />
      <MoneyDialog kind="withdraw" open={dialog === 'withdraw'} investor={r} onClose={() => setDialog(null)} onDone={done} />
      <StockDialog open={dialog === 'stock'} investor={r} onClose={() => setDialog(null)} onDone={done} />
      <SettleDialog open={dialog === 'settle'} investor={r} onClose={() => setDialog(null)} onDone={done} />
      <InvestorForm open={dialog === 'edit'} investor={r} onClose={() => setDialog(null)} onSaved={done} />
    </div>
  )
}

function LotsTable({ lots, share }: { lots: LotStatus[]; share: number }) {
  const { t, lang, pick } = useI18n()
  const m = (v: number) => fmtMoney(v, lang)
  if (!lots.length) return <Card><Empty>{t('invNoStock')}</Empty></Card>
  const tot = lots.reduce((s, l) => ({ cost: s.cost + l.qty * l.unit_cost, rev: s.rev + l.revenue, gp: s.gp + l.gross_profit }), { cost: 0, rev: 0, gp: 0 })
  return (
    <Card className="print-plain">
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('product')}</th>
              <th className="r">{t('invBought')}</th>
              <th className="r">{t('invRate')}</th>
              <th className="r">{t('invCost')}</th>
              <th className="r">{t('invSold')}</th>
              <th className="r">{t('invLeft')}</th>
              <th className="r">{t('invRevenue')}</th>
              <th className="r">{t('invProfit')}</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id}>
                <td>
                  <div className="font-medium">{pick(l.product_name, l.product_name_ur)} <span className="num text-brand-800">{fmtPack(l.pack_size, l.pack_unit, lang)}</span></div>
                  <div className="text-xs text-stone-500">{[l.company_name, fmtDate(l.entry_date, lang)].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="r num">{fmtNum(l.qty, 3)}</td>
                <td className="r num">{m(l.unit_cost)}</td>
                <td className="r num">{m(l.qty * l.unit_cost)}</td>
                <td className="r num text-orange-700">{l.sold ? fmtNum(l.sold, 3) : ''}</td>
                <td className={cx('r num font-semibold', l.left_qty <= 0.000001 && 'text-stone-400')}>{fmtNum(l.left_qty, 3)}</td>
                <td className="r num">{l.revenue ? m(l.revenue) : ''}</td>
                <td className={cx('r num font-medium', l.gross_profit < 0 ? 'text-red-700' : 'text-brand-700')}>{l.revenue || l.gross_profit ? m(l.gross_profit) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t('total')}</td>
              <td className="r num">{m(tot.cost)}</td>
              <td colSpan={2} />
              <td className="r num">{m(tot.rev)}</td>
              <td className={cx('r num', tot.gp < 0 ? 'text-red-700' : 'text-brand-700')}>{m(tot.gp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-4 pb-3 text-xs text-stone-500">{t('invGross')} · {t('invShareShort', { n: fmtNum(share) })}</p>
    </Card>
  )
}

function DailyTable({ investor }: { investor: InvestorRow }) {
  const { t, lang } = useI18n()
  const { org, today, version } = useOrg()
  const [month, setMonth] = useState(monthOf(today))
  const [from, to] = monthRange(month)
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.rpc('investor_daily', { p_org: org.id, p_investor: investor.id, p_from: from, p_to: to })
    if (error) throw error
    return ((data ?? []) as DailyProfit[]).map((d) => ({ ...d, qty: +d.qty, revenue: +d.revenue, cost: +d.cost, gross_profit: +d.gross_profit, investor_profit: +d.investor_profit }))
  }, [org.id, investor.id, from, to, version])
  const m = (v: number) => fmtMoney(v, lang)
  const rows = data ?? []
  const tot = rows.reduce((s, d) => ({ rev: s.rev + d.revenue, cost: s.cost + d.cost, gp: s.gp + d.gross_profit, inv: s.inv + d.investor_profit }), { rev: 0, cost: 0, gp: 0, inv: 0 })
  const max = Math.max(1, ...rows.map((d) => Math.abs(d.gross_profit)))

  return (
    <Card className="print-plain">
      <div className="no-print flex flex-wrap items-end gap-3 border-b border-stone-200 p-4">
        <Field label={t('month')}><Input type="month" className="w-44" value={month} max={monthOf(today)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
        <div className="ms-auto">
          <ReportButtons onExcel={() => downloadCsv(`investor-${investor.name}-${month}`, [t('date'), t('qty'), t('invRevenue'), t('invCost'), t('invProfit'), t('invHisPart')],
            rows.map((d) => [d.day, d.qty, d.revenue, d.cost, d.gross_profit, d.investor_profit]))} />
        </div>
      </div>
      <PrintHeader title={`${investor.name} · ${t('invTabDaily')}`} subtitle={fmtMonth(month, lang)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : rows.length === 0 ? <Empty>{t('invNoSales')}</Empty> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('date')}</th>
                <th className="r">{t('qty')}</th>
                <th className="r">{t('invRevenue')}</th>
                <th className="r">{t('invCost')}</th>
                <th className="r">{t('invProfit')}</th>
                <th className="r">{t('invHisPart')}</th>
                <th className="no-print w-40" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.day}>
                  <td className="num whitespace-nowrap">{fmtDate(d.day, lang)}</td>
                  <td className="r num">{fmtNum(d.qty, 3)}</td>
                  <td className="r num">{m(d.revenue)}</td>
                  <td className="r num">{m(d.cost)}</td>
                  <td className={cx('r num font-medium', d.gross_profit < 0 ? 'text-red-700' : 'text-brand-700')}>{m(d.gross_profit)}</td>
                  <td className={cx('r num font-semibold', d.investor_profit < 0 ? 'text-red-700' : 'text-brand-800')}>{m(d.investor_profit)}</td>
                  <td className="no-print">
                    <div className="h-2 rounded-full bg-stone-100">
                      <div className={cx('h-2 rounded-full', d.gross_profit < 0 ? 'bg-red-500' : 'bg-primary')} style={{ width: `${(Math.abs(d.gross_profit) / max) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{t('total')}</td>
                <td className="r num">{m(tot.rev)}</td>
                <td className="r num">{m(tot.cost)}</td>
                <td className={cx('r num', tot.gp < 0 ? 'text-red-700' : 'text-brand-700')}>{m(tot.gp)}</td>
                <td className={cx('r num', tot.inv < 0 ? 'text-red-700' : 'text-brand-800')}>{m(tot.inv)}</td>
                <td className="no-print" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}

function HistoryTable({ investor }: { investor: InvestorRow }) {
  const { t, lang } = useI18n()
  const { org, version } = useOrg()
  const { data, error, loading, reload } = useLoad(async () => {
    const [e, s] = await Promise.all([
      supabase.from('investor_entries').select('*').eq('org_id', org.id).eq('investor_id', investor.id).order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('investor_settlements').select('*').eq('org_id', org.id).eq('investor_id', investor.id),
    ])
    if (e.error) throw e.error
    if (s.error) throw s.error
    return { entries: (e.data ?? []) as InvestorEntry[], settlements: new Map(((s.data ?? []) as Settlement[]).map((x) => [x.id, x])) }
  }, [org.id, investor.id, version])
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data?.entries.length) return <Card><Empty>{t('invNoHistory')}</Empty></Card>
  const m = (v: number) => fmtMoney(v, lang)
  const tone: Record<InvestorEntry['kind'], 'blue' | 'green' | 'stone' | 'orange' | 'red'> = {
    deposit: 'blue', profit: 'green', reinvest: 'stone', withdraw_profit: 'orange', withdraw_capital: 'red',
  }
  return (
    <Card className="print-plain">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('date')}</th><th>{t('type')}</th><th>{t('details')}</th><th className="r">{t('amount')}</th><th>{t('by')}</th></tr></thead>
          <tbody>
            {data.entries.map((e) => {
              const s = e.settlement_id ? data.settlements.get(e.settlement_id) : undefined
              return (
                <tr key={e.id}>
                  <td className="num whitespace-nowrap">{fmtDate(e.entry_date, lang)}</td>
                  <td><Badge tone={e.kind === 'profit' && Number(e.amount) < 0 ? 'red' : tone[e.kind]}>{t(`ie_${e.kind}`)}</Badge></td>
                  <td className="text-sm text-stone-600">
                    {e.kind === 'profit' && s ? t('invBooking', { gross: m(+s.gross_profit), inv: m(+s.investor_profit), shop: m(+s.shop_profit) }) : e.note}
                  </td>
                  <td className={cx('r num font-semibold', Number(e.amount) < 0 && 'text-red-700')}>{m(+e.amount)}</td>
                  <td className="text-stone-500">{e.created_by_name}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ===================================================================== actions
/** Add capital / withdraw part of the profit */
function MoneyDialog({ kind, open, investor, onClose, onDone }: { kind: 'capital' | 'withdraw'; open: boolean; investor: InvestorRow; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { toast, confirm } = useFeedback()
  const errOf = useErr()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [account, setAccount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [last, setLast] = useState<boolean | null>(null)
  const max = r2(investor.profit_now)
  if (open !== last) {
    setLast(open)
    if (open) { setAmount(kind === 'withdraw' && max > 0 ? String(max) : ''); setDate(today); setAccount(''); setNote(''); setErr('') }
  }
  const save = async () => {
    setErr('')
    const n = Number(amount)
    if (!(n > 0)) return setErr(t('errInvalidAmount'))
    if (kind === 'withdraw' && n > max + 0.005) return setErr(t('errInvestorNoProfit'))
    if (kind === 'withdraw' && !(await confirm(`${t('invWithdrawProfit')}: ${fmtMoney(n, lang)} · ${investor.name}?`))) return
    setBusy(true)
    const { error } = kind === 'capital'
      ? await supabase.rpc('investor_deposit', { p_org: org.id, p_investor: investor.id, p_date: date, p_amount: n, p_account: account || null, p_note: note || null })
      : await supabase.rpc('settle_investor', { p_org: org.id, p_investor: investor.id, p_mode: 'withdraw_some', p_date: date, p_account: account || null, p_amount: n, p_note: note || null })
    setBusy(false)
    if (error) return setErr(errOf(error))
    toast(t('saved'))
    onDone()
  }
  return (
    <Modal open={open} onClose={onClose} title={kind === 'capital' ? t('invAddCapital') : t('invWithdrawProfit')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button onClick={save} loading={busy}>{t('save')}</Button></>}>
      {kind === 'withdraw' && (
        <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm">
          <div className="font-semibold text-brand-800">{t('invProfitAvailable', { amount: fmtMoney(max, lang) })}</div>
          <div className="text-xs text-stone-600">{t('invWithdrawHint')}</div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('amount')} required><Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label={t('date')}><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={kind === 'capital' ? t('accountLabel') : t('invPayFrom')}><AccountPicker value={account} onChange={setAccount} /></Field>
        <Field label={t('note')} optional><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
    </Modal>
  )
}

/** Put some of the shop's current stock in his name */
function StockDialog({ open, investor, onClose, onDone }: { open: boolean; investor: InvestorRow; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useI18n()
  const { org, today, version } = useOrg()
  const { toast } = useFeedback()
  const errOf = useErr()
  const { data: cat } = useLoad(() => (open ? loadCatalog(org.id) : Promise.resolve(null)), [org.id, version, open])
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [last, setLast] = useState<boolean | null>(null)
  if (open !== last) { setLast(open); if (open) { setProductId(''); setQty(''); setRate(''); setErr('') } }
  const p = cat?.byId.get(productId)
  const cost = (Number(qty) || 0) * (Number(rate) || 0)
  const save = async () => {
    setErr('')
    if (!productId) return setErr(t('errChooseProduct'))
    if (!(Number(qty) > 0)) return setErr(t('errQty'))
    if (!(Number(rate) >= 0) || rate === '') return setErr(t('errInvalidPrice'))
    setBusy(true)
    const { error } = await supabase.rpc('assign_investor_stock', { p_org: org.id, p_investor: investor.id, p_product: productId, p_qty: Number(qty), p_unit_cost: Number(rate), p_date: today, p_purchase: null, p_note: null })
    setBusy(false)
    if (error) return setErr(errOf(error))
    toast(t('saved'))
    onDone()
  }
  return (
    <Modal open={open} onClose={onClose} title={t('invAddStock')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button onClick={save} loading={busy}>{t('save')}</Button></>}>
      <p className="mb-3 text-sm text-stone-600">{t('invAddStockHint')}</p>
      <div className="space-y-3">
        <ProductPicker products={(cat?.products ?? []).filter((x) => x.qty > 0)} value={productId}
          onChange={(id) => { setProductId(id); const pp = cat?.byId.get(id); setRate(pp && Number(pp.purchase_price) > 0 ? String(Number(pp.purchase_price)) : '') }} />
        {p && <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm"><ProductName p={p} /></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('qtyPacks')} required><Input type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label={t('purchasePrice')} required hint={cost > 0 ? `= ${fmtMoney(cost, lang)}` : undefined}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </div>
        <div className={cx('text-sm', cost > investor.available + 0.005 ? 'text-red-700' : 'text-stone-600')}>{t('invAvailable')}: <b className="num">{fmtMoney(investor.available, lang)}</b></div>
      </div>
      {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
    </Modal>
  )
}

/** One-go settlement: reinvest everything / take profit, keep capital / withdraw everything */
function SettleDialog({ open, investor, onClose, onDone }: { open: boolean; investor: InvestorRow; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { toast, confirm } = useFeedback()
  const errOf = useErr()
  type Mode = 'reinvest_all' | 'withdraw_profit' | 'withdraw_all'
  const [mode, setMode] = useState<Mode>('withdraw_profit')
  const [date, setDate] = useState(today)
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [last, setLast] = useState<boolean | null>(null)
  if (open !== last) { setLast(open); if (open) { setMode('withdraw_profit'); setDate(today); setAccount(''); setErr('') } }
  const m = (v: number) => fmtMoney(v, lang)
  const P = r2(investor.profit_now)
  const C = r2(investor.capital)
  const unsold = investor.units_left > 0.000001

  const options: { mode: Mode; title: string; text: string; pays: number }[] = [
    { mode: 'reinvest_all', title: t('invOptReinvest'), text: t('invOptReinvestText', { amount: m(C + P) }), pays: 0 },
    {
      mode: 'withdraw_profit', title: t('invOptProfit'),
      text: P >= 0 ? t('invOptProfitText', { profit: m(P), capital: m(C) }) : t('invOptLossText', { loss: m(-P), capital: m(C + P) }),
      pays: Math.max(P, 0),
    },
    { mode: 'withdraw_all', title: t('invOptAll'), text: t('invOptAllText', { amount: m(Math.max(C + P, 0)) }), pays: Math.max(C + P, 0) },
  ]
  const chosen = options.find((o) => o.mode === mode)!

  const save = async () => {
    setErr('')
    if (!(await confirm(`${chosen.title}: ${investor.name}${chosen.pays ? ` · ${m(chosen.pays)}` : ''}?`))) return
    setBusy(true)
    const { error } = await supabase.rpc('settle_investor', { p_org: org.id, p_investor: investor.id, p_mode: mode, p_date: date, p_account: account || null, p_amount: null, p_note: null })
    setBusy(false)
    if (error) return setErr(errOf(error))
    toast(t('invSettleDone'))
    onDone()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('invSettleTitle', { name: investor.name })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button onClick={save} loading={busy} disabled={unsold}>{t('invSettle')}</Button></>}>
      {unsold ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">{t('invSettleLocked', { n: fmtNum(investor.units_left, 3) })}</div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-stone-50 p-3"><div className="text-stone-500">{t('invCapital')}</div><div className="num text-lg font-bold">{m(C)}</div></div>
            <div className="rounded-lg bg-brand-50 p-3"><div className="text-stone-500">{t('invProfitSoFar')}</div><div className={cx('num text-lg font-bold', P < 0 ? 'text-red-700' : 'text-brand-800')}>{m(P)}</div></div>
          </div>
          <p className="mb-2 text-sm text-stone-600">{t('invSettleIntro')}</p>
          <div className="space-y-2" role="radiogroup">
            {options.map((o) => (
              <button key={o.mode} type="button" role="radio" aria-checked={mode === o.mode} onClick={() => setMode(o.mode)}
                className={cx('w-full cursor-pointer rounded-xl border p-3 text-start transition-colors', mode === o.mode ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/20' : 'border-stone-200 hover:bg-stone-50')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{o.title}</span>
                  {o.pays > 0 && <span className="num text-sm font-semibold text-orange-700">− {m(o.pays)}</span>}
                </div>
                <div className="mt-0.5 text-sm text-stone-600">{o.text}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {chosen.pays > 0 && <Field label={t('invPayFrom')}><AccountPicker value={account} onChange={setAccount} /></Field>}
            <Field label={t('date')}><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        </>
      )}
      {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
    </Modal>
  )
}
