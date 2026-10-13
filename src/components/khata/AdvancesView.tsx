import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../lib/app'
import { downloadCsv } from '../../lib/csv'
import { cx } from '../../lib/cx'
import { errText } from '../../lib/errors'
import { useI18n } from '../../lib/i18n'
import { cropLabel, type CropAdvance } from '../../lib/khataMoney'
import { fmtMoney } from '../../lib/money'
import type { PartyBalance } from '../../lib/types'
import { PrintHeader, ReportButtons } from '../domain'
import { Badge, Button, Card, Empty, ErrorBox, Loading, Segmented, Select, useFeedback } from '../ui'
import { NewAdvanceModal } from './AdvanceModals'

type Status = 'open' | 'closed' | 'all'

/** All crop advances of the shop, with totals per crop */
export function AdvancesView({
  advances, error, loading, reload, q, customers,
}: {
  advances: CropAdvance[] | null
  error: unknown
  loading: boolean
  reload: () => void
  q: string
  customers: PartyBalance[]
}) {
  const { t, lang } = useI18n()
  const { refresh } = useOrg()
  const { toast } = useFeedback()
  const nav = useNavigate()
  const [status, setStatus] = useState<Status>('open')
  const [crop, setCrop] = useState('')
  const [adding, setAdding] = useState(false)

  const crops = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of advances ?? []) m.set(a.crop.trim().toLowerCase(), a.crop.trim())
    return [...m.values()].sort((a, b) => a.localeCompare(b))
  }, [advances])

  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (advances ?? [])
      .filter((a) => (status === 'all' ? true : status === 'open' ? !a.is_closed : a.is_closed))
      .filter((a) => !crop || a.crop.trim().toLowerCase() === crop.toLowerCase())
      .filter((a) => terms.every((x) => `${a.party_name} ${a.party_phone ?? ''} ${a.crop} ${cropLabel(a.crop, t)} ${a.season ?? ''}`.toLowerCase().includes(x)))
      .sort((a, b) => b.balance - a.balance || a.party_name.localeCompare(b.party_name))
  }, [advances, status, crop, q, t])

  const perCrop = useMemo(() => {
    const m = new Map<string, { crop: string; n: number; deposited: number; used: number; left: number }>()
    for (const a of list) {
      const k = a.crop.trim().toLowerCase()
      const r = m.get(k) ?? { crop: a.crop.trim(), n: 0, deposited: 0, used: 0, left: 0 }
      r.n += 1
      r.deposited += a.deposited
      r.used += a.used
      r.left += a.balance
      m.set(k, r)
    }
    return [...m.values()].sort((a, b) => b.left - a.left)
  }, [list])
  const total = list.reduce((s, a) => ({ deposited: s.deposited + a.deposited, used: s.used + a.used, left: s.left + a.balance }), { deposited: 0, used: 0, left: 0 })

  const exportCsv = () =>
    downloadCsv('crop-advances', [t('customer'), t('phone'), t('khCrop'), t('khSeason'), t('khDeposited'), t('khUsed'), t('khRefunded'), t('khMovedToKhata'), t('khLeft'), t('status')],
      list.map((a) => [a.party_name, a.party_phone, cropLabel(a.crop, t), a.season, a.deposited, a.used, a.refunded, a.moved_to_khata, a.balance, a.is_closed ? t('khClosedBadge') : t('khOpenBadge')]))

  return (
    <div>
      <PrintHeader title={`${t('navKhata')} · ${t('khCropAdvances')}`} />

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={status}
          onChange={setStatus}
          items={[
            { value: 'open', label: t('khOpenBadge') },
            { value: 'closed', label: t('khClosedBadge') },
            { value: 'all', label: t('all') },
          ]}
        />
        {crops.length > 1 && (
          <Select value={crop} onChange={(e) => setCrop(e.target.value)} className="w-40" aria-label={t('khCrop')}>
            <option value="">{t('khAllCrops')}</option>
            {crops.map((c) => <option key={c} value={c}>{cropLabel(c, t)}</option>)}
          </Select>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <ReportButtons onExcel={exportCsv} />
          <Button onClick={() => setAdding(true)}><Plus className="size-4" /> {t('khNewAdvance')}</Button>
        </div>
      </div>

      {loading && !advances ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : (
        <>
          {perCrop.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {perCrop.map((c) => (
                <button
                  key={c.crop}
                  onClick={() => setCrop(crop.toLowerCase() === c.crop.toLowerCase() ? '' : c.crop)}
                  className={cx(
                    'min-w-0 rounded-xl border p-3 text-start cursor-pointer',
                    crop.toLowerCase() === c.crop.toLowerCase() ? 'border-sky-200 bg-sky-100' : 'border-stone-200 bg-surface',
                  )}
                >
                  <div className="truncate text-sm font-medium text-stone-700">{cropLabel(c.crop, t)} <span className="num text-stone-400">({c.n})</span></div>
                  <div className="num text-xl font-bold text-sky-800">{fmtMoney(c.left, lang)}</div>
                  <div className="num truncate text-xs text-stone-500">{t('khDeposited')} {fmtMoney(c.deposited, lang)}</div>
                </button>
              ))}
            </div>
          )}

          <Card className="print-plain">
            {list.length === 0 ? (
              <Empty>{(advances ?? []).length === 0 ? t('khNoAdvances') : t('khNoMatch')}</Empty>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t('customer')}</th>
                      <th>{t('khCrop')}</th>
                      <th className="r">{t('khDeposited')}</th>
                      <th className="r">{t('khUsed')}</th>
                      <th className="r">{t('khLeft')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id} className="cursor-pointer" onClick={() => nav(`/khata/${a.party_id}#advances`)}>
                        <td>
                          <div className="font-medium">{a.party_name}</div>
                          {a.party_phone && <div className="num text-xs text-stone-500" dir="ltr">{a.party_phone}</div>}
                        </td>
                        <td>
                          <div className="whitespace-nowrap">{cropLabel(a.crop, t)}</div>
                          <div className="flex items-center gap-1 text-xs text-stone-500">
                            {a.season}
                            {a.is_closed && <Badge>{t('khClosedBadge')}</Badge>}
                          </div>
                        </td>
                        <td className="r num">{fmtMoney(a.deposited, lang)}</td>
                        <td className="r num">{fmtMoney(a.used, lang)}</td>
                        <td className={cx('r num text-base font-bold', a.balance > 0.005 ? 'text-sky-800' : 'text-stone-500')}>{fmtMoney(a.balance, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>{t('total')}</td>
                      <td className="r num">{fmtMoney(total.deposited, lang)}</td>
                      <td className="r num">{fmtMoney(total.used, lang)}</td>
                      <td className="r num">{fmtMoney(total.left, lang)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <NewAdvanceModal
        open={adding}
        onClose={() => setAdding(false)}
        parties={customers}
        onPartyCreated={refresh}
        onSaved={(pid) => {
          setAdding(false)
          toast(t('khAdvanceSaved'))
          refresh()
          nav(`/khata/${pid}#advances`)
        }}
      />
    </div>
  )
}
