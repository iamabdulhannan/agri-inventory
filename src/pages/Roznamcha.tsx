import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, NotebookPen, Receipt as ReceiptIcon, Trash2, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrintHeader, ReportButtons } from '../components/domain'
import { ReceiptModal } from '../components/Receipt'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Tabs, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { downloadCsv } from '../lib/csv'
import { cx } from '../lib/cx'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { addDays, fmtDate, fmtMonth, monthOf, monthRange, weekday } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import { supabase } from '../lib/supabase'
import type { CashDay, CashKind } from '../lib/types'
import { CASH_SELECT, describeCash, loadCashItems, type CashEntryFull } from '../lib/cashDetail'

const MANUAL: CashKind[] = ['expense', 'cash_in', 'cash_out']
const TONE: Record<CashKind, 'green' | 'red' | 'amber' | 'blue' | 'stone' | 'orange'> = {
  sale: 'green', receipt: 'green', cash_in: 'blue', purchase: 'orange', payment: 'orange', expense: 'red', cash_out: 'stone',
}

export function Roznamcha() {
  const { t } = useI18n()
  const [view, setView] = useState<'day' | 'month'>('day')
  const [adding, setAdding] = useState<CashKind | null>(null)
  const { refresh } = useOrg()
  const { toast } = useFeedback()
  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><NotebookPen className="size-6 text-brand-700" /> {t('roznamchaTitle')}</span>}
        actions={
          <>
            <Button variant="danger" onClick={() => setAdding('expense')}><ReceiptIcon className="size-4" /> {t('addExpense')}</Button>
            <Button variant="secondary" onClick={() => setAdding('cash_in')}><ArrowDownCircle className="size-4" /> {t('addCashIn')}</Button>
            <Button variant="secondary" onClick={() => setAdding('cash_out')}><ArrowUpCircle className="size-4" /> {t('addCashOut')}</Button>
          </>
        }
      />
      <Tabs value={view} onChange={setView} items={[{ value: 'day', label: t('dayView') }, { value: 'month', label: t('monthView') }]} />
      {view === 'day' ? <DayView /> : <MonthView onOpenDay={() => setView('day')} />}
      <CashEntryModal kind={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); toast(t('saved')); refresh() }} />
    </div>
  )
}

let dayFromMonth: string | null = null

