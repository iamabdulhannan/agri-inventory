import { ArrowLeft, BookUser, HandCoins, Pencil, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PrintHeader, ReportButtons } from '../components/domain'
import { PartyForm } from '../components/PartyForm'
import { ReceiptModal } from '../components/Receipt'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Tabs, useFeedback } from '../components/ui'
import { useOrg } from '../lib/app'
import { downloadCsv } from '../lib/csv'
import { cx } from '../lib/cx'
import { useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import { loadParties } from '../lib/parties'
import { supabase } from '../lib/supabase'
import type { LedgerRow, PartyBalance, PartyKind } from '../lib/types'

/** "Owes you Rs 1,400" / "You owe Rs 2,900" / "Settled" */
export function BalanceBadge({ kind, balance }: { kind: PartyKind; balance: number }) {
  const { t, lang } = useI18n()
  if (Math.abs(balance) < 0.005) return <Badge>{t('settled')}</Badge>
  if (balance < 0) return <Badge tone="blue">{t('advance')} {fmtMoney(-balance, lang)}</Badge>
  return <Badge tone={kind === 'customer' ? 'amber' : 'red'}>{kind === 'customer' ? t('theyOwe') : t('youOwe')} {fmtMoney(balance, lang)}</Badge>
}

export function KhataList() {
  const { t, lang } = useI18n()
  const { org, version, refresh } = useOrg()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const kind: PartyKind = params.get('kind') === 'supplier' ? 'supplier' : 'customer'
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const { data, error, loading, reload } = useLoad(() => loadParties(org.id), [org.id, version])

  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (data ?? [])
      .filter((p) => p.kind === kind)
      .filter((p) => terms.every((x) => `${p.name} ${p.phone ?? ''} ${p.address ?? ''}`.toLowerCase().includes(x)))
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
  }, [data, kind, q])

  const receivable = (data ?? []).filter((p) => p.kind === 'customer' && p.balance > 0).reduce((s, p) => s + p.balance, 0)
  const payable = (data ?? []).filter((p) => p.kind === 'supplier' && p.balance > 0).reduce((s, p) => s + p.balance, 0)

  const exportCsv = () =>
    downloadCsv(`khata-${kind}s`, [t('name'), t('phone'), t('address'), t('balance'), t('lastActivity')],
      list.map((p) => [p.name, p.phone, p.address, p.balance, p.last_activity]))

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><BookUser className="size-6 text-brand-700" /> {t('navKhata')}</span>}
        actions={
          <>
            <ReportButtons onExcel={exportCsv} />
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> {kind === 'customer' ? t('addCustomer') : t('addSupplier')}
            </Button>
          </>
        }
      />
      <PrintHeader title={`${t('navKhata')} · ${kind === 'customer' ? t('customers') : t('suppliers')}`} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <button onClick={() => setParams({ kind: 'customer' })} className={cx('rounded-xl border p-4 text-start cursor-pointer', kind === 'customer' ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-surface')}>
          <div className="text-sm text-stone-500">{t('totalReceivable')}</div>
          <div className="num text-2xl font-bold text-amber-800">{fmtMoney(receivable, lang)}</div>
        </button>
        <button onClick={() => setParams({ kind: 'supplier' })} className={cx('rounded-xl border p-4 text-start cursor-pointer', kind === 'supplier' ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-surface')}>
          <div className="text-sm text-stone-500">{t('totalPayable')}</div>
          <div className="num text-2xl font-bold text-red-700">{fmtMoney(payable, lang)}</div>
        </button>
      </div>

      <Tabs
        value={kind}
        onChange={(v) => setParams({ kind: v })}
        items={[
          { value: 'customer', label: `${t('customers')} (${(data ?? []).filter((p) => p.kind === 'customer').length})` },
          { value: 'supplier', label: `${t('suppliers')} (${(data ?? []).filter((p) => p.kind === 'supplier').length})` },
        ]}
      />
      <div className="no-print relative mb-3">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
      </div>

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : (
        <Card className="print-plain">
          {list.length === 0 ? (
            <Empty>{kind === 'customer' ? t('noCustomers') : t('noSuppliers')}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('name')}</th>
                    <th>{t('phone')}</th>
                    <th>{t('lastActivity')}</th>
                    <th className="r">{t('balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => nav(`/khata/${p.id}`)}>
                      <td>
                        <div className="font-medium">{p.name}</div>
                        {p.address && <div className="text-xs text-stone-500">{p.address}</div>}
                      </td>
                      <td className="num" dir="ltr">{p.phone}</td>
                      <td className="num text-stone-500">{fmtDate(p.last_activity, lang)}</td>
                      <td className="r"><BalanceBadge kind={p.kind} balance={p.balance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <PartyForm
        open={adding}
        onClose={() => setAdding(false)}
        kind={kind}
        onSaved={(id) => {
          setAdding(false)
          refresh()
          nav(`/khata/${id}`)
        }}
      />
    </div>
  )
}

export function KhataDetail() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const { org, version, refresh, isAdmin } = useOrg()
  const { toast, confirm } = useFeedback()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [receipt, setReceipt] = useState<string | null>(null)

  const { data, error, loading, reload } = useLoad(async () => {
    const [p, ledger] = await Promise.all([
      supabase.from('party_balances').select('*').eq('id', id).single(),
      supabase.rpc('party_ledger', { p_party: id }),
    ])
    if (p.error) throw p.error
    if (ledger.error) throw ledger.error
    return { party: { ...(p.data as PartyBalance), balance: Number(p.data.balance) }, ledger: (ledger.data ?? []) as LedgerRow[] }
  }, [id, version, org.id])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null
  const { party, ledger } = data
  const isCustomer = party.kind === 'customer'
  const totals = ledger.reduce((a, r) => ({ bill: a.bill + Number(r.bill), paid: a.paid + Number(r.paid) }), { bill: 0, paid: 0 })

  const remove = async () => {
    if (!(await confirm(t('deletePartyConfirm')))) return
    const { error } = await supabase.from('parties').delete().eq('id', party.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('deleted'))
    refresh()
    nav(`/khata?kind=${party.kind}`)
  }

  const exportCsv = () =>
    downloadCsv(`khata-${party.name}`, [t('date'), t('type'), t('reference'), t('note'), t('bill'), t('paidCol'), t('balance')],
      ledger.map((r) => [r.entry_date, t(`lk_${r.kind}`), r.ref, r.note, r.bill, r.paid, r.balance]))

  return (
    <div className="space-y-5">
      <Link to={`/khata?kind=${party.kind}`} className="no-print inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {isCustomer ? t('customers') : t('suppliers')}
      </Link>
      <PrintHeader title={`${t('ledger_')} · ${party.name}`} subtitle={party.phone ?? undefined} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{party.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <Badge tone={isCustomer ? 'green' : 'blue'}>{isCustomer ? t('customers') : t('suppliers')}</Badge>
            {party.phone && <span className="num" dir="ltr">{party.phone}</span>}
            {party.address && <span>{party.address}</span>}
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button onClick={() => setPaying(true)}>
            <HandCoins className="size-4" /> {isCustomer ? t('receivePayment') : t('paySupplier')}
          </Button>
          {isCustomer && (
            <Button variant="warning" onClick={() => nav(`/stock-out?party=${party.id}`)}><ShoppingCart className="size-4" /> {t('newSale')}</Button>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> {t('edit')}</Button>
          <ReportButtons onExcel={exportCsv} />
          {isAdmin && ledger.length === 0 && (
            <Button variant="danger" onClick={remove}><Trash2 className="size-4" /></Button>
          )}
        </div>
      </div>

      <div className={cx('rounded-xl border p-5', party.balance > 0 ? (isCustomer ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50') : 'border-stone-200 bg-surface')}>
        <div className="text-sm text-stone-500">{t('balance')}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="num text-3xl font-bold">{fmtMoney(Math.abs(party.balance), lang)}</span>
          <BalanceBadge kind={party.kind} balance={party.balance} />
        </div>
      </div>

      <Card title={t('ledger_')} className="print-plain">
        {ledger.length === 0 ? <Empty>{t('noEntries')}</Empty> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('type')}</th>
                  <th>{t('reference')}</th>
                  <th className="r">{t('bill')}</th>
                  <th className="r">{t('paidCol')}</th>
                  <th className="r">{t('balance')}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r, i) => (
                  <tr key={i} className={cx(r.kind === 'sale' && 'cursor-pointer')} onClick={() => r.kind === 'sale' && r.doc_id && setReceipt(r.doc_id)}>
                    <td className="num whitespace-nowrap">{fmtDate(r.entry_date, lang)}</td>
                    <td>
                      <Badge tone={r.kind === 'receipt' || r.kind === 'payment' ? 'green' : r.kind === 'opening' ? 'stone' : isCustomer ? 'amber' : 'red'}>{t(`lk_${r.kind}`)}</Badge>
                      {r.note && <div className="text-xs text-stone-500">{r.note}</div>}
                    </td>
                    <td className="num">{r.ref}</td>
                    <td className="r num">{Number(r.bill) ? fmtMoney(r.bill, lang) : ''}</td>
                    <td className="r num text-brand-700">{Number(r.paid) ? fmtMoney(r.paid, lang) : ''}</td>
                    <td className="r num font-semibold">{fmtMoney(r.balance, lang)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t('total')}</td>
                  <td className="r num">{fmtMoney(totals.bill, lang)}</td>
                  <td className="r num">{fmtMoney(totals.paid, lang)}</td>
                  <td className="r num">{fmtMoney(party.balance, lang)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <PartyForm open={editing} onClose={() => setEditing(false)} kind={party.kind} party={party} onSaved={() => { setEditing(false); toast(t('partySaved')); refresh() }} />
      <PaymentModal open={paying} onClose={() => setPaying(false)} party={party} onSaved={() => { setPaying(false); toast(t('paymentSaved')); refresh() }} />
      <ReceiptModal saleId={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}

function PaymentModal({ open, onClose, party, onSaved }: { open: boolean; onClose: () => void; party: PartyBalance; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState(false)
  if (open !== last) {
    setLast(open)
    if (open) {
      setAmount(party.balance > 0 ? String(party.balance) : '')
      setDate(today)
      setNote('')
      setError('')
    }
  }
  const isCustomer = party.kind === 'customer'
  const save = async () => {
    setError('')
    if (!(Number(amount) > 0)) return setError(t('errInvalidAmount'))
    setBusy(true)
    const { error } = await supabase.rpc('record_party_payment', { p_org: org.id, p_party: party.id, p_date: date, p_amount: Number(amount), p_note: note || null })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={isCustomer ? t('receivePayment') : t('paySupplier')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <div className="mb-4 rounded-lg bg-stone-50 px-3 py-2 text-sm">
        <div className="font-medium">{party.name}</div>
        <div className="num text-stone-600">{t('balance')}: {fmtMoney(party.balance, lang)}</div>
      </div>
      <div className="space-y-3">
        <Field label={t('amount')} required>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('date')}>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('note')} hint={t('optional')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {Number(amount) > 0 && (
          <div className="num text-sm text-stone-600">{t('newBalance')}: <b>{fmtMoney(party.balance - Number(amount), lang)}</b></div>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}
