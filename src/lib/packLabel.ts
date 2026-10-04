import { useI18n } from './i18n'
import type { PackType, PackUnit } from './types'
import { fmtPack } from './units'

/** Returns a formatter for pack labels like "500 ml Bottle" in the current language */
export function usePackLabel() {
  const { t, lang } = useI18n()
  return (p: { pack_size: number; pack_unit: PackUnit; pack_type: PackType }) => `${fmtPack(p.pack_size, p.pack_unit, lang)} ${t(`pt_${p.pack_type}`)}`
}
