import type { Lang } from './i18n'
import type { PackType, PackUnit } from './types'

export const UNITS: PackUnit[] = ['ml', 'l', 'g', 'kg', 'pcs']
export const PACK_TYPES: PackType[] = ['bottle', 'can', 'gallon', 'drum', 'bag', 'packet', 'box', 'piece']

export interface Preset {
  size: number
  unit: PackUnit
}

/** Common pack sizes in agri shops */
export const LIQUID_PRESETS: Preset[] = [
  { size: 100, unit: 'ml' }, { size: 200, unit: 'ml' }, { size: 250, unit: 'ml' }, { size: 400, unit: 'ml' },
  { size: 500, unit: 'ml' }, { size: 800, unit: 'ml' }, { size: 1, unit: 'l' }, { size: 3, unit: 'l' },
  { size: 5, unit: 'l' }, { size: 10, unit: 'l' }, { size: 15, unit: 'l' }, { size: 20, unit: 'l' },
]
export const SOLID_PRESETS: Preset[] = [
  { size: 50, unit: 'g' }, { size: 100, unit: 'g' }, { size: 250, unit: 'g' }, { size: 500, unit: 'g' },
  { size: 1, unit: 'kg' }, { size: 2, unit: 'kg' }, { size: 5, unit: 'kg' }, { size: 10, unit: 'kg' },
  { size: 25, unit: 'kg' }, { size: 50, unit: 'kg' },
]

export type Measure = 'volume' | 'weight' | 'count'
export const measureOf = (u: PackUnit): Measure => (u === 'ml' || u === 'l' ? 'volume' : u === 'g' || u === 'kg' ? 'weight' : 'count')

/** Pack size in base units: ml, g or pieces */
export const baseOf = (size: number, unit: PackUnit) => (unit === 'l' || unit === 'kg' ? size * 1000 : size)

export function suggestPackType(size: number, unit: PackUnit): PackType {
  if (unit === 'ml') return 'bottle'
  if (unit === 'l') return size <= 1 ? 'bottle' : size <= 20 ? 'gallon' : 'drum'
  if (unit === 'g') return 'packet'
  if (unit === 'kg') return size < 5 ? 'packet' : 'bag'
  return 'piece'
}

export function fmtNum(n: number | null | undefined, max = 2): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('en-US', { maximumFractionDigits: max })
}

const UNIT_UR: Record<PackUnit, string> = { ml: 'ملی لیٹر', l: 'لیٹر', g: 'گرام', kg: 'کلو', pcs: 'عدد' }
const UNIT_EN: Record<PackUnit, string> = { ml: 'ml', l: 'L', g: 'g', kg: 'kg', pcs: 'pcs' }

export const unitLabel = (u: PackUnit, lang: Lang) => (lang === 'ur' ? UNIT_UR[u] : UNIT_EN[u])

/** "500 ml", "5 L", "50 kg" */
export const fmtPack = (size: number, unit: PackUnit, lang: Lang = 'en') => `${fmtNum(size, 3)} ${unitLabel(unit, lang)}`

/** Total quantity for a number of packs: 24 × 500 ml => "12 L" */
export function fmtTotal(packs: number, size: number, unit: PackUnit, lang: Lang = 'en'): string {
  const base = Number(packs) * baseOf(Number(size), unit)
  return fmtBase(base, measureOf(unit), lang)
}

export function fmtBase(base: number, m: Measure, lang: Lang = 'en'): string {
  if (m === 'count') return `${fmtNum(base)} ${unitLabel('pcs', lang)}`
  const big = m === 'volume' ? 'l' : 'kg'
  const small = m === 'volume' ? 'ml' : 'g'
  if (Math.abs(base) >= 1000) return `${fmtNum(base / 1000)} ${unitLabel(big, lang)}`
  return `${fmtNum(base)} ${unitLabel(small, lang)}`
}

/** Add up base quantities across products by measure (liters vs kg) */
export function totalsByMeasure<T>(rows: T[], get: (r: T) => { packs: number; size: number; unit: PackUnit }) {
  const t = { volume: 0, weight: 0, count: 0 }
  for (const r of rows) {
    const { packs, size, unit } = get(r)
    t[measureOf(unit)] += Number(packs) * baseOf(Number(size), unit)
  }
  return t
}
