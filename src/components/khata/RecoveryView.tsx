import { MessageCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../lib/app'
import { downloadCsv } from '../../lib/csv'
import { cx } from '../../lib/cx'
import { useLoad } from '../../lib/data'
import { daysLeft } from '../../lib/due'
import { errText } from '../../lib/errors'
import { fmtDate, monthRange } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { DUE_TONE, dueGroupOf, dueText, loadDues, reminderText, waLink, type DueGroup } from '../../lib/khataMoney'
import { fmtMoney } from '../../lib/money'
import type { PartyBalance } from '../../lib/types'
import { PrintHeader, ReportButtons } from '../domain'
import { Badge, Card, Empty, ErrorBox, Loading, Segmented } from '../ui'

type Filter = 'all' | 'overdue' | 'month'

interface Row {
  party: PartyBalance
  total: number
  overdue: number
  soon: number
  /** earliest due date of an unpaid bill */
  due: string | null
  group: DueGroup
  bills: number
}

const GROUPS: { g: DueGroup; key: 'khOverdue' | 'khDue30' | 'khLater' | 'khNoDate'; box: string; head: string }[] = [
  { g: 'overdue', key: 'khOverdue', box: 'border-red-200', head: 'bg-red-50 text-red-800' },
  { g: 'soon', key: 'khDue30', box: 'border-amber-200', head: 'bg-amber-50 text-amber-900' },
  { g: 'later', key: 'khLater', box: 'border-stone-200', head: 'bg-stone-50 text-stone-700' },
  { g: 'none', key: 'khNoDate', box: 'border-stone-200', head: 'bg-stone-50 text-stone-700' },
]

/** Recovery (wasooli): customers who owe money, grouped by due status, with WhatsApp reminders */
export function RecoveryView({ parties, q }: { parties: PartyBalance[]; q: string }) {
  const { t, lang } = useI18n()
  const { org, today, version } = useOrg()
  const nav = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const { data, error, loading, reload } = useLoad(() => loadDues(org.id), [org.id, version])
  const monthEnd = monthRange(today.slice(0, 7))[1]

  const rows = useMemo(() => {
    const byId = new Map(parties.map((p) => [p.id, p]))
    const map = new Map<string, Row>()
    for (const d of data ?? []) {
      const party = byId.get(d.party_id)
      if (!party || d.outstanding <= 0) continue
      const r = map.get(d.party_id) ?? { party, total: 0, overdue: 0, soon: 0, due: null, group: 'none' as DueGroup, bills: 0 }
      r.total += d.outstanding
      r.bills += 1
      if (d.due_date) {
        const n = daysLeft(d.due_date, today)
        if (n < 0) r.overdue += d.outstanding
        else if (n <= 30) r.soon += d.outstanding
        if (!r.due || d.due_date < r.due) r.due = d.due_date
      }
      map.set(d.party_id, r)
    }
    return [...map.values()].map((r) => ({ ...r, group: dueGroupOf(r.due, today) }))
  }, [data, parties, today])

  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0)
  const totals = { overdue: sum((r) => r.overdue), soon: sum((r) => r.soon), all: sum((r) => r.total) }

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return rows
      .filter((r) => (filter === 'overdue' ? r.overdue > 0 : filter === 'month' ? !!r.due && r.due <= monthEnd : true))
      .filter((r) => terms.every((x) => `${r.party.name} ${r.party.phone ?? ''} ${r.party.address ?? ''}`.toLowerCase().includes(x)))
      .sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : 0) || b.total - a.total)
  }, [rows, filter, q, monthEnd])

  const exportCsv = () =>
    downloadCsv('khata-recovery', [t('name'), t('phone'), t('status'), t('khDueDate'), t('khOverdue'), t('khOutstanding')],
      shown.map((r) => [r.party.name, r.party.phone, t(GROUPS.find((g) => g.g === r.group)!.key), r.due, r.overdue, r.total]))

  const remind = (r: Row) =>
    waLink(r.party.phone, reminderText(t, {
      name: r.party.name, shop: org.name, shopPhone: org.phone, amount: fmtMoney(r.total, lang),
      due: r.due, dueLabel: r.due ? fmtDate(r.due, lang) : null, today,
    }))

  return (
    <div>
      <PrintHeader title={`${t('navKhata')} · ${t('khRecovery')}`} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className={cx('rounded-xl border p-4', totals.overdue > 0 ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-surface')}>
          <div className="text-sm text-stone-500">{t('khOverdueTotal')}</div>
          <div className="num text-2xl font-bold text-red-700">{fmtMoney(totals.overdue, lang)}</div>
        </div>
        <div className={cx('rounded-xl border p-4', totals.soon > 0 ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-surface')}>
          <div className="text-sm text-stone-500">{t('khDue30')}</div>
          <div className="num text-2xl font-bold text-amber-800">{fmtMoney(totals.soon, lang)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-surface p-4">
          <div className="text-sm text-stone-500">{t('khTotalOnKhata')}</div>
          <div className="num text-2xl font-bold text-stone-900">{fmtMoney(totals.all, lang)}</div>
        </div>
      </div>

      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: t('all') },
            { value: 'overdue', label: t('khOverdue') },
            { value: 'month', label: t('khThisMonth') },
          ]}
        />
        <ReportButtons onExcel={exportCsv} />
      </div>

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : shown.length === 0 ? (
        <Card><Empty>{rows.length === 0 ? t('khNoDues') : t('khNoMatch')}</Empty></Card>
      ) : (
        <div className="space-y-4">
          {GROUPS.map(({ g, key, box, head }) => {
            const list = shown.filter((r) => r.group === g)
            if (!list.length) return null
            return (
              <section key={g} className={cx('overflow-hidden rounded-xl border bg-surface shadow-sm print-plain', box)}>
                <div className={cx('flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold', head)}>
                  <span>{t(key)} ({list.length})</span>
                  <span className="num">{fmtMoney(list.reduce((s, r) => s + r.total, 0), lang)}</span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {list.map((r) => {
                    const wa = remind(r)
                    return (
                      <li key={r.party.id} className="flex items-center gap-3 px-4 py-3">
                        <button className="min-w-0 flex-1 text-start cursor-pointer" onClick={() => nav(`/khata/${r.party.id}`)}>
                          <div className="truncate font-medium text-stone-900">{r.party.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                            {r.party.phone && <span className="num" dir="ltr">{r.party.phone}</span>}
                            {r.due && <span className="num">{fmtDate(r.due, lang)}</span>}
                            {r.due && r.group !== 'later' && <Badge tone={DUE_TONE[r.group]}>{dueText(r.due, today, t)}</Badge>}
                            {r.bills > 1 && <span>{t('khBillsN', { n: r.bills })}</span>}
                          </div>
                        </button>
                        <div className="shrink-0 text-end">
                          <div className="num text-lg font-bold text-stone-900">{fmtMoney(r.total, lang)}</div>
                          {r.overdue > 0 && r.overdue < r.total - 0.005 && (
                            <div className="num text-xs text-red-700">{t('khOverdueAmount', { amount: fmtMoney(r.overdue, lang) })}</div>
                          )}
                        </div>
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            className="no-print inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-white hover:bg-primary-hover"
                            aria-label={t('khRemind')}
                            title={t('khRemind')}
                          >
                            <MessageCircle className="size-5" /> <span className="hidden sm:inline">{t('khRemind')}</span>
                          </a>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
