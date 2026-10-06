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

const short = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/**
 * Big amounts in shop terms: "Rs 1.14 Cr" + "11.4M", "Rs 11.27 Lakh" + "1.13M", "Rs 1.13 Lakh".
 * Returns null below 1 lakh (show the full amount instead).
 */
export function fmtMoneyShort(n: number | null | undefined, lang: Lang = 'en'): { main: string; alt: string | null } | null {
  const v = Number(n ?? 0)
  const a = Math.abs(v)
  if (a < 1e5) return null
  const sign = v < 0 ? '-' : ''
  const [num, word] = a >= 1e7 ? [short(a / 1e7), lang === 'ur' ? 'کروڑ' : 'Cr'] : [short(a / 1e5), lang === 'ur' ? 'لاکھ' : 'Lakh']
  const main = lang === 'ur' ? `${sign}${num} ${word} روپے` : `${sign}Rs ${num} ${word}`
  const alt = a >= 1e6 ? `${sign}${short(a / 1e6)}${lang === 'ur' ? ' ملین' : 'M'}` : null
  return { main, alt }
}
