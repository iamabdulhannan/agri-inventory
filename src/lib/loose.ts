import type { PackType, PackUnit } from './types'

/**
 * Bags can be sold loose by weight: 12.5 kg from a 50 kg bag = 0.25 bag.
 * Stock is kept in bags with 3 decimals, so the smallest step is bag weight / 1000
 * (50 g for a 50 kg bag).
 */
export type SaleUnit = 'pack' | 'kg'

export const canSellLoose = (p: { pack_type: PackType; pack_unit: PackUnit } | undefined | null) =>
  !!p && p.pack_type === 'bag' && p.pack_unit === 'kg'

const r3 = (n: number) => Math.round(n * 1000) / 1000
const r2 = (n: number) => Math.round(n * 100) / 100

/** kg -> bags (rounded to what the database stores) */
export const kgToPacks = (kg: number, size: number) => r3(kg / size)
/** true when this many kg can be stored exactly in bags */
export const kgFits = (kg: number, size: number) => Math.abs(r3(kg / size) - kg / size) < 1e-9
/** smallest kg step for a bag */
export const kgStep = (size: number) => size / 1000
/** per-kg rate -> per-bag rate */
export const perPack = (ratePerKg: number, size: number) => r2(ratePerKg * size)
/** per-bag rate -> per-kg rate */
export const perKg = (ratePerPack: number, size: number) => r2(ratePerPack / size)
/** bags -> kg for display */
export const packsToKg = (packs: number, size: number) => r3(packs * size)
