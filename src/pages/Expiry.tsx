import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ExpiryTable } from '../components/ExpiryTable'
import { PrintHeader, ReportButtons } from '../components/domain'
import { Card, Empty, ErrorBox, Loading, PageHeader, Tabs } from '../components/ui'
import { useOrg } from '../lib/app'
import { downloadCsv } from '../lib/csv'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { useStockBatches } from '../lib/stockBatches'
import type { ExpiryAlert } from '../lib/types'
import { fmtPack, fmtTotal } from '../lib/units'

type View = 'alert' | 'expired' | '30' | 'all'

export function ExpiryView({ embedded }: { embedded?: boolean }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const days = org.expiry_alert_days
  const { data, error, loading, reload } = useStockBatches()
  const [view, setView] = useState<View>('alert')

  const rows = useMemo(() => {
    const all = data ?? []
    if (view === 'expired') return all.filter((r) => r.days_left < 0)
    if (view === '30') return all.filter((r) => r.days_left <= 30)
    if (view === 'alert') return all.filter((r) => r.days_left <= days)
    return all
  }, [data, view, days])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  const all = data ?? []
  const count = (f: (r: ExpiryAlert) => boolean) => all.filter(f).length
  const title = view === 'expired' ? t('expired') : view === '30' ? t('within30') : view === 'alert' ? t('withinN', { n: days }) : t('allBatches')

  const exportCsv = () =>
    downloadCsv(`expiry-${today}`, [t('product'), t('company'), t('packSize'), t('batchNo'), t('mfgDate'), t('expiryDate'), t('daysLeftCol'), t('stock'), t('total')],
      rows.map((r) => [r.name, r.company_name, fmtPack(r.pack_size, r.pack_unit), r.batch_no, r.mfg_date, r.expiry_date, r.days_left, r.qty, fmtTotal(r.qty, r.pack_size, r.pack_unit)]))

  return (
    <div>
      {!embedded && (
        <PageHeader
          title={<span className="flex items-center gap-2"><CalendarClock className="size-6 text-amber-600" /> {t('expiry')}</span>}
          subtitle={t('alertDaysHint')}
          actions={<ReportButtons onExcel={exportCsv} />}
        />
      )}
      {embedded && <div className="no-print mb-3 flex justify-end gap-2"><ReportButtons onExcel={exportCsv} /></div>}
      <PrintHeader title={`${t('expiryReport')} · ${title}`} subtitle={fmtDate(today, lang)} />
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { value: 'alert', label: `${t('withinN', { n: days })} (${count((r) => r.days_left <= days)})` },
          { value: 'expired', label: `${t('expired')} (${count((r) => r.days_left < 0)})` },
          { value: '30', label: `${t('within30')} (${count((r) => r.days_left <= 30)})` },
          { value: 'all', label: `${t('allBatches')} (${all.length})` },
        ]}
      />
      <Card className="print-plain">
        {rows.length === 0 ? (
          <Empty icon={<CheckCircle2 className="size-10 text-brand-500" />}>{t('noExpiry', { d: view === '30' ? 30 : days })}</Empty>
        ) : (
          <ExpiryTable rows={rows} />
        )}
      </Card>
    </div>
  )
}

export function ExpiryPage() {
  return <ExpiryView />
}