function DayView() {
  const { t, lang, pick } = useI18n()
  const { org, today, version, isAdmin, refresh } = useOrg()
  const { toast, confirm } = useFeedback()
  const nav = useNavigate()
  const [day, setDay] = useState(() => {
    const d = dayFromMonth ?? today
    dayFromMonth = null
    return d
  })
  const [receipt, setReceipt] = useState<string | null>(null)

  const { data, error, loading, reload } = useLoad(async () => {
    const [sum, entries] = await Promise.all([
      supabase.rpc('cash_days', { p_org: org.id, p_from: day, p_to: day }),
      fetchAll<CashEntryFull>((a, b) =>
        supabase.from('cash_entries').select(CASH_SELECT).eq('org_id', org.id).eq('entry_date', day).order('created_at').range(a, b),
      ),
    ])
    if (sum.error) throw sum.error
    const items = await loadCashItems(entries)
    return { sum: (sum.data as CashDay[])[0], entries, items }
  }, [org.id, day, version])

  const del = async (e: CashEntryFull) => {
    if (!(await confirm(`${t('delete')}?`))) return
    const { error } = await supabase.from('cash_entries').delete().eq('id', e.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('deleted'))
    refresh()
  }

  const exportCsv = () =>
    data && downloadCsv(`roznamcha-${day}`, [t('type'), t('party'), t('detail'), t('cashIn'), t('cashOut'), t('by')],
      data.entries.map((e) => { const x = describeCash(e, data.items, t, lang, pick); return [t(`ck_${e.kind}`), x.party, x.detail, e.amount > 0 ? e.amount : '', e.amount < 0 ? -e.amount : '', e.created_by_name] }))

  return (
    <div className="space-y-4">
      <Card className="no-print p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('date')}>
            <div className="flex items-center gap-1">
              <Button variant="secondary" onClick={() => setDay(addDays(day, -1))} aria-label="previous"><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
              <Input type="date" className="w-44" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
              <Button variant="secondary" onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label="next"><ChevronRight className="size-4 rtl:rotate-180" /></Button>
              {day !== today && <Button variant="ghost" onClick={() => setDay(today)}>{t('today')}</Button>}
            </div>
          </Field>
          <div className="ms-auto flex gap-2"><ReportButtons onExcel={exportCsv} /></div>
        </div>
      </Card>
      <PrintHeader title={t('roznamchaTitle')} subtitle={`${fmtDate(day, lang)} (${weekday(day, lang)})`} />

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : data && (
        <>
          {Number(data.sum?.closing ?? 0) < 0 && (
            <div className="no-print flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Wallet className="mt-0.5 size-4 shrink-0" /> {t('negativeCashHint')}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={t('openingCash')} value={fmtMoney(data.sum?.opening ?? 0, lang)} icon={<Wallet className="size-5" />} />
            <Tile label={t('cashIn')} value={fmtMoney(data.sum?.cash_in ?? 0, lang)} tone="green" icon={<ArrowDownCircle className="size-5" />} />
            <Tile label={t('cashOut')} value={fmtMoney(data.sum?.cash_out ?? 0, lang)} tone="red" icon={<ArrowUpCircle className="size-5" />} />
            <Tile label={t('closingCash')} value={fmtMoney(data.sum?.closing ?? 0, lang)} strong icon={<Wallet className="size-5" />} />
          </div>
          <Card className="print-plain">
            {data.entries.length === 0 ? <Empty>{t('noCashEntries')}</Empty> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t('type')}</th>
                      <th>{t('party')}</th>
                      <th>{t('detail')}</th>
                      <th className="r">{t('cashIn')}</th>
                      <th className="r">{t('cashOut')}</th>
                      <th>{t('by')}</th>
                      {isAdmin && <th className="no-print" />}
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e) => (
                      <tr
                        key={e.id}
                        className={cx((e.sale_id || e.party_id) && 'cursor-pointer')}
                        onClick={() => (e.sale_id ? setReceipt(e.sale_id) : e.party_id ? nav(`/khata/${e.party_id}`) : undefined)}
                      >
                        <td><Badge tone={TONE[e.kind]}>{t(`ck_${e.kind}`)}</Badge></td>
                        <td className="font-medium">{describeCash(e, data.items, t, lang, pick).party}</td>
                        <td className="max-w-md text-stone-600">{describeCash(e, data.items, t, lang, pick).detail}</td>
                        <td className="r num font-medium text-brand-700">{e.amount > 0 ? fmtMoney(e.amount, lang) : ''}</td>
                        <td className="r num font-medium text-red-700">{e.amount < 0 ? fmtMoney(-e.amount, lang) : ''}</td>
                        <td className="text-stone-500">{e.created_by_name}</td>
                        {isAdmin && (
                          <td className="no-print r" onClick={(ev) => ev.stopPropagation()}>
                            {MANUAL.includes(e.kind) && (
                              <Button size="sm" variant="ghost" onClick={() => del(e)} aria-label={t('delete')}><Trash2 className="size-4 text-red-600" /></Button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>{t('total')}</td>
                      <td className="r num">{fmtMoney(data.sum?.cash_in ?? 0, lang)}</td>
                      <td className="r num">{fmtMoney(data.sum?.cash_out ?? 0, lang)}</td>
                      <td colSpan={isAdmin ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      <ReceiptModal saleId={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}

function MonthView({ onOpenDay }: { onOpenDay: () => void }) {
  const { t, lang } = useI18n()
  const { org, today, version } = useOrg()
  const [month, setMonth] = useState(monthOf(today))
  const [from, last] = monthRange(month)
  const to = last > today ? today : last
  const { data, error, loading, reload } = useLoad(async () => {
    if (from > today) return [] as CashDay[]
    const { data, error } = await supabase.rpc('cash_days', { p_org: org.id, p_from: from, p_to: to })
    if (error) throw error
    return data as CashDay[]
  }, [org.id, from, to, version])

  const rows = (data ?? []).filter((r) => Number(r.cash_in) || Number(r.cash_out))
  const tin = rows.reduce((s, r) => s + Number(r.cash_in), 0)
  const tout = rows.reduce((s, r) => s + Number(r.cash_out), 0)
  const exportCsv = () => downloadCsv(`roznamcha-${month}`, [t('date'), t('openingCash'), t('cashIn'), t('cashOut'), t('closingCash')], rows.map((r) => [r.day, r.opening, r.cash_in, r.cash_out, r.closing]))

  return (
    <div className="space-y-4">
      <Card className="no-print p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('month')}><Input type="month" className="w-44" value={month} max={monthOf(today)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
          <div className="ms-auto flex gap-2"><ReportButtons onExcel={exportCsv} /></div>
        </div>
      </Card>
      <PrintHeader title={t('roznamchaTitle')} subtitle={fmtMonth(month, lang)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : (
        <Card className="print-plain">
          {rows.length === 0 ? <Empty>{t('noData')}</Empty> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th className="r">{t('openingCash')}</th>
                    <th className="r">{t('cashIn')}</th>
                    <th className="r">{t('cashOut')}</th>
                    <th className="r">{t('closingCash')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.day} className="cursor-pointer" onClick={() => { dayFromMonth = r.day.slice(0, 10); onOpenDay() }}>
                      <td className="num whitespace-nowrap">{fmtDate(r.day, lang)} <span className="text-xs text-stone-400">{weekday(r.day, lang)}</span></td>
                      <td className="r num">{fmtMoney(r.opening, lang)}</td>
                      <td className="r num text-brand-700">{fmtMoney(r.cash_in, lang)}</td>
                      <td className="r num text-red-700">{fmtMoney(r.cash_out, lang)}</td>
                      <td className="r num font-semibold">{fmtMoney(r.closing, lang)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t('total')}</td>
                    <td className="r num">{fmtMoney(rows[0]?.opening ?? 0, lang)}</td>
                    <td className="r num">{fmtMoney(tin, lang)}</td>
                    <td className="r num">{fmtMoney(tout, lang)}</td>
                    <td className="r num">{fmtMoney(rows.at(-1)?.closing ?? 0, lang)}</td>
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

function Tile({ label, value, icon, tone, strong }: { label: string; value: string; icon: ReactNode; tone?: 'green' | 'red'; strong?: boolean }) {
  return (
    <div className={cx('rounded-xl border border-stone-200 bg-surface p-4 shadow-sm', strong && 'border-brand-200 bg-brand-50')}>
      <div className="flex items-center gap-2 text-sm text-stone-500">{icon} {label}</div>
      <div className={cx('num mt-1 text-xl font-bold', tone === 'green' && 'text-brand-700', tone === 'red' && 'text-red-700')}>{value}</div>
    </div>
  )
}

function CashEntryModal({ kind, onClose, onSaved }: { kind: CashKind | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { org, today } = useOrg()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<CashKind | null>(null)
  if (kind !== last) {
    setLast(kind)
    if (kind) {
      setAmount('')
      setDate(today)
      setNote('')
      setError('')
    }
  }
  const save = async () => {
    if (!kind) return
    setError('')
    const n = Number(amount)
    if (!(n > 0)) return setError(t('errInvalidAmount'))
    if (date > today) return setError(t('errInvalidDate'))
    setBusy(true)
    const { error } = await supabase.from('cash_entries').insert({ org_id: org.id, entry_date: date, kind, amount: kind === 'cash_in' ? n : -n, note: note.trim() || null })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }
  const hint = kind === 'expense' ? t('expenseHint') : kind === 'cash_in' ? t('cashInHint') : t('cashOutHint')
  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      size="sm"
      title={kind ? t(`ck_${kind}`) : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('amount')} required>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('detail')} hint={hint}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label={t('date')}>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}
