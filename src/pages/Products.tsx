import { PackageSearch, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExpiryBadge, ProductName, QtyCell, ReportButtons, PrintHeader } from '../components/domain'
import { usePackLabel } from '../lib/packLabel'
import { ProductForm } from '../components/ProductForm'
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Loading, PageHeader, Tabs, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { useCatalog } from '../lib/catalog'
import { downloadCsv } from '../lib/csv'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n'
import { fmtPack, fmtTotal } from '../lib/units'

export function Products() {
  const { t, pick } = useI18n()
  const { refresh, today } = useOrg()
  const { toast } = useFeedback()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: cat, error, loading, reload } = useCatalog()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const label = usePackLabel()
  const formOpen = params.get('new') === '1'

  const list = useMemo(() => {
    if (!cat) return []
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return cat.products.filter((p) => {
      if (!showInactive && !p.is_active) return false
      if (category !== 'all' && p.category_id !== category) return false
      if (!terms.length) return true
      const hay = `${p.name} ${p.name_ur ?? ''} ${p.company_name ?? ''} ${fmtPack(p.pack_size, p.pack_unit)} ${p.category_name}`.toLowerCase()
      return terms.every((x) => hay.includes(x))
    })
  }, [cat, q, category, showInactive])

  if (loading && !cat) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!cat) return null

  const exportCsv = () =>
    downloadCsv(`products-${today}`, [t('productName'), t('urduName'), t('company'), t('category'), t('packSize'), t('packType'), t('stock'), t('total'), t('minStock'), t('nextExpiry')],
      list.map((p) => [p.name, p.name_ur, p.company_name, p.category_name, fmtPack(p.pack_size, p.pack_unit), t(`pt_${p.pack_type}`), p.qty, fmtTotal(p.qty, p.pack_size, p.pack_unit), p.min_stock, p.next_expiry]))

  return (
    <div>
      <PageHeader
        title={t('products')}
        subtitle={t('totalItems', { n: list.length })}
        actions={
          <>
            <ReportButtons onExcel={exportCsv} />
            <Button onClick={() => setParams({ new: '1' })}>
              <Plus className="size-4" /> {t('addProduct')}
            </Button>
          </>
        }
      />
      <PrintHeader title={t('products')} />

      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search')}
            className="h-10 w-full rounded-lg border border-stone-300 bg-surface ps-9 pe-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
        </div>
        <Checkbox checked={showInactive} onChange={setShowInactive} label={t('showInactive')} />
      </div>
      <Tabs
        value={category}
        onChange={setCategory}
        items={[{ value: 'all', label: t('all') }, ...cat.categories.map((c) => ({ value: c.id, label: pick(c.name, c.name_ur) }))]}
      />

      <Card className="print-plain">
        {list.length === 0 ? (
          <Empty icon={<PackageSearch className="size-10 text-stone-300" />}>
            {cat.products.length === 0 ? t('noProducts') : t('noData')}
            {cat.products.length === 0 && (
              <Button className="mt-2" onClick={() => setParams({ new: '1' })}><Plus className="size-4" /> {t('addProduct')}</Button>
            )}
          </Empty>
        ) : (
          <>
            {/* Desktop table */}
            <div className="table-wrap hidden md:block">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('product')}</th>
                    <th>{t('category')}</th>
                    <th>{t('packSize')}</th>
                    <th className="r">{t('stock')}</th>
                    <th>{t('nextExpiry')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => nav(`/products/${p.id}`)}>
                      <td>
                        <div className="font-medium">{pick(p.name, p.name_ur)}</div>
                        {p.company_name && <div className="text-xs text-stone-500">{p.company_name}</div>}
                      </td>
                      <td className="text-stone-600">{pick(p.category_name, p.category_name_ur)}</td>
                      <td className="num font-medium text-brand-800">{label(p)}</td>
                      <td className="r"><QtyCell packs={p.qty} p={p} strong /></td>
                      <td><ExpiryBadge date={p.next_expiry} /></td>
                      <td>
                        {!p.is_active ? <Badge>{t('inactive')}</Badge> : p.min_stock > 0 && p.qty <= p.min_stock ? <Badge tone="red">{t('lowStock')}</Badge> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y divide-stone-100 md:hidden">
              {list.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3" onClick={() => nav(`/products/${p.id}`)}>
                  <div className="min-w-0">
                    <ProductName p={p} />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.next_expiry && <ExpiryBadge date={p.next_expiry} showDate={false} />}
                      {p.min_stock > 0 && p.qty <= p.min_stock && <Badge tone="red">{t('lowStock')}</Badge>}
                    </div>
                  </div>
                  <QtyCell packs={p.qty} p={p} strong />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <ProductForm
        open={formOpen}
        onClose={() => setParams({})}
        catalog={cat}
        onSaved={(ids) => {
          toast(ids.length > 1 ? t('productsSaved', { n: ids.length }) : t('productSaved'))
          setParams({})
          refresh()
          if (ids.length === 1) nav(`/products/${ids[0]}`)
        }}
      />
    </div>
  )
}
