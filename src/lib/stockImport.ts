import Papa from 'papaparse'
import type { TKey } from './i18n'
import type { BatchStock, PackUnit, ProductStock } from './types'
import { baseOf, fmtPack, measureOf } from './units'

export type Cell = string | number | boolean | Date | null | undefined

/** Column titles we recognise (lower-case, punctuation removed) */
const HEADERS = {
  product: ['product', 'product name', 'item', 'item name', 'name', 'brand', 'brand name'],
  company: ['company', 'manufacturer', 'brand company', 'company name'],
  size: ['pack size', 'size', 'pack', 'packing size', 'packing'],
  unit: ['unit', 'uom'],
  batch: ['batch', 'batch no', 'batch number', 'batch #', 'lot', 'lot no', 'lot number'],
  mfg: ['mfg', 'mfg date', 'manufacturing date', 'mfd', 'manufactured', 'manufacture date'],
  expiry: ['expiry', 'expiry date', 'exp', 'exp date', 'expire', 'expires', 'expiration', 'expiration date'],
  qty: ['qty', 'quantity', 'packs', 'opening qty', 'opening stock', 'stock', 'quantity packs'],
  rate: ['rate', 'purchase rate', 'cost', 'purchase price', 'net rate', 'price', 'unit cost'],
  category: ['category', 'type', 'product type'],
  id: ['product id', 'id'],
} as const
type Col = keyof typeof HEADERS

export interface Issue { key: TKey; vars?: Record<string, string | number> }

export interface ImportRow {
  row: number // row number in the sheet (1-based, as Excel shows it)
  productText: string
  sizeText: string
  product?: ProductStock
  /** not in the product list: will be created from the sheet (name, company, size, rate, category) */
  create?: { name: string; company: string; size: number; unit: PackUnit; category: string }
  batch_no: string
  mfg_date: string | null
  expiry_date: string | null
  qty: number | null
  rate: number | null
  errors: Issue[]
  warnings: Issue[]
}

export interface ImportResult {
  rows: ImportRow[]
  skipped: number // rows with no quantity (e.g. untouched template lines)
  missingColumns: Col[]
}

// ---------------------------------------------------------------- reading files
export async function readFileRows(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    return (await readSheet(file)) as unknown as Cell[][]
  }
  if (name.endsWith('.xls')) throw new Error('OLD_XLS')
  const text = (await file.text()).replace(/^﻿/, '')
  const res = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
  return res.data
}

// ---------------------------------------------------------------- value parsing
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.%#]+/g, ' ').trim().replace(/\s+/g, ' ')
/** names compared without spaces / punctuation: "Bectal 1.9% EC" == "bectal 1.9%ec" */
export const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9.%+]/g, '')
const str = (v: Cell) => (v == null ? '' : v instanceof Date ? '' : String(v).trim())

export function parseNumber(v: Cell): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/,/g, '').replace(/rs\.?/i, '').trim()
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const year = (y: number) => (y < 100 ? 2000 + y : y)

/**
 * Accepts Excel dates, 2028-06-30, 30/06/2028, 30-06-2028, 30.06.2028, 30-Jun-2028,
 * Jun-2028, 06/2028 (= last day of month). d/m/y is assumed (Pakistan), unless the
 * first number can only be a month.
 */
export function parseDate(v: Cell): string | null | undefined {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) ?? undefined
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      // Excel serial day number
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) ?? undefined
    }
    return undefined
  }
  const s = String(v).trim().toLowerCase()
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]) ?? undefined
  if ((m = s.match(/^(\d{1,2})[-/. ]([a-z]{3})[a-z]*[-/. ,]+(\d{2,4})$/))) {
    const mo = MONTHS.indexOf(m[2]) + 1
    return mo ? iso(year(+m[3]), mo, +m[1]) ?? undefined : undefined
  }
  if ((m = s.match(/^([a-z]{3})[a-z]*[-/. ,]+(\d{2,4})$/))) {
    const mo = MONTHS.indexOf(m[1]) + 1
    return mo ? iso(year(+m[2]), mo, lastDay(year(+m[2]), mo)) ?? undefined : undefined
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    let d = +m[1], mo = +m[2]
    if (mo > 12 && d <= 12) [d, mo] = [mo, d] // clearly m/d/y
    return iso(year(+m[3]), mo, d) ?? undefined
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return iso(+m[2], +m[1], lastDay(+m[2], +m[1])) ?? undefined
  return undefined
}

