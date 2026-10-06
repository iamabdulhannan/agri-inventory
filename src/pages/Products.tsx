import { PackageSearch, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExpiryBadge, ProductName, QtyCell, ReportButtons, PrintHeader } from '../components/domain'
import { usePackLabel } from '../lib/packLabel'
import { ProductForm } from '../components/ProductForm'
import { FilterChip, FilterMenu, FilterOptions, FilterSection } from '../components/FilterMenu'
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Loading, PageHeader, Select, useFeedback } from '../components/ui'
import { daysBetween } from '../lib/format'
import { isLowStock } from '../lib/stockLevel'
import type { ProductStock } from '../lib/types'
import { useOrg } from '../lib/app'
import { useCatalog } from '../lib/catalog'
import { downloadCsv } from '../lib/csv'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n'
import { fmtPack, fmtTotal } from '../lib/units'
import { fmtMoney } from '../lib/money'

type StockFilter = 'all' | 'in' | 'low' | 'out' | 'expiring'
type SortKey = 'name' | 'stockHigh' | 'stockLow' | 'expiry' | 'value'
const STOCK_FILTERS: StockFilter[] = ['all', 'in', 'low', 'out', 'expiring']
const SORTS: SortKey[] = ['name', 'stockHigh', 'stockLow', 'expiry', 'value']

