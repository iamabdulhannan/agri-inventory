import { fmtPack } from './units'
import type { PackUnit } from './types'

/**
 * Product search that follows what you type:
 *   1. name starts with it            "e"  -> Emamectin, Eminent ...
 *   2. a word of the name starts with it  "ben" -> Emamectin Benzoate
 *   3. Urdu name, company, pack size ("500", "1l"), then category / notes
 * Every word typed must match somewhere; results are ordered best match first.
 * One or two letters only match the start of words, so "e" doesn't match "Insecticide".
 */
interface Searchable {
  name: string
  name_ur?: string | null
  company_name?: string | null
  pack_size: number
  pack_unit: PackUnit
  category_name?: string | null
  notes?: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
/** words of a text: letters/digits, keeping "1.9" and "50%" together */
const words = (s: string | null | undefined) => norm(s).split(/[^\p{L}\p{N}.%]+/u).filter(Boolean)
export const searchTerms = (q: string) => words(q)

function termScore(p: Searchable, term: string): number {
  const name = norm(p.name)
  if (name.startsWith(term)) return 100
  if (words(p.name).some((w) => w.startsWith(term))) return 80
  if (p.name_ur && (norm(p.name_ur).startsWith(term) || words(p.name_ur).some((w) => w.startsWith(term)))) return 75
  if (term.length >= 2 && name.replace(/[^\p{L}\p{N}]/gu, '').includes(term.replace(/[^\p{L}\p{N}]/gu, ''))) return 30
  if (words(p.company_name).some((w) => w.startsWith(term))) return 40
  const pack = `${fmtPack(p.pack_size, p.pack_unit)} ${p.pack_size}${p.pack_unit}`
  if (words(pack).some((w) => w.startsWith(term))) return 35
  if (term.length >= 3 && norm(p.company_name).includes(term)) return 20
  const other = `${p.category_name ?? ''} ${p.notes ?? ''}`
  if (term.length >= 2 && words(other).some((w) => w.startsWith(term))) return 10
  if (term.length >= 3 && norm(other).includes(term)) return 5
  return 0
}

/** Matching products, best first (ties keep the list's own order: name, then pack size) */
export function searchProducts<T extends Searchable>(list: T[], q: string): T[] {
  const terms = searchTerms(q)
  if (!terms.length) return list
  const scored: { p: T; s: number; i: number }[] = []
  list.forEach((p, i) => {
    let s = 0
    for (const term of terms) {
      const ts = termScore(p, term)
      if (!ts) return
      s += ts
    }
    scored.push({ p, s, i })
  })
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p)
}

/** Where to highlight the typed text inside a label: [start, end) of the best match, or null */
export function matchRange(text: string, q: string): [number, number] | null {
  const lower = norm(text)
  for (const term of searchTerms(q)) {
    // prefer the start of a word
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'u')
    const m = re.exec(lower)
    if (m) {
      const start = m.index + m[1].length
      return [start, start + term.length]
    }
    const i = term.length >= 2 ? lower.indexOf(term) : -1
    if (i >= 0) return [i, i + term.length]
  }
  return null
}
