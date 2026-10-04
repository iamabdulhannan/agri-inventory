import { useOrg } from './app'
import { loadCatalog } from './catalog'
import { fetchAll, useLoad } from './data'
import { daysBetween } from './format'
import { supabase } from './supabase'
import type { BatchStock, ExpiryAlert } from './types'

/** All batches that still have stock, joined with product info and days left */
export function useStockBatches() {
  const { org, version, today } = useOrg()
  return useLoad(async () => {
    const [catalog, batches] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<BatchStock>((a, b) => supabase.from('batch_stock').select('*').eq('org_id', org.id).gt('qty', 0).order('expiry_date').range(a, b)),
    ])
    const rows: ExpiryAlert[] = []
    for (const b of batches) {
      const p = catalog.byId.get(b.product_id)
      if (!p) continue
      rows.push({
        batch_id: b.id, org_id: b.org_id, product_id: b.product_id, batch_no: b.batch_no, mfg_date: b.mfg_date,
        expiry_date: b.expiry_date, qty: Number(b.qty), name: p.name, name_ur: p.name_ur, pack_size: p.pack_size,
        pack_unit: p.pack_unit, pack_type: p.pack_type, company_name: p.company_name, days_left: daysBetween(today, b.expiry_date),
      })
    }
    return rows
  }, [org.id, version, today])
}
