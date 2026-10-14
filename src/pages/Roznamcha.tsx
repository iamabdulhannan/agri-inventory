import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, NotebookPen, Receipt as ReceiptIcon, Trash2, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AccountPicker } from '../components/AccountPicker'
import { PrintHeader, ReportButtons } from '../components/domain'
import { ReceiptModal } from '../components/Receipt'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Tabs, useFeedback } from '../components/ui'
import { useAccounts, type MoneyAccount } from '../lib/accounts'
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
import { CASH_SELECT, canDeleteCash, cashType, describeCash, loadCashItems, loadTransferPeers, type CashEntryFull, type PayMethod } from '../lib/cashDetail'

/** Which book is open: cash in hand ('') or a bank account / wallet */
interface Book { id: string; account: MoneyAccount | null; name: string }

/** Labels for the book: "Opening cash" for cash in hand, "Opening balance" for an account */
function useBookLabels(book: Book) {
  const { t } = useI18n()
  return book.id
    ? { open: t('bankRzOpening'), in: t('bankRzIn'), out: t('bankRzOut'), close: t('bankRzClosing') }
    : { open: t('openingCash'), in: t('cashIn'), out: t('cashOut'), close: t('closingCash') }
}

export function Roznamcha() {
  const { t } = useI18n()
  const [view, setView] = useState<'day' | 'month'>('day')
  const [adding, setAdding] = useState<CashKind | null>(null)
  const { refresh } = useOrg()
  const { toast } = useFeedback()
  const { data: accounts } = useAccounts()
  const [params, setParams] = useSearchParams()
  const id = params.get('account') ?? ''
  const account = accounts?.find((a) => a.id === id) ?? null
  const book: Book = { id, account, name: id ? account?.name ?? '' : t('cashInHandOpt') }
  const setBook = (v: string) => setParams(v ? { account: v } : {}, { replace: true })
  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><NotebookPen className="size-6 text-brand-700" /> {t('roznamchaTitle')}{id && book.name ? <span className="text-stone-500">· {book.name}</span> : null}</span>}
        actions={
          <>
            <Button variant="danger" onClick={() => setAdding('expense')}><ReceiptIcon className="size-4" /> {t('addExpense')}</Button>
            <Button variant="secondary" onClick={() => setAdding('cash_in')}><ArrowDownCircle className="size-4" /> {t('addCashIn')}</Button>
            <Button variant="secondary" onClick={() => setAdding('cash_out')}><ArrowUpCircle className="size-4" /> {t('addCashOut')}</Button>
          </>
        }
      />
      {((accounts ?? []).length > 0 || id) && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-stone-600">{t('accountLabel')}:</span>
          <AccountPicker value={id} onChange={setBook} className="w-full sm:w-72" />
        </div>
      )}
      <Tabs value={view} onChange={setView} items={[{ value: 'day', label: t('dayView') }, { value: 'month', label: t('monthView') }]} />
      {view === 'day' ? <DayView book={book} /> : <MonthView book={book} onOpenDay={() => setView('day')} />}
      <CashEntryModal kind={adding} book={book} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); toast(t('saved')); refresh() }} />
    </div>
  )
}

let dayFromMonth: string | null = null

