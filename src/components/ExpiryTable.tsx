import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { ExpiryAlert } from '../lib/types'
import { ExpiryBadge, ProductName, QtyCell } from './domain'
import { Button } from './ui'

/** Batches with stock, sorted by expiry. Expired rows are tinted red. */
export function ExpiryTable({ rows, writeOff = true }: { rows: ExpiryAlert[]; writeOff?: boolean }) {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t('product')}</th>
            <th>{t('batchNo')}</th>
            <th>{t('mfgDate')}</th>
            <th>{t('expiryDate')}</th>
            <th>{t('daysLeftCol')}</th>
            <th className="r">{t('stock')}</th>
            {writeOff && <th className="no-print" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.batch_id} className={a.days_left < 0 ? 'bg-red-50/60' : undefined}>
              <td className="cursor-pointer" onClick={() => nav(`/products/${a.product_id}`)}>
                <ProductName p={a} />
              </td>
              <td className="num">{a.batch_no}</td>
              <td className="num text-stone-500">{fmtDate(a.mfg_date, lang)}</td>
              <td className="num font-medium">{fmtDate(a.expiry_date, lang)}</td>
              <td><ExpiryBadge date={a.expiry_date} showDate={false} /></td>
              <td className="r"><QtyCell packs={a.qty} p={a} strong /></td>
              {writeOff && (
                <td className="no-print r">
                  <Button
                    size="sm"
                    variant={a.days_left < 0 ? 'danger' : 'secondary'}
                    onClick={() => nav(`/stock-out?type=${a.days_left < 0 ? 'expired' : 'return_out'}&product=${a.product_id}&batch=${a.batch_id}&qty=${a.qty}`)}
                  >
                    <Trash2 className="size-3.5" /> {a.days_left < 0 ? t('writeOff') : t('mv_return_out')}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
