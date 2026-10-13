import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { useOrg } from '../../lib/app'
import { cx } from '../../lib/cx'
import { DUE_PRESETS, dueFromRule } from '../../lib/due'
import { useI18n, type Lang } from '../../lib/i18n'
import { Input } from '../ui'

/** 'date:11-15' -> "15 Nov" */
const dayMonth = (mmdd: string, lang: Lang) =>
  new Date(`2000-${mmdd}T00:00:00`).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'short' })
const isCustomDate = (rule: string) => /^date:\d{2}-\d{2}$/.test(rule) && !DUE_PRESETS.some((p) => p.rule === rule)

/** label of a customer's default due rule ('date:12-31' -> "End of December"), or null */
export function useDueRuleLabel() {
  const { t, lang } = useI18n()
  return (rule: string | null | undefined): string | null => {
    if (!rule) return null
    const p = DUE_PRESETS.find((x) => x.rule === rule)
    if (p) return t(p.key)
    const [kind, val] = rule.split(':')
    if (kind === 'days' && Number(val) > 0) return t('khDaysN', { n: Number(val) })
    if (kind === 'date' && /^\d{2}-\d{2}$/.test(val)) return t('khEveryDate', { date: dayMonth(val, lang) })
    return rule
  }
}

/** Quick-pick chips for "usually pays by": End of December / End of June / 30 / 60 / 90 days / a custom date / None */
export function DueRuleChips({ value, onChange, disabled }: { value: string; onChange: (rule: string) => void; disabled?: boolean }) {
  const { t, lang } = useI18n()
  const { today } = useOrg()
  const custom = isCustomDate(value)
  const [picking, setPicking] = useState(false)
  const items = [...DUE_PRESETS.map((p) => ({ rule: p.rule, label: t(p.key) })), { rule: '', label: t('khDueNone') }]
  const chip = (on: boolean) => cx(
    'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
    on ? 'bg-primary text-white shadow-sm' : 'bg-surface text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50',
  )
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {items.map((it) => (
          <button key={it.rule || 'none'} type="button" role="radio" aria-checked={it.rule === value} disabled={disabled}
            onClick={() => { setPicking(false); onChange(it.rule) }} className={chip(it.rule === value && !picking)}>
            {it.label}
          </button>
        ))}
        {/* any day of the year, repeats every year (e.g. every 15 Nov) */}
        <button type="button" role="radio" aria-checked={custom || picking} disabled={disabled}
          onClick={() => setPicking((v) => !v)} className={chip(custom || picking)}>
          <CalendarDays className="size-4" />
          {custom ? dayMonth(value.slice(5), lang) : t('khCustomDate')}
        </button>
      </div>
      {(picking || custom) && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            className="w-44"
            disabled={disabled}
            value={dueFromRule(custom ? value : null, today) ?? ''}
            onChange={(e) => {
              if (!e.target.value) return
              setPicking(false)
              onChange(`date:${e.target.value.slice(5)}`)
            }}
            aria-label={t('khCustomDate')}
          />
          <span className="text-xs text-stone-500">{t('khCustomDateHint')}</span>
        </div>
      )}
    </div>
  )
}