function DayView({ book }: { book: Book }) {
  const { t, lang, pick } = useI18n()
  const L = useBookLabels(book)
  const { data: accounts } = useAccounts()
  const accountName = (id: string | null) => (id ? accounts?.find((a) => a.id === id)?.name ?? '' : t('cashInHandOpt'))
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
      supabase.rpc('cash_days', { p_org: org.id, p_from: day, p_to: day, ...(book.id ? { p_account: book.id } : {}) }),
      fetchAll<CashEntryFull>((a, b) => {
        const q = supabase.from('cash_entries').select(CASH_SELECT).eq('org_id', org.id).eq('entry_date', day)
        return (book.id ? q.eq('account_id', book.id) : q.is('account_id', null)).order('created_at').range(a, b)
      }),
    ])
    if (sum.error) throw sum.error
    const [items, peers] = await Promise.all([loadCashItems(entries), loadTransferPeers(entries)])
    return { sum: (sum.data as CashDay[])[0], entries, items, peers }
  }, [org.id, day, version, book.id])

  const ctx = { peers: data?.peers ?? new Map<string, string | null>(), accountName }
  const describe = (e: CashEntryFull) => describeCash(e, data?.items ?? new Map(), t, lang, pick, ctx)

  const del = async (e: CashEntryFull) => {
    const text = e.transfer_id
      ? t('bankRzDeleteTransfer', {
          from: e.amount < 0 ? accountName(e.account_id ?? null) : accountName(ctx.peers.get(e.id) ?? null),
          to: e.amount < 0 ? accountName(ctx.peers.get(e.id) ?? null) : accountName(e.account_id ?? null),
        })
      : `${t('delete')}?`
    if (!(await confirm(text))) return
    const { error } = await supabase.from('cash_entries').delete().eq('id', e.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('deleted'))
    refresh()
  }

  const exportCsv = () =>
    data && downloadCsv(`roznamcha-${book.id ? `${book.name}-` : ''}${day}`, [t('type'), t('party'), t('detail'), L.in, L.out, t('by')],
      data.entries.map((e) => { const x = describe(e); return [cashType(e, t).label, x.party, x.detail, e.amount > 0 ? e.amount : '', e.amount < 0 ? -e.amount : '', e.created_by_name] }))

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
      <PrintHeader title={book.id ? `${t('roznamchaTitle')} · ${book.name}` : t('roznamchaTitle')} subtitle={`${fmtDate(day, lang)} (${weekday(day, lang)})`} />

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : data && (
        <>
          {!book.id && Number(data.sum?.closing ?? 0) < 0 && (
            <div className="no-print flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Wallet className="mt-0.5 size-4 shrink-0" /> {t('negativeCashHint')}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={L.open} value={fmtMoney(data.sum?.opening ?? 0, lang)} icon={<Wallet className="size-5" />} />
            <Tile label={L.in} value={fmtMoney(data.sum?.cash_in ?? 0, lang)} tone="green" icon={<ArrowDownCircle className="size-5" />} />
            <Tile label={L.out} value={fmtMoney(data.sum?.cash_out ?? 0, lang)} tone="red" icon={<ArrowUpCircle className="size-5" />} />
            <Tile label={L.close} value={fmtMoney(data.sum?.closing ?? 0, lang)} strong icon={<Wallet className="size-5" />} />
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
                      <th className="r">{L.in}</th>
                      <th className="r">{L.out}</th>
                      <th>{t('by')}</th>
                      {isAdmin && <th className="no-print" />}
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e) => {
                      const x = describe(e)
                      const type = cashType(e, t)
                      const open = e.sale_id ? () => setReceipt(e.sale_id!)
                        : e.cheque_id ? () => nav('/bank?tab=cheques')
                          : e.facility_id ? () => nav('/bank?tab=finance')
                            : (e as { investor_id?: string | null }).investor_id && isAdmin ? () => nav(`/investors/${(e as { investor_id?: string | null }).investor_id}`)
                            : e.party_id ? () => nav(`/khata/${e.party_id}`)
                              : undefined
                      // method badge only when it differs from the book (e.g. a cheque in a bank account)
                      const usual: PayMethod = book.account?.kind ?? 'cash'
                      return (
                      <tr key={e.id} className={cx(open && 'cursor-pointer')} onClick={open}>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <Badge tone={type.tone}>{type.label}</Badge>
                            {e.method && e.method !== usual && <Badge tone="stone">{t(`bankM_${e.method}`)}</Badge>}
                          </div>
                        </td>
                        <td className="font-medium">{x.party}</td>
                        <td className="max-w-md text-stone-600">{x.detail}</td>
                        <td className="r num font-medium text-brand-700">{e.amount > 0 ? fmtMoney(e.amount, lang) : ''}</td>
                        <td className="r num font-medium text-red-700">{e.amount < 0 ? fmtMoney(-e.amount, lang) : ''}</td>
                        <td className="text-stone-500">{e.created_by_name}</td>
                        {isAdmin && (
                          <td className="no-print r" onClick={(ev) => ev.stopPropagation()}>
                            {canDeleteCash(e) && (
                              <Button size="sm" variant="ghost" onClick={() => del(e)} aria-label={t('delete')}><Trash2 className="size-4 text-red-600" /></Button>
                            )}
                          </td>
                        )}
                      </tr>
                      )
                    })}
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

