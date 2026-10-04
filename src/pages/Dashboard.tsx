import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BarChart3, CheckCircle2, Droplets, Package, PackagePlus, TrendingDown, Weight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExpiryTable } from '../components/ExpiryTable'
import { ProductName, QtyCell } from '../components/domain'
import { Badge, Card, Empty, ErrorBox, Loading } from '../components/ui'
import { cx } from '../lib/cx'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate, fmtDateTime } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { authorOf, type ExpiryAlert, type Movement } from '../lib/types'
import { fmtBase, fmtNum, totalsByMeasure } from '../lib/units'

export function Dashboard() {
  const { org, version, today, profile } = useOrg()
  const { t, lang } = useI18n()
  const nav = useNavigate()

  const { data, error, loading, reload } = useLoad(async () => {
    const [catalog, alerts, todayMv, recent] = await Promise.all([
      loadCatalog(org.id),
      supabase.from('expiry_alerts').select('*').eq('org_id', org.id).order('expiry_date').limit(500),
      supabase.from('stock_movements').select('qty').eq('org_id', org.id).eq('movement_date', today).limit(5000),
      supabase
        .from('stock_movements')
        .select('*, batches(batch_no, expiry_date, product_id), profiles(full_name)')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    for (const r of [alerts, todayMv, recent]) if (r.error) throw r.error
    return {
      catalog,
      alerts: (alerts.data ?? []) as ExpiryAlert[],
      todayMv: (todayMv.data ?? []) as { qty: number }[],
      recent: (recent.data ?? []) as Movement[],
    }
  }, [org.id, version, today])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null

  const { catalog, alerts, todayMv, recent } = data
  const active = catalog.products.filter((p) => p.is_active)
  const totals = totalsByMeasure(active, (p) => ({ packs: Math.max(0, p.qty), size: p.pack_size, unit: p.pack_unit }))
  const low = active.filter((p) => p.min_stock > 0 && p.qty <= p.min_stock).sort((a, b) => a.qty - b.qty)
  const expired = alerts.filter((a) => a.days_left < 0)
  const todayIn = todayMv.filter((m) => m.qty > 0).length
  const todayOut = todayMv.filter((m) => m.qty < 0).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
          <p className="text-sm text-stone-500">
            {profile?.full_name ? `${profile.full_name} · ` : ''}
            <span className="num">{fmtDate(today, lang)}</span>
          </p>
        </div>
      </div>

      {/* 1. Expiry first */}
      <Card
        className={cx(alerts.length > 0 && (expired.length ? 'border-red-300 ring-1 ring-red-200' : 'border-amber-300 ring-1 ring-amber-200'))}
        title={
          <span className="flex items-center gap-2">
            {alerts.length ? <AlertTriangle className={cx('size-5', expired.length ? 'text-red-600' : 'text-amber-600')} /> : <CheckCircle2 className="size-5 text-brand-600" />}
            {t('expiryAlerts')}
            {expired.length > 0 && <Badge tone="red">{t('expiredCount', { n: expired.length })}</Badge>}
            {alerts.length - expired.length > 0 && <Badge tone="amber">{t('expiringCount', { n: alerts.length - expired.length, d: org.expiry_alert_days })}</Badge>}
          </span>
        }
        action={alerts.length > 0 && <Link to="/expiry" className="text-sm font-medium text-brand-700 hover:underline">{t('viewAll')}</Link>}
      >
        {alerts.length === 0 ? (
          <Empty icon={<CheckCircle2 className="size-8 text-brand-500" />}>{t('noExpiry', { d: org.expiry_alert_days })}</Empty>
        ) : (
          <ExpiryTable rows={alerts.slice(0, 8)} />
        )}
      </Card>

      {/* 2. Quick actions */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Action to="/stock-in" icon={<ArrowDownToLine className="size-6" />} label={t('navStockIn')} className="bg-primary text-white hover:bg-primary-hover" />
        <Action to="/stock-out" icon={<ArrowUpFromLine className="size-6" />} label={t('navStockOut')} className="bg-orange-500 text-white hover:bg-orange-600" />
        <Action to="/products?new=1" icon={<PackagePlus className="size-6" />} label={t('addProduct')} className="bg-surface text-stone-800 ring-1 ring-stone-200 hover:bg-stone-50" />
        <Action to="/reports" icon={<BarChart3 className="size-6" />} label={t('navReports')} className="bg-surface text-stone-800 ring-1 ring-stone-200 hover:bg-stone-50" />
      </div>

      {/* 3. KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Package className="size-5" />} label={t('totalProducts')} value={fmtNum(active.length)} onClick={() => nav('/products')} />
        <Stat icon={<Droplets className="size-5" />} label={t('totalLiters')} value={fmtBase(totals.volume, 'volume', lang)} />
        <Stat icon={<Weight className="size-5" />} label={t('totalKg')} value={fmtBase(totals.weight, 'weight', lang)} />
        <Stat
          icon={<TrendingDown className="size-5" />}
          label={t('lowStock')}
          value={fmtNum(low.length)}
          tone={low.length ? 'red' : undefined}
          sub={`${t('todayEntries')}: ${todayIn} ${t('inLabel')} · ${todayOut} ${t('outLabel')}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('lowStock')}>
          {low.length === 0 ? (
            <Empty>{t('noLowStock')}</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {low.slice(0, 10).map((p) => (
                <li key={p.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50" onClick={() => nav(`/products/${p.id}`)}>
                  <ProductName p={p} />
                  <div className="text-end">
                    <QtyCell packs={p.qty} p={p} strong />
                    <div className="num text-xs text-stone-400">min {fmtNum(p.min_stock)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('recentActivity')} action={<Link to="/history" className="text-sm font-medium text-brand-700 hover:underline">{t('viewAll')}</Link>}>
          {recent.length === 0 ? (
            <Empty>{t('noActivity')}</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.map((m) => {
                const p = m.batches ? catalog.byId.get(m.batches.product_id) : undefined
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      {p ? <ProductName p={p} sub={false} /> : '—'}
                      <div className="text-xs text-stone-500">
                        <MovementBadge type={m.type} /> <span className="num">{fmtDateTime(m.created_at, lang)}</span>
                        {authorOf(m) ? ` · ${authorOf(m)}` : ''}
                      </div>
                    </div>
                    {p && <QtyCell packs={m.qty} p={p} strong />}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

export function MovementBadge({ type }: { type: Movement['type'] }) {
  const { t } = useI18n()
  const tone = type === 'purchase' || type === 'return_in' ? 'green' : type === 'sale' ? 'blue' : type === 'adjustment' ? 'stone' : type === 'expired' || type === 'damaged' ? 'red' : 'orange'
  return <Badge tone={tone}>{t(`mv_${type}`)}</Badge>
}

function Action({ to, icon, label, className }: { to: string; icon: ReactNode; label: string; className: string }) {
  return (
    <Link to={to} className={cx('flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-semibold shadow-sm transition-colors', className)}>
      {icon}
      {label}
    </Link>
  )
}

function Stat({ icon, label, value, sub, tone, onClick }: { icon: ReactNode; label: string; value: string; sub?: string; tone?: 'red'; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('rounded-xl border border-stone-200 bg-surface p-4 shadow-sm', onClick && 'cursor-pointer hover:border-stone-300')}>
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <span className={cx('grid size-8 place-items-center rounded-lg', tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-brand-50 text-brand-700')}>{icon}</span>
        {label}
      </div>
      <div className={cx('num mt-2 text-2xl font-bold', tone === 'red' && 'text-red-700')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </div>
  )
}
