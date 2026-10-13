import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOrg } from '../../lib/app'
import { cx } from '../../lib/cx'
import { daysBetween } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { Badge, Select } from '../ui'

/** One plain sentence explaining what a section is for */
export function Explain({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600 ring-1 ring-inset ring-stone-200', className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-stone-400" />
      <span>{children}</span>
    </p>
  )
}

/** "Due in 5 days" / "Due today" / "3 days late" for a cheque date */
export function ChequeDueBadge({ date }: { date: string }) {
  const { t } = useI18n()
  const { today } = useOrg()
  const d = daysBetween(today, date)
  if (d < 0) return <Badge tone="red">{t('bankDaysLate', { n: -d })}</Badge>
  if (d === 0) return <Badge tone="amber">{t('bankDueToday')}</Badge>
  return <Badge tone={d <= 7 ? 'amber' : 'stone'}>{t('bankDueIn', { n: d })}</Badge>
}

/** Days until a facility's expiry / repay-by date: amber within 60 days, red when passed */
export function ExpiryDays({ date }: { date: string }) {
  const { t } = useI18n()
  const { today } = useOrg()
  const d = daysBetween(today, date)
  if (d < 0) return <Badge tone="red">{t('bankOverdueDays', { n: -d })}</Badge>
  if (d === 0) return <Badge tone="red">{t('bankEndsToday')}</Badge>
  return <Badge tone={d <= 60 ? 'amber' : 'green'}>{t('daysLeft', { n: d })}</Badge>
}

/** Simple used-of-limit bar */
export function Meter({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'amber' | 'red' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : value > 0 ? 100 : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100 ring-1 ring-inset ring-stone-200" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div
        className={cx('h-full rounded-full', tone === 'red' ? 'bg-red-600' : tone === 'amber' ? 'bg-amber-500' : 'bg-brand-600')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Small label + big number block */
export function Figure({ label, children, tone, className }: { label: ReactNode; children: ReactNode; tone?: 'red' | 'amber' | 'green'; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="truncate text-xs text-stone-500">{label}</div>
      <div className={cx('num truncate text-lg font-bold', tone === 'red' && 'text-red-700', tone === 'amber' && 'text-amber-800', tone === 'green' && 'text-brand-700')}>{children}</div>
    </div>
  )
}

/** Select with a "none" first option */
export function SelectNone({ value, onChange, none, options }: { value: string; onChange: (v: string) => void; none: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  )
}
