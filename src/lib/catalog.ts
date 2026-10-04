import { useOrg } from './app'
import { fetchAll, useLoad } from './data'
import { supabase } from './supabase'
import type { Category, Company, ProductStock } from './types'
import { baseOf, measureOf } from './units'

const MEASURE_ORDER = { volume: 0, weight: 1, count: 2 }

export function sortProducts<T extends { name: string; pack_size: number; pack_unit: ProductStock['pack_unit'] }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      MEASURE_ORDER[measureOf(a.pack_unit)] - MEASURE_ORDER[measureOf(b.pack_unit)] ||
      baseOf(a.pack_size, a.pack_unit) - baseOf(b.pack_size, b.pack_unit),
  )
}

export interface Catalog {
  products: ProductStock[]
  categories: Category[]
  companies: Company[]
  byId: Map<string, ProductStock>
}

export async function loadCatalog(orgId: string): Promise<Catalog> {
  const [products, categories, companies] = await Promise.all([
    fetchAll<ProductStock>((a, b) => supabase.from('product_stock').select('*').eq('org_id', orgId).order('id').range(a, b)),
    fetchAll<Category>((a, b) => supabase.from('categories').select('*').eq('org_id', orgId).order('name').range(a, b)),
    fetchAll<Company>((a, b) => supabase.from('companies').select('*').eq('org_id', orgId).order('name').range(a, b)),
  ])
  const sorted = sortProducts(products.map((p) => ({ ...p, qty: Number(p.qty), pack_size: Number(p.pack_size), min_stock: Number(p.min_stock) })))
  return { products: sorted, categories, companies, byId: new Map(sorted.map((p) => [p.id, p])) }
}

/** Products (with live stock), categories and companies of the current organization */
export function useCatalog() {
  const { org, version } = useOrg()
  return useLoad(() => loadCatalog(org.id), [org.id, version])
}
