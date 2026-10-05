import { useFeedback } from '../components/ui'
import { useOrg } from './app'
import { errText } from './errors'
import { useI18n } from './i18n'
import { supabase } from './supabase'
import type { Movement } from './types'

/** Stock-in lines (purchase / opening / manual return) go through delete_stock_in_line */
export const isStockInLine = (m: Movement) => (m.type === 'purchase' || m.type === 'return_in') && !m.sale_id && !m.return_id
/** Lines that can be deleted one by one (sale and invoice-return lines are voided via the invoice) */
export const canDeleteLine = (m: Movement) => !m.sale_id && !m.return_id

/** Delete one wrong stock line after confirming. Resolves true when deleted. */
export function useDeleteLine() {
  const { t } = useI18n()
  const { org, refresh } = useOrg()
  const { toast, confirm } = useFeedback()

  return async (m: Movement) => {
    if (!(await confirm(t(m.purchase_id ? 'deletePurchaseLineConfirm' : 'deleteEntryConfirm'), true))) return false
    let error
    let whole = false
    if (isStockInLine(m)) {
      const res = await supabase.rpc('delete_stock_in_line', { p_org: org.id, p_movement: m.id })
      error = res.error
      whole = res.data === 'purchase'
    } else {
      error = (await supabase.from('stock_movements').delete().eq('id', m.id)).error
    }
    if (error) {
      const msg = String(error.message ?? '')
      if (/INSUFFICIENT_STOCK/.test(msg)) toast(t('errDeleteSold'), 'err')
      else if (/delete_stock_in_line|PGRST202|schema cache/.test(msg)) toast(t('errRunMigration', { n: '009' }), 'err')
      else toast(errText(error, t), 'err')
      return false
    }
    toast(whole ? t('purchaseDeleted') : t('deleted'))
    refresh()
    return true
  }
}
