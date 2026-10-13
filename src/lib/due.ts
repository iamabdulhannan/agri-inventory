import { addDays } from './format'

/**
 * Promised payment date for credit sales.
 * A customer can have a default rule (parties.due_rule):
 *   'days:90'    -> 90 days after the sale
 *   'date:12-31' -> the next 31 December (on or after the sale date)
 *   null         -> no default
 */
export type DueRule = string | null

export function dueFromRule(rule: DueRule | undefined, saleDate: string): string | null {
  if (!rule) return null
  const [kind, val] = rule.split(':')
  if (kind === 'days' && Number(val) > 0) return addDays(saleDate, Number(val))
  if (kind === 'date' && /^\d{2}-\d{2}$/.test(val)) {
    const y = Number(saleDate.slice(0, 4))
    const d = `${y}-${val}`
    return d >= saleDate ? d : `${y + 1}-${val}`
  }
  return null
}

/** Quick picks shown on the sale screen and the customer form */
export const DUE_PRESETS: { rule: string; key: 'dueEndDec' | 'dueEndJun' | 'due30' | 'due60' | 'due90' }[] = [
  { rule: 'date:12-31', key: 'dueEndDec' },
  { rule: 'date:06-30', key: 'dueEndJun' },
  { rule: 'days:30', key: 'due30' },
  { rule: 'days:60', key: 'due60' },
  { rule: 'days:90', key: 'due90' },
]

/** days until the due date (negative = overdue) */
export const daysLeft = (due: string, today: string) => Math.round((Date.parse(due) - Date.parse(today)) / 86400000)