function MonthView({ book, onOpenDay }: { book: Book; onOpenDay: () => void }) {
  const { t, lang } = useI18n()
  const L = useBookLabels(book)
  const { org, today, version } = useOrg()
  const [month, setMonth] = useState(monthOf(today))
  const [from, last] = monthRange(month)
  const to = last > today ? today : last
  const { data, error, loading, reload } = useLoad(async () => {
    if (from > today) return [] as CashDay[]
    const { data, error } = await supabase.rpc('cash_days', { p_org: org.id, p_from: from, p_to: to, ...(book.id ? { p_account: book.id } : {}) })
    if (error) throw error
    return data as CashDay[]
  }, [org.id, from, to, version, book.id])

  const rows = (data ?? []).filter((r) => Number(r.cash_in) || Number(r.cash_out))
  const tin = rows.reduce((s, r) => s + Number(r.cash_in), 0)
  const tout = rows.reduce((s, r) => s + Number(r.cash_out), 0)
  const exportCsv = () => downloadCsv(`roznamcha-${book.id ? `${book.name}-` : ''}${month}`, [t('date'), L.open, L.in, L.out, L.close], rows.map((r) => [r.day, r.opening, r.cash_in, r.cash_out, r.closing]))

  return (
    <div className="space-y-4">
      <Card className="no-print p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('month')}><Input type="month" className="w-44" value={month} max={monthOf(today)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
          <div className="ms-auto flex gap-2"><ReportButtons onExcel={exportCsv} /></div>
        </div>
      </Card>
      <PrintHeader title={book.id ? `${t('roznamchaTitle')} · ${book.name}` : t('roznamchaTitle')} subtitle={fmtMonth(month, lang)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : (
        <Card className="print-plain">
          {rows.length === 0 ? <Empty>{t('noData')}</Empty> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th className="r">{L.open}</th>
                    <th className="r">{L.in}</th>
                    <th className="r">{L.out}</th>
                    <th className="r">{L.close}</th>
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

function CashEntryModal({ kind, book, onClose, onSaved }: { kind: CashKind | null; book: Book; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { org, today } = useOrg()
  const { data: accounts } = useAccounts()
  const [account, setAccount] = useState('')
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
      // the open book, unless it is a closed (inactive) account
      setAccount(book.account?.is_active ? book.id : '')
    }
  }
  const save = async () => {
    if (!kind) return
    setError('')
    const n = Number(amount)
    if (!(n > 0)) return setError(t('errInvalidAmount'))
    if (date > today) return setError(t('errInvalidDate'))
    setBusy(true)
    const acc = account ? accounts?.find((a) => a.id === account) : null
    const { error } = await supabase.from('cash_entries').insert({
      org_id: org.id, entry_date: date, kind, amount: kind === 'cash_in' ? n : -n, note: note.trim() || null,
      account_id: acc?.id ?? null, method: acc?.kind ?? 'cash',
    })
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
        {(accounts ?? []).some((a) => a.is_active) && (
          <Field label={kind === 'cash_in' ? t('bankRzInto') : t('bankRzPaidFrom')}>
            <AccountPicker value={account} onChange={setAccount} />
          </Field>
        )}
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
