import { FileText, Printer, Search, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PrintHeader, ReportButtons } from '../components/domain'
import { ReceiptModal } from '../components/Receipt'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Tabs, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { downloadCsv } from '../lib/csv'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate, monthOf, monthRange } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import { supabase } from '../lib/supabase'
import type { Purchase, Sale } from '../lib/types'

type SaleRow = Sale & { parties: { name: string } | null }
type PurchaseRow = Purchase & { parties: { name: string } | null }

export function Sales() {
  const { t, lang } = useI18n()
  const { org, today, version, isAdmin, refresh } = useOrg()
  const { toast, confirm } = useFeedback()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'purchases' ? 'purchases' : 'sales'
  const [from, setFrom] = useState(() => monthRange(monthOf(today))[0])
  const [to, setTo] = useState(today)
  const [q, setQ] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)

  const { data, error, loading, reload } = useLoad(async () => {
    if (tab === 'sales') {
      const rows = await fetchAll<SaleRow>((a, b) =>
        supabase.from('sales').select('*, parties(name)').eq('org_id', org.id).gte('sale_date', from).lte('sale_date', to)
          .order('invoice_no', { ascending: false }).range(a, b))
      return { sales: rows, purchases: [] as PurchaseRow[] }
    }
    const rows = await fetchAll<PurchaseRow>((a, b) =>
      supabase.from('purchases').select('*, parties(name)').eq('org_id', org.id).gte('purchase_date', from).lte('purchase_date', to)
        .order('purchase_no', { ascending: false }).range(a, b))
    return { sales: [] as SaleRow[], purchases: rows }
  }, [org.id, tab, from, to, version])

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const sales = useMemo(
    () => (data?.sales ?? []).filter((s) => terms.every((x) => `${s.invoice_no} ${s.parties?.name ?? ''} ${s.customer_name ?? ''} ${s.note ?? ''}`.toLowerCase().includes(x))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, q],
  )
  const purchases = useMemo(
    () => (data?.purchases ?? []).filter((p) => terms.every((x) => `${p.purchase_no} ${p.parties?.name ?? ''} ${p.supplier_name ?? ''} ${p.reference ?? ''}`.toLowerCase().includes(x))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, q],
  )
  const rows = tab === 'sales' ? sales : purchases
  const sum = rows.reduce((a, r) => ({ total: a.total + Number(r.total), paid: a.paid + Number(r.paid) }), { total: 0, paid: 0 })

  const voidSale = async (s: SaleRow) => {
    if (!(await confirm(t('voidInvoiceConfirm', { n: s.invoice_no })))) return
    const { error } = await supabase.from('sales').delete().eq('id', s.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('voided'))
    refresh()
  }
  const voidPurchase = async (p: PurchaseRow) => {
    if (!(await confirm(t('voidPurchaseConfirm', { n: p.purchase_no })))) return
    const { error } = await supabase.from('purchases').delete().eq('id', p.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('voided'))
    refresh()
  }

  const exportCsv = () =>
    tab === 'sales'
      ? downloadCsv(`invoices-${from}-${to}`, [t('invoiceNum'), t('date'), t('customer'), t('subtotal'), t('discount'), t('grandTotal'), t('received'), t('balanceDue'), t('by')],
          sales.map((s) => [s.invoice_no, s.sale_date, s.parties?.name ?? s.customer_name ?? t('walkIn'), s.subtotal, s.discount, s.total, s.paid, Number(s.total) - Number(s.paid), s.created_by_name]))
      : downloadCsv(`purchases-${from}-${to}`, ['#', t('date'), t('supplier'), t('reference'), t('grandTotal'), t('paidCol'), t('balanceDue'), t('by')],
          purchases.map((p) => [p.purchase_no, p.purchase_date, p.parties?.name ?? p.supplier_name, p.reference, p.total, p.paid, Number(p.total) - Number(p.paid), p.created_by_name]))

  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><FileText className="size-6 text-brand-700" /> {t('navSales')}</span>} actions={<ReportButtons onExcel={exportCsv} />} />
      <PrintHeader title={tab === 'sales' ? t('invoices') : t('purchases')} subtitle={`${fmtDate(from, lang)} – ${fmtDate(to, lang)}`} />
      <Tabs value={tab} onChange={(v) => setParams({ tab: v })} items={[{ value: 'sales', label: t('invoices') }, { value: 'purchases', label: t('purchases') }]} />

      <Card className="no-print mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('from')}><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={t('to')}><Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label={t('search')}>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </Field>
        </div>
      </Card>

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : (
        <Card className="print-plain">
          {rows.length === 0 ? <Empty>{t('noEntries')}</Empty> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('date')}</th>
                    <th>{tab === 'sales' ? t('customer') : t('supplier')}</th>
                    <th className="r">{t('grandTotal')}</th>
                    <th className="r">{tab === 'sales' ? t('received') : t('paidCol')}</th>
                    <th className="r">{t('balanceDue')}</th>
                    <th>{t('by')}</th>
                    <th className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  {tab === 'sales'
                    ? sales.map((s) => {
                        const due = Number(s.total) - Number(s.paid)
                        return (
                          <tr key={s.id} className="cursor-pointer" onClick={() => setReceipt(s.id)}>
                            <td className="num font-semibold">{s.invoice_no}</td>
                            <td className="num whitespace-nowrap">{fmtDate(s.sale_date, lang)}</td>
                            <td>
                              {s.party_id ? (
                                <button className="font-medium text-brand-700 hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); nav(`/khata/${s.party_id}`) }}>{s.parties?.name}</button>
                              ) : (
                                <span className="text-stone-600">{s.customer_name || t('walkIn')}</span>
                              )}
                              {Number(s.discount) > 0 && <div className="num text-xs text-stone-500">{t('discount')}: {fmtMoney(s.discount, lang)}</div>}
                            </td>
                            <td className="r num font-semibold">{fmtMoney(s.total, lang)}</td>
                            <td className="r num text-brand-700">{fmtMoney(s.paid, lang)}</td>
                            <td className="r">{due > 0 ? <Badge tone="amber">{fmtMoney(due, lang)}</Badge> : <span className="text-stone-300">—</span>}</td>
                            <td className="text-stone-500">{s.created_by_name}</td>
                            <td className="no-print r whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" onClick={() => setReceipt(s.id)} aria-label={t('printReceipt')} title={t('printReceipt')}><Printer className="size-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => nav(`/stock-in?type=return_in&invoice=${s.invoice_no}`)} aria-label={t('mv_return_in')} title={t('mv_return_in')}><Undo2 className="size-4" /></Button>
                              {isAdmin && <Button size="sm" variant="ghost" onClick={() => voidSale(s)} aria-label={t('voidDoc')} title={t('voidDoc')}><Trash2 className="size-4 text-red-600" /></Button>}
                            </td>
                          </tr>
                        )
                      })
                    : purchases.map((p) => {
                        const due = Number(p.total) - Number(p.paid)
                        return (
                          <tr key={p.id}>
                            <td className="num font-semibold">{p.purchase_no}</td>
                            <td className="num whitespace-nowrap">{fmtDate(p.purchase_date, lang)}</td>
                            <td>
                              {p.party_id ? (
                                <button className="font-medium text-brand-700 hover:underline cursor-pointer" onClick={() => nav(`/khata/${p.party_id}`)}>{p.parties?.name}</button>
                              ) : (
                                <span className="text-stone-600">{p.supplier_name || '—'}</span>
                              )}
                              {p.reference && <div className="num text-xs text-stone-500">{t('reference')}: {p.reference}</div>}
                            </td>
                            <td className="r num font-semibold">{fmtMoney(p.total, lang)}</td>
                            <td className="r num text-brand-700">{fmtMoney(p.paid, lang)}</td>
                            <td className="r">{due > 0 ? <Badge tone="red">{fmtMoney(due, lang)}</Badge> : <span className="text-stone-300">—</span>}</td>
                            <td className="text-stone-500">{p.created_by_name}</td>
                            <td className="no-print r">
                              {isAdmin && <Button size="sm" variant="ghost" onClick={() => voidPurchase(p)} aria-label={t('voidDoc')} title={t('voidDoc')}><Trash2 className="size-4 text-red-600" /></Button>}
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>{t('total')} ({rows.length})</td>
                    <td className="r num">{fmtMoney(sum.total, lang)}</td>
                    <td className="r num">{fmtMoney(sum.paid, lang)}</td>
                    <td className="r num">{fmtMoney(sum.total - sum.paid, lang)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}
      <ReceiptModal saleId={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}