export function Products() {
  const { t, pick, lang } = useI18n()
  const { refresh, today, org } = useOrg()
  const { toast } = useFeedback()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: cat, error, loading, reload } = useCatalog()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [company, setCompany] = useState('all')
  const [sort, setSort] = useState<SortKey>('name')
  const label = usePackLabel()
  const formOpen = params.get('new') === '1'

  const alertDays = org.expiry_alert_days ?? 60
  const stockOf = useMemo(() => {
    const isExpiring = (p: ProductStock) => !!p.next_expiry && daysBetween(today, p.next_expiry) <= alertDays
    return (p: ProductStock, f: StockFilter) =>
      f === 'all' ? true : f === 'in' ? p.qty > 0 : f === 'out' ? p.qty <= 0 : f === 'low' ? isLowStock(p) : isExpiring(p)
  }, [today, alertDays])

  // everything except the stock filter: the stock buttons show counts of this list
  const base = useMemo(() => {
    if (!cat) return []
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return cat.products.filter((p) => {
      if (!showInactive && !p.is_active) return false
      if (category !== 'all' && p.category_id !== category) return false
      if (company !== 'all' && (p.company_id ?? 'none') !== company) return false
      if (!terms.length) return true
      const hay = `${p.name} ${p.name_ur ?? ''} ${p.company_name ?? ''} ${fmtPack(p.pack_size, p.pack_unit)} ${p.category_name} ${p.notes ?? ''}`.toLowerCase()
      return terms.every((x) => hay.includes(x))
    })
  }, [cat, q, category, company, showInactive])

  const list = useMemo(() => {
    const out = base.filter((p) => stockOf(p, stockFilter))
    const cmp: Record<SortKey, ((a: ProductStock, b: ProductStock) => number) | null> = {
      name: null, // catalog is already sorted by name and pack size
      stockHigh: (a, b) => b.qty - a.qty,
      stockLow: (a, b) => a.qty - b.qty,
      expiry: (a, b) => (a.next_expiry ?? '9999').localeCompare(b.next_expiry ?? '9999'),
      value: (a, b) => Number(b.stock_value ?? 0) - Number(a.stock_value ?? 0),
    }
    const f = cmp[sort]
    return f ? [...out].sort(f) : out
  }, [base, stockFilter, stockOf, sort])

  const count = (f: StockFilter) => base.filter((p) => stockOf(p, f)).length
  const activeCount = [stockFilter !== 'all', category !== 'all', company !== 'all', sort !== 'name', showInactive].filter(Boolean).length
  const clearFilters = () => { setCategory('all'); setCompany('all'); setStockFilter('all'); setSort('name'); setShowInactive(false) }
  const stockLabel = (f: StockFilter) => t(({ all: 'all', in: 'inStock', low: 'lowStock', out: 'outOfStock', expiring: 'expiringSoon' } as const)[f])
  const sortLabel = (k: SortKey) => t(({ name: 'sortName', stockHigh: 'sortStockHigh', stockLow: 'sortStockLow', expiry: 'sortExpiry', value: 'sortValue' } as const)[k])

  if (loading && !cat) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!cat) return null

  const categoryRow = category !== 'all' ? cat.categories.find((c) => c.id === category) : undefined
  const companyRow = company !== 'all' ? cat.companies.find((c) => c.id === company) : undefined

  const exportCsv = () =>
    downloadCsv(`products-${today}`, [t('productName'), t('urduName'), t('company'), t('category'), t('packSize'), t('packType'), t('stock'), t('total'), t('purchasePrice'), t('mrp'), t('stockValue'), t('minStock'), t('nextExpiry')],
      list.map((p) => [p.name, p.name_ur, p.company_name, p.category_name, fmtPack(p.pack_size, p.pack_unit), t(`pt_${p.pack_type}`), p.qty, fmtTotal(p.qty, p.pack_size, p.pack_unit), p.purchase_price, p.sale_price, p.stock_value, p.min_stock, p.next_expiry]))

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

      <div className="no-print mb-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search')}
            className="h-10 w-full rounded-lg border border-stone-300 bg-surface ps-9 pe-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
        </div>
        <FilterMenu active={activeCount} onClear={clearFilters} footer={t('showResults', { n: list.length })}>
          <FilterSection title={t('stockFilter')}>
            <FilterOptions<StockFilter>
              value={stockFilter}
              onChange={setStockFilter}
              items={STOCK_FILTERS.map((f) => ({ value: f, label: stockLabel(f), count: count(f) }))}
            />
          </FilterSection>
          <FilterSection title={t('category')}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full" aria-label={t('category')}>
              <option value="all">{t('all')}</option>
              {cat.categories.map((c) => <option key={c.id} value={c.id}>{pick(c.name, c.name_ur)}</option>)}
            </Select>
          </FilterSection>
          <FilterSection title={t('company')}>
            <Select value={company} onChange={(e) => setCompany(e.target.value)} searchable className="w-full" aria-label={t('company')}>
              <option value="all">{t('allCompanies')}</option>
              {cat.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FilterSection>
          <FilterSection title={t('sortBy')}>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-full" aria-label={t('sortBy')}>
              {SORTS.map((k) => <option key={k} value={k}>{sortLabel(k)}</option>)}
            </Select>
          </FilterSection>
          <FilterSection title={t('options')}>
            <Checkbox checked={showInactive} onChange={setShowInactive} label={t('showInactive')} />
          </FilterSection>
        </FilterMenu>
      </div>
      {activeCount > 0 && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          {stockFilter !== 'all' && <FilterChip onRemove={() => setStockFilter('all')}>{stockLabel(stockFilter)}</FilterChip>}
          {categoryRow && <FilterChip onRemove={() => setCategory('all')}>{pick(categoryRow.name, categoryRow.name_ur)}</FilterChip>}
          {companyRow && <FilterChip onRemove={() => setCompany('all')}>{companyRow.name}</FilterChip>}
          {sort !== 'name' && <FilterChip onRemove={() => setSort('name')}>{sortLabel(sort)}</FilterChip>}
          {showInactive && <FilterChip onRemove={() => setShowInactive(false)}>{t('showInactive')}</FilterChip>}
          <Button size="sm" variant="ghost" onClick={clearFilters}>{t('clearFilters')}</Button>
        </div>
      )}

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
                    <th className="r">{t('mrp')}</th>
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
                      <td className="r num whitespace-nowrap">
                        {p.sale_price ? <span className="font-medium">{fmtMoney(p.sale_price, lang)}</span> : <span className="text-stone-300">—</span>}
                        {Number(p.purchase_price) > 0 && <div className="text-xs text-stone-500">{t('purchasePrice')}: {fmtMoney(p.purchase_price, lang)}</div>}
                      </td>
                      <td><ExpiryBadge date={p.next_expiry} /></td>
                      <td>
                        {!p.is_active ? <Badge>{t('inactive')}</Badge> : p.qty <= 0 ? <Badge tone="red">{t('outOfStock')}</Badge> : p.min_stock > 0 && p.qty <= p.min_stock ? <Badge tone="amber">{t('lowStock')}</Badge> : null}
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
                      {p.qty <= 0 ? <Badge tone="red">{t('outOfStock')}</Badge> : p.min_stock > 0 && p.qty <= p.min_stock && <Badge tone="amber">{t('lowStock')}</Badge>}
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