const UNIT_WORDS: [RegExp, PackUnit][] = [
  [/^(ml|mls|millilit(er|re)s?)$/, 'ml'],
  [/^(l|ltr|ltrs|lt|lit(er|re)s?)$/, 'l'],
  [/^(g|gm|gms|gram|grams|gr)$/, 'g'],
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, 'kg'],
  [/^(pcs|pc|piece|pieces|nos|no|units?)$/, 'pcs'],
]
const unitOf = (s: string): PackUnit | null => {
  const w = s.toLowerCase().replace(/[^a-z]/g, '')
  for (const [re, u] of UNIT_WORDS) if (re.test(w)) return u
  return null
}

/** "400 ml", "1 L", "5kg", or a number + a separate unit column */
export function parsePack(sizeCell: Cell, unitCell: Cell): { size: number; unit: PackUnit } | null {
  const unitText = str(unitCell)
  if (typeof sizeCell === 'number' && unitText) {
    const u = unitOf(unitText)
    return u ? { size: sizeCell, unit: u } : null
  }
  const s = str(sizeCell)
  const m = s.match(/(\d+(?:\.\d+)?)\s*-?\s*([a-zA-Z]+)?/)
  if (!m) return null
  const u = m[2] ? unitOf(m[2]) : unitText ? unitOf(unitText) : null
  return u ? { size: Number(m[1]), unit: u } : null
}

// ---------------------------------------------------------------- matching & checks
function findColumns(rows: Cell[][]) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cols: Partial<Record<Col, number>> = {}
    rows[r].forEach((c, i) => {
      const h = norm(str(c))
      for (const [col, names] of Object.entries(HEADERS) as [Col, readonly string[]][]) {
        if (cols[col] === undefined && names.includes(h)) cols[col] = i
      }
    })
    if (cols.product !== undefined && cols.qty !== undefined) return { headerRow: r, cols }
  }
  return null
}

export function buildImport(cells: Cell[][], products: ProductStock[], batches: BatchStock[], today: string, createMissing = true): ImportResult {
  const found = findColumns(cells)
  if (!found) return { rows: [], skipped: 0, missingColumns: ['product', 'qty'] }
  const { headerRow, cols } = found
  const missingColumns = (['expiry'] as Col[]).filter((c) => cols[c] === undefined)

  // product index: name + size (in base units) -> products
  const byId = new Map(products.map((p) => [p.id, p]))
  const index = new Map<string, ProductStock[]>()
  const byName = new Map<string, ProductStock[]>()
  for (const p of products) {
    const k = `${nameKey(p.name)}|${measureOf(p.pack_unit)}|${baseOf(Number(p.pack_size), p.pack_unit)}`
    index.set(k, [...(index.get(k) ?? []), p])
    byName.set(nameKey(p.name), [...(byName.get(nameKey(p.name)) ?? []), p])
  }
  const existing = new Map(batches.map((b) => [`${b.product_id}|${b.batch_no.toLowerCase()}`, b.expiry_date]))
  const inFile = new Map<string, string | null>()

  const get = (row: Cell[], c: Col) => (cols[c] === undefined ? undefined : row[cols[c]!])
  const out: ImportRow[] = []
  let skipped = 0

  for (let r = headerRow + 1; r < cells.length; r++) {
    const row = cells[r]
    if (!row || row.every((c) => c == null || str(c) === '')) continue
    const productText = str(get(row, 'product'))
    const qtyRaw = get(row, 'qty')
    const qty = parseNumber(qtyRaw as Cell)
    // untouched template lines (quantity empty or 0) are skipped quietly
    if (qty === null || qty === 0) { skipped++; continue }

    const errors: Issue[] = []
    const warnings: Issue[] = []
    const sizeCell = get(row, 'size') as Cell
    const pack = parsePack(sizeCell, get(row, 'unit') as Cell)
    const sizeText = str(sizeCell) || (typeof sizeCell === 'number' ? String(sizeCell) : '')

    // product
    let product: ProductStock | undefined
    let create: ImportRow['create']
    const id = str(get(row, 'id'))
    if (id && byId.has(id)) product = byId.get(id)
    else if (!productText) errors.push({ key: 'impNoProduct' })
    else {
      const sameName = byName.get(nameKey(productText)) ?? []
      let list = pack ? index.get(`${nameKey(productText)}|${measureOf(pack.unit)}|${baseOf(pack.size, pack.unit)}`) ?? [] : sameName.length === 1 ? sameName : []
      const company = str(get(row, 'company'))
      if (list.length > 1 && company) list = list.filter((p) => nameKey(p.company_name ?? '') === nameKey(company))
      if (list.length === 1) product = list[0]
      else if (list.length > 1) errors.push({ key: 'impAmbiguous' })
      else if (createMissing && pack) {
        // new product (or a new pack size of an existing one) straight from the sheet
        // a new size of a product you already have keeps its name, company and category
        const like = sameName[0]
        create = {
          name: like ? like.name : productText.replace(/\s+/g, ' '),
          company: company || like?.company_name || '',
          size: pack.size,
          unit: pack.unit,
          category: str(get(row, 'category')) || like?.category_name || '',
        }
        if (sameName.length) warnings.push({ key: 'impNewSize' })
      } else if (!pack) errors.push({ key: 'impNoSize' })
      else if (sameName.length) errors.push({ key: 'impWrongSize', vars: { sizes: sameName.map((p) => fmtPack(Number(p.pack_size), p.pack_unit)).join(', ') } })
      else errors.push({ key: 'impNotFound' })
    }

    // quantity, rate
    if (qty === null || Number.isNaN(qty) || qty <= 0) errors.push({ key: 'impBadQty' })
    const rateRaw = parseNumber(get(row, 'rate') as Cell)
    if (rateRaw !== null && (Number.isNaN(rateRaw) || rateRaw < 0)) errors.push({ key: 'impBadRate' })

    // dates
    const expiry = parseDate(get(row, 'expiry') as Cell)
    const mfg = parseDate(get(row, 'mfg') as Cell)
    if (expiry === null) errors.push({ key: 'impNoExpiry' })
    else if (expiry === undefined) errors.push({ key: 'impBadExpiry', vars: { value: str(get(row, 'expiry')) } })
    else if (expiry < today) warnings.push({ key: 'impExpired' })
    if (mfg === undefined) errors.push({ key: 'impBadMfg', vars: { value: str(get(row, 'mfg')) } })
    else if (mfg && expiry && mfg > expiry) errors.push({ key: 'impMfgAfterExp' })

    // batch: same as the database does — no batch no. means "EXP-<expiry>"
    const batch_no = str(get(row, 'batch')) || (expiry ? `EXP-${expiry}` : '')
    const pkey = product ? product.id : create ? `new:${nameKey(create.name)}|${nameKey(create.company)}|${create.size}${create.unit}` : null
    if (pkey && expiry) {
      const k = `${pkey}|${batch_no.toLowerCase()}`
      const dbExp = existing.get(k)
      if (dbExp && dbExp !== expiry) errors.push({ key: 'impBatchConflict', vars: { batch: batch_no, date: dbExp } })
      else if (inFile.has(k) && inFile.get(k) !== expiry) errors.push({ key: 'impBatchConflictFile', vars: { batch: batch_no } })
      else inFile.set(k, expiry)
    }

    out.push({
      row: r + 1,
      productText,
      sizeText,
      product,
      create,
      batch_no,
      mfg_date: mfg ?? null,
      expiry_date: expiry ?? null,
      qty: qty !== null && !Number.isNaN(qty) ? qty : null,
      rate: rateRaw !== null && !Number.isNaN(rateRaw) ? rateRaw : null,
      errors,
      warnings,
    })
  }
  return { rows: out, skipped, missingColumns }
}

