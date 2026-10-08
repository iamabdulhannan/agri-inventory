import type { PackType, PackUnit } from './types'

/**
 * Bags can be sold loose by weight: 10 kg from a 60 kg bag = 0.166667 bag.
 * Stock is kept in bags with 6 decimals; kg can be entered to the gram (3 decimals).
 */
export type SaleUnit = 'pack' | 'kg'

export const canSellLoose = (p: { pack_type: PackType; pack_unit: PackUnit } | undefined | null) =>
  !!p && p.pack_type === 'bag' && p.pack_unit === 'kg'

const r3 = (n: number) => Math.round(n * 1000) / 1000
const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const r2 = (n: number) => Math.round(n * 100) / 100

/** kg -> bags (rounded to what the database stores) */
export const kgToPacks = (kg: number, size: number) => r6(kg / size)
/** kg is entered to the gram at most (3 decimals) */
export const kgFits = (kg: number) => Math.abs(Math.round(kg * 1000) - kg * 1000) < 1e-6
/** rounding left over from loose sales (a millionth of a bag) is not real stock */
export const DUST = 1e-5
/** more than is available, ignoring rounding dust */
export const exceeds = (packs: number, available: number) => packs - available > DUST
/** per-kg rate -> per-bag rate */
export const perPack = (ratePerKg: number, size: number) => r2(ratePerKg * size)
/** per-bag rate -> per-kg rate */
export const perKg = (ratePerPack: number, size: number) => r2(ratePerPack / size)
/** bags -> kg for display */
export const packsToKg = (packs: number, size: number) => r3(packs * size)
