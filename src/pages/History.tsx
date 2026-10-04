import { History as HistoryIcon, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PrintHeader, ProductName, QtyCell, ReportButtons } from '../components/domain'
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { downloadCsv } from '../lib/csv'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate, monthOf, monthRange } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { ALL_TYPES, authorOf, type Movement, type MovementType } from '../lib/types'
import { fmtPack } from '../lib/units'
import { MovementBadge } from './Dashboard'

export function History() {
  const { t, pick, lang } = useI18n()
  const { org, today, version, isAdmin, refresh } = useOrg()
  const { toast, confirm } = useFeedback()
  const [params] = useSearchParams()
  const [from, setFrom] = useState(() => monthRange(monthOf(today))[0])
  const [to, setTo] = useState(today)
  const [type, setType] = useState<'' | MovementType>('')
  const [product, setProduct] = useState(params.get('product') ?? '')
  const [q, setQ] = useState('')

  const { data, error, loading, reload } = useLoad(async () => {
    const catalog = await loadCatalog(org.id)
    const moves = await fetchAll<Movement>((a, b) => {
      let qb = supabase
        .from('stock_movements')
        .select('*, batches!inner(batch_no, expiry_date, product_id), profiles(full_name)')
        .eq('org_id', org.id)
        .gte('movement_date', from)
        .lte('movement_date', to)
      if (type) qb = qb.eq('type', type)
      if (product) qb = qb.eq('batches.product_id', product)
      return qb.order('movement_date', { ascending: false }).order('created_at', { ascending: false }).range(a, b)
    })
    return { catalog, moves }
  }, [org.id, from, to, type, product, version])

  const rows = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!data || !terms.length) return data?.moves ?? []
    return data.moves.filter((m) => {
      const p = m.batches ? data.catalog.byId.get(m.batches.product_id) : undefined
      const hay = `${p?.name ?? ''} ${p?.name_ur ?? ''} ${m.party ?? ''} ${m.reference ?? ''} ${m.batches?.batch_no ?? ''} ${m.note ?? ''}`.toLowerCase()
      return terms.every((x) => hay.includes(x))
    })
  }, [data, q])

  const del = async (m: Movement) => {
    if (!(await confirm(t('deleteEntryConfirm')))) return
    const { error } = await supabase.from('stock_movements').delete().eq('id', m.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('deleted'))
    refresh()
  }

  const exportCsv = () => {
    if (!data) return
    downloadCsv(`stock-history-${from}-to-${to}`, [t('date'), t('type'), t('product'), t('packSize'), t('batchNo'), t('qty'), t('party'), t('reference'), t('note'), t('by')],
      rows.map((m) => {
        const p = m.batches ? data.catalog.byId.get(m.batches.product_id) : undefined
        return [m.movement_date, t(`mv_${m.type}`), p?.name, p ? fmtPack(p.pack_size, p.pack_unit) : '', m.batches?.batch_no, m.qty, m.party, m.reference, m.note, authorOf(m)]
      }))
  }

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><HistoryIcon className="size-6 text-brand-700" /> {t('ledger')}</span>}
        subtitle={data ? `${rows.length} ${t('entries')}` : undefined}
        actions={<ReportButtons onExcel={exportCsv} />}
      />
      <PrintHeader title={t('ledger')} subtitle={`${fmtDate(from, lang)} – ${fmtDate(to, lang)}`} />

      <Card className="no-print mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('from')}><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={t('to')}><Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label={t('type')}>
            <Select value={type} onChange={(e) => setType(e.target.value as MovementType | '')}>
              <option value="">{t('allTypes')}</option>
              {ALL_TYPES.map((x) => <option key={x} value={x}>{t(`mv_${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('product')}>
            <Select value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">{t('allProducts')}</option>
              {data?.catalog.products.map((p) => (
                <option key={p.id} value={p.id}>{pick(p.name, p.name_ur)} · {fmtPack(p.pack_size, p.pack_unit, lang)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('search')}>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </Field>
        </div>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
      ) : (
        <Card className="print-plain">
          {rows.length === 0 ? (
            <Empty>{t('noEntries')}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th>{t('type')}</th>
                    <th>{t('product')}</th>
                    <th>{t('batch')}</th>
                    <th className="r">{t('qty')}</th>
                    <th>{t('party')}</th>
                    <th>{t('reference')}</th>
                    <th>{t('by')}</th>
                    {isAdmin && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const p = m.batches ? data!.catalog.byId.get(m.batches.product_id) : undefined
                    return (
                      <tr key={m.id}>
                        <td className="num whitespace-nowrap">{fmtDate(m.movement_date, lang)}</td>
                        <td><MovementBadge type={m.type} /></td>
                        <td>{p ? <ProductName p={p} /> : '—'}</td>
                        <td className="num">{m.batches?.batch_no}</td>
                        <td className="r">{p && <QtyCell packs={Number(m.qty)} p={p} strong />}</td>
                        <td>{m.party}{m.note && <div className="text-xs text-stone-500">{m.note}</div>}</td>
                        <td className="num">{m.reference}</td>
                        <td className="text-stone-500">{authorOf(m)}</td>
                        {isAdmin && (
                          <td className="no-print r">
                            <Button size="sm" variant="ghost" onClick={() => del(m)} aria-label={t('delete')}>
                              <Trash2 className="size-4 text-red-600" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