// ---------------------------------------------------------------- templates
export const TEMPLATE_HEADER = ['Product', 'Company', 'Pack size', 'Batch no', 'Mfg date', 'Expiry date', 'Quantity', 'Purchase rate', 'Category', 'Product ID']

const dmy = (y: number, m: number) => `${pad(lastDay(y, m))}/${pad(m)}/${y}`

/**
 * Template with every product pre-filled: example batch no., mfg date (end of last month),
 * expiry (end of the same month in 2 years), purchase rate, and Quantity 0.
 * Rows left at Quantity 0 are skipped, so only the products you type a quantity for are added.
 * Example dates use the last day of a month (day > 12) so Excel can never swap day and month.
 */
export function templateRows(products: ProductStock[], today: string): (string | number)[][] {
  const [ty, tm] = today.split('-').map(Number)
  const my = tm === 1 ? ty - 1 : ty
  const mm = tm === 1 ? 12 : tm - 1
  const mfg = dmy(my, mm)
  const exp = dmy(my + 2, mm)
  return products
    .filter((p) => p.is_active)
    .map((p, i) => [p.name, p.company_name ?? '', fmtPack(Number(p.pack_size), p.pack_unit), `B-${String(i + 1).padStart(3, '0')}`, mfg, exp, 0,
      Number(p.purchase_price) || 0, p.category_name, p.id])
}

export const EXAMPLE_ROWS: (string | number)[][] = [
  ['Bectal 1.9% EC', 'Starco', '400 ml', 'B-1023', '01/01/2026', '30/06/2028', 24, 650, 'Insecticide', ''],
  ['Emamectin Benzoate 1.9 EC', 'DJC', '1 L', '', '', '06/2028', 10, 1500, 'Insecticide', ''],
]
