import type { Lang } from './i18n'

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر']

/** Today as YYYY-MM-DD in the given IANA timezone */
export function todayIn(tz = 'Asia/Karachi'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const parts = (d: string) => d.slice(0, 10).split('-').map(Number) as [number, number, number]

export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export function addDays(d: string, n: number): string {
  const [y, m, day] = parts(d)
  const dt = new Date(Date.UTC(y, m - 1, day + n))
  return dt.toISOString().slice(0, 10)
}

export const monthOf = (d: string) => d.slice(0, 7)
export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return [isoOf(y, m, 1), isoOf(y, m, last)]
}

export function fmtDate(d: string | null | undefined, lang: Lang = 'en'): string {
  if (!d) return '—'
  const [y, m, day] = parts(d)
  return lang === 'ur' ? `${day} ${MONTHS_UR[m - 1]} ${y}` : `${pad(day)} ${MONTHS_EN[m - 1]} ${y}`
}

export function fmtMonth(ym: string, lang: Lang = 'en'): string {
  const [y, m] = ym.split('-').map(Number)
  return `${lang === 'ur' ? MONTHS_UR[m - 1] : MONTHS_EN_LONG[m - 1]} ${y}`
}

export function weekday(d: string, lang: Lang = 'en'): string {
  const [y, m, day] = parts(d)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-US', { weekday: 'short', timeZone: 'UTC' })
}

export function fmtDateTime(ts: string, lang: Lang = 'en'): string {
  return new Date(ts).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function daysBetween(from: string, to: string): number {
  const [a, b, c] = parts(from)
  const [x, y, z] = parts(to)
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / 86400000)
}
