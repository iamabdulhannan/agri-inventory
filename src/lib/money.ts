import type { Lang } from './i18n'

/** "Rs 1,250" / "1,250 روپے" — whole rupees unless there are paisa */
export function fmtMoney(n: number | null | undefined, lang: Lang = 'en'): string {
  const v = Number(n ?? 0)
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  const sign = v < 0 ? '-' : ''
  return lang === 'ur' ? `${sign}${s} روپے` : `${sign}Rs ${s}`
}

/** amount for inputs: "" for 0 */
export const moneyInput = (n: number | null | undefined) => (n ? String(Number(n)) : '')

/** round to paisa */
export const r2 = (n: number) => Math.round(n * 100) / 100
