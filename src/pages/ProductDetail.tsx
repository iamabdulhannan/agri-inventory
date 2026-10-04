import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Pencil, Power, Scale, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExpiryBadge, QtyCell } from '../components/domain'
import { usePackLabel } from '../lib/packLabel'
import { ProductForm } from '../components/ProductForm'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Textarea, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { authorOf, type BatchStock, type Movement } from '../lib/types'
import { fmtNum } from '../lib/units'
import { fmtMoney } from '../lib/money'
import { MovementBadge } from './Dashboard'

export function ProductDetail() {
  const { id = '' } = useParams()
  const { org, version, refresh, isAdmin } = useOrg()
  const { t, pick, lang } = useI18n()
  const { toast, confirm } = useFeedback()
  const nav = useNavigate()
  const label = usePackLabel()
  const [editing, setEditing] = useState(false)
  const [adjusting, setAdjusting] = useState<BatchStock | null>(null)

  const { data, error, loading, reload } = useLoad(async () => {
    const [catalog, batches, moves] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<BatchStock>((a, b) => supabase.from('batch_stock').select('*').eq('product_id', id).order('expiry_date').range(a, b)),
      supabase
        .from('stock_movements')
        .select('*, batches!inner(batch_no, expiry_date, product_id), profiles(full_name)')
        .eq('batches.product_id', id)
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300),
    ])
    if (moves.error) throw moves.error
    return { catalog, batches, moves: (moves.data ?? []) as Movement[] }
  }, [org.id, id, version])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  const p = data?.catalog.byId.get(id)
  if (!data || !p) return <Empty>{t('noData')}</Empty>

  const withStock = data.batches.filter((b) => Number(b.qty) > 0)
  const empty = data.batches.filter((b) => Number(b.qty) <= 0)

  const toggleActive = async () => {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) return toast(errText(error, t), 'err')
    refresh()
  }
  const remove = async () => {
    // products with stock history are kept for the records: deactivate instead
    if (data.moves.length > 0) return toast(t('errProductHasHistory'), 'err')
    if (!(await confirm(t('deleteProductConfirm')))) return
    // empty batches (no entries) go with the product
    const b = await supabase.from('batches').delete().eq('product_id', p.id)
    if (b.error) return toast(errText(b.error, t), 'err')
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('deleted'))
    refresh()
    nav('/products')
  }

  return (
    <div className="space-y-5">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t('products')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {pick(p.name, p.name_ur)} <span className="num text-brand-800">· {label(p)}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
            {p.company_name && <span>{p.company_name}</span>}
            <Badge>{pick(p.category_name, p.category_name_ur)}</Badge>
            {!p.is_active && <Badge tone="red">{t('inactive')}</Badge>}
            {p.min_stock > 0 && p.qty <= p.min_stock && <Badge tone="red">{t('lowStock')}</Badge>}
          </div>
          {p.notes && <p className="mt-2 max-w-2xl text-sm text-stone-600">{p.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => nav(`/stock-in?product=${p.id}`)}><ArrowDownToLine className="size-4" /> {t('navStockIn')}</Button>
          <Button variant="warning" onClick={() => nav(`/stock-out?product=${p.id}`)} disabled={p.qty <= 0}><ArrowUpFromLine className="size-4" /> {t('navStockOut')}</Button>
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> {t('edit')}</Button>
          {isAdmin && (
            <Button variant="secondary" onClick={toggleActive}><Power className="size-4" /> {p.is_active ? t('deactivate') : t('activate')}</Button>
          )}
          {isAdmin && (
            <Button variant="danger" onClick={remove}><Trash2 className="size-4" /> {t('delete')}</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-stone-200 bg-surface p-4">
          <div className="text-sm text-stone-500">{t('stock')}</div>
          <div className="mt-1 text-2xl font-bold"><QtyCell packs={p.qty} p={p} strong /></div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-surface p-4">
          <div className="text-sm text-stone-500">{t('nextExpiry')}</div>
          <div className="mt-1"><ExpiryBadge date={p.next_expiry} /></div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-surface p-4">
          <div className="text-sm text-stone-500">{t('minStock')}</div>
          <div className="num mt-1 text-2xl font-bold">{fmtNum(p.min_stock)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-surface p-4">
          <div className="text-sm text-stone-500">{t('purchasePrice')} / {t('mrp')}</div>
          <div className="num mt-1 text-lg font-bold">{fmtMoney(p.purchase_price, lang)} / {fmtMoney(p.sale_price, lang)}</div>
          {Number(p.sale_price) > 0 && Number(p.purchase_price) > 0 && (
            <div className="num text-xs text-brand-700">{t('profit')}: {fmtMoney(Number(p.sale_price) - Number(p.purchase_price), lang)}</div>
          )}
        </div>
        <div className="rounded-xl border border-stone-200 bg-surface p-4">
          <div className="text-sm text-stone-500">{t('stockValue')}</div>
          <div className="num mt-1 text-lg font-bold">{fmtMoney(p.stock_value, lang)}</div>
        </div>
      </div>

      <Card title={`${t('batches')} (${withStock.length})`}>
        {data.batches.length === 0 ? (
          <Empty>{t('noBatches')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('batchNo')}</th>
                  <th>{t('mfgDate')}</th>
                  <th>{t('expiryDate')}</th>
                  <th className="r">{t('stock')}</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {[...withStock, ...empty].map((b) => (
                  <tr key={b.id} className={Number(b.qty) <= 0 ? 'text-stone-400' : undefined}>
                    <td className="num font-medium">{b.batch_no}</td>
                    <td className="num">{fmtDate(b.mfg_date, lang)}</td>
                    <td>{Number(b.qty) > 0 ? <ExpiryBadge date={b.expiry_date} /> : <span className="num">{fmtDate(b.expiry_date, lang)}</span>}</td>
                    <td className="r"><QtyCell packs={Number(b.qty)} p={p} strong={Number(b.qty) > 0} /></td>
                    {isAdmin && (
                      <td className="r">
                        <Button size="sm" variant="ghost" onClick={() => setAdjusting(b)}><Scale className="size-4" /> {t('adjust')}</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('history')} action={<Link className="text-sm font-medium text-brand-700 hover:underline" to={`/history?product=${p.id}`}>{t('viewAll')}</Link>}>
        {data.moves.length === 0 ? (
          <Empty>{t('noActivity')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('type')}</th>
                  <th>{t('batch')}</th>
                  <th className="r">{t('qty')}</th>
                  <th className="r">{t('rate')}</th>
                  <th>{t('party')}</th>
                  <th>{t('reference')}</th>
                  <th>{t('by')}</th>
                </tr>
              </thead>
              <tbody>
                {data.moves.map((m) => (
                  <tr key={m.id}>
                    <td className="num whitespace-nowrap">{fmtDate(m.movement_date, lang)}</td>
                    <td><MovementBadge type={m.type} /></td>
                    <td className="num">{m.batches?.batch_no}</td>
                    <td className="r"><QtyCell packs={Number(m.qty)} p={p} /></td>
                    <td className="r num">{m.unit_price != null ? fmtMoney(m.unit_price, lang) : ''}</td>
                    <td>{m.party}</td>
                    <td className="num">{m.reference}</td>
                    <td className="text-stone-500">{authorOf(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProductForm
        open={editing}
        onClose={() => setEditing(false)}
        catalog={data.catalog}
        product={p}
        onSaved={() => {
          setEditing(false)
          toast(t('productSaved'))
          refresh()
        }}
      />
      <AdjustModal batch={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); refresh(); toast(t('saved')) }} />
    </div>
  )
}

function AdjustModal({ batch, onClose, onDone }: { batch: BatchStock | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n()
  const { org } = useOrg()
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastId, setLastId] = useState<string | null>(null)
  if (batch && batch.id !== lastId) {
    setLastId(batch.id)
    setCounted(String(batch.qty))
    setNote('')
    setError('')
  }

  const save = async () => {
    if (!batch) return
    const n = Number(counted)
    if (counted === '' || !(n >= 0)) return setError(t('errQty'))
    setBusy(true)
    const { error } = await supabase.rpc('adjust_batch', { p_org: org.id, p_batch: batch.id, p_counted: n, p_note: note || null })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onDone()
  }

  return (
    <Modal
      open={!!batch}
      onClose={onClose}
      size="sm"
      title={`${t('adjust')} · ${batch?.batch_no ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-stone-500">{t('adjustHint')}</p>
      <Field label={t('countedQty')}>
        <Input type="number" min="0" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} />
      </Field>
      {batch && counted !== '' && Number(counted) !== Number(batch.qty) && (
        <p className="num mt-2 text-sm">
          {fmtNum(batch.qty)} → {fmtNum(Number(counted))} ({Number(counted) - Number(batch.qty) > 0 ? '+' : ''}{fmtNum(Number(counted) - Number(batch.qty))})
        </p>
      )}
      <Field label={t('note')} className="mt-3">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
    </Modal>
  )
}
