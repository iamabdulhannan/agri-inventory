import { ChevronRight, HandCoins } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../lib/app'
import { cx } from '../lib/cx'
import { useLoad } from '../lib/data'
import { daysLeft } from '../lib/due'
import { useI18n } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import { supabase } from '../lib/supabase'
import { Badge } from './ui'

interface Due { party_id: string; name: string; amount: number; due: string }

/**
 * "Who has to pay today": customers whose promised payment date is today, plus those already late.
 * Shown under the header like the expiry bar; hidden when nobody is due.
 */
export function DuesBar() {
  const { org, today, version } = useOrg()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { data } = useLoad(async () => {
    const { data: rows, error } = await supabase.rpc('customer_dues', { p_org: org.id }).lte('due_date', today)
    if (error) return [] // before migration 013: no bar
    // one line per customer: total due, earliest due date
    const by = new Map<string, { amount: number; due: string }>()
    for (const r of (rows ?? []) as { party_id: string; due_date: string; outstanding: number }[]) {
      const cur = by.get(r.party_id)
      if (cur) {
        cur.amount += Number(r.outstanding)
        if (r.due_date < cur.due) cur.due = r.due_date
      } else by.set(r.party_id, { amount: Number(r.outstanding), due: r.due_date })
    }
    if (!by.size) return []
    const { data: parties } = await supabase.from('parties').select('id, name').in('id', [...by.keys()])
    const names = new Map((parties ?? []).map((p) => [p.id as string, p.name as string]))
    // today's first, then the longest late
    return [...by.entries()]
      .map(([party_id, v]) => ({ party_id, name: names.get(party_id) ?? '—', ...v }))
      .sort((a, b) => (a.due === today ? 0 : 1) - (b.due === today ? 0 : 1) || a.due.localeCompare(b.due)) as Due[]
  }, [org.id, today, version])

  if (!data?.length) return null
  const dueToday = data.filter((d) => d.due === today)
  const late = data.filter((d) => d.due < today)
  const sum = (l: Due[]) => l.reduce((s, d) => s + d.amount, 0)

  return (
    <div className={cx('no-print border-b px-4 py-2 lg:px-6', dueToday.length ? 'border-sky-200 bg-sky-100' : 'border-amber-200 bg-amber-50')}>
      <div className="flex items-center gap-3">
        <button onClick={() => nav('/khata?kind=recovery')} className="flex shrink-0 cursor-pointer flex-wrap items-center gap-x-2 text-sm font-semibold">
          <HandCoins className={cx('size-5', dueToday.length ? 'text-sky-800' : 'text-amber-600')} />
          {dueToday.length > 0 && <span className="text-sky-800">{t('duesTodayCount', { n: dueToday.length, amount: fmtMoney(sum(dueToday), lang) })}</span>}
          {dueToday.length > 0 && late.length > 0 && <span className="text-stone-400">·</span>}
          {late.length > 0 && <span className="text-red-700">{t('duesLateCount', { n: late.length, amount: fmtMoney(sum(late), lang) })}</span>}
        </button>
        <div className="hidden min-w-0 flex-1 gap-2 overflow-x-auto md:flex">
          {data.slice(0, 12).map((d) => {
            const left = daysLeft(d.due, today)
            return (
              <button
                key={d.party_id}
                onClick={() => nav(`/khata/${d.party_id}`)}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-xs ring-1 ring-stone-200 hover:ring-stone-400"
              >
                <span className="font-medium">{d.name}</span>
                <span className="num text-stone-600">{fmtMoney(d.amount, lang)}</span>
                <Badge tone={left === 0 ? 'blue' : 'red'}>{left === 0 ? t('duesToday') : t('duesDaysLate', { n: -left })}</Badge>
              </button>
            )
          })}
        </div>
        <button onClick={() => nav('/khata?kind=recovery')} className="ms-auto flex shrink-0 cursor-pointer items-center gap-1 text-sm font-medium text-stone-700 hover:underline">
          {t('viewAll')} <ChevronRight className="size-4 rtl:rotate-180" />
        </button>
      </div>
    </div>
  )
}
