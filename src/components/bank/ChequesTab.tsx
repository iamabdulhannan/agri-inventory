import { Ban, CheckCircle2, Plus, RotateCcw, Trash2, Undo2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountPicker } from '../AccountPicker'
import { PartyPicker } from '../PartyPicker'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Segmented, useFeedback } from '../ui'
import { useAccounts } from '../../lib/accounts'
import { useOrg } from '../../lib/app'
import { cx } from '../../lib/cx'
import { useLoad } from '../../lib/data'
import { errText } from '../../lib/errors'
import { fmtDate } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { fmtMoney, r2 } from '../../lib/money'
import { loadParties } from '../../lib/parties'
import { supabase } from '../../lib/supabase'
import type { PartyKind } from '../../lib/types'
import { amountOf, loadCheques, type Cheque, type ChequeStatus } from './money'
import { ChequeDueBadge, Explain, SelectNone } from './shared'

type Dir = 'received' | 'issued'
type StatusFilter = ChequeStatus | 'all'
const STATUS_TONE: Record<ChequeStatus, 'amber' | 'green' | 'red' | 'stone'> = { pending: 'amber', cleared: 'green', bounced: 'red', cancelled: 'stone' }

export function ChequesTab() {
  const { t, lang } = useI18n()
  const { org, version, isAdmin, refresh } = useOrg()
  const { toast, confirm } = useFeedback()
  const { data: accounts } = useAccounts()
  const [dir, setDir] = useState<Dir>('received')
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [adding, setAdding] = useState(false)
  const [clearing, setClearing] = useState<Cheque | null>(null)
  const { data, error, loading, reload } = useLoad(() => loadCheques(org.id), [org.id, version])

  const accName = (id: string | null) => (id ? accounts?.find((a) => a.id === id)?.name ?? '' : '')
  const all = data ?? []
  const pendingIn = all.filter((c) => c.direction === 'received' && c.status === 'pending')
  const pendingOut = all.filter((c) => c.direction === 'issued' && c.status === 'pending')
  const sum = (l: Cheque[]) => l.reduce((s, c) => s + c.amount, 0)

  const list = useMemo(() => {
    const l = (data ?? []).filter((c) => c.direction === dir && (status === 'all' || c.status === status))
    // pending: soonest cheque date first; others: latest first
    return l.sort((a, b) =>
      a.status === 'pending' && b.status === 'pending'
        ? a.cheque_date.localeCompare(b.cheque_date)
        : a.status === 'pending' ? -1 : b.status === 'pending' ? 1
          : (b.cleared_on ?? b.cheque_date).localeCompare(a.cleared_on ?? a.cheque_date) || b.created_at.localeCompare(a.created_at),
    )
  }, [data, dir, status])
  const listTotal = sum(list)

  const setStatusOf = async (c: Cheque, s: ChequeStatus) => {
    const msg =
      s === 'bounced' ? t('bankBounceConfirm', { amount: fmtMoney(c.amount, lang), name: c.parties?.name ?? '' })
        : s === 'cancelled' ? t('bankCancelConfirm', { amount: fmtMoney(c.amount, lang) })
          : c.status === 'cleared' ? t('bankUndoClearConfirm', { amount: fmtMoney(c.amount, lang) })
            : t('bankReopenConfirm')
    if (!(await confirm(msg, s !== 'pending' || c.status === 'cleared'))) return
    const { error } = await supabase.rpc('set_cheque_status', { p_org: org.id, p_cheque: c.id, p_status: s, p_date: null, p_account: null })
    if (error) return toast(errText(error, t), 'err')
    toast(t('saved'))
    refresh()
  }

  const remove = async (c: Cheque) => {
    if (!(await confirm(t('bankDeleteChequeConfirm', { amount: fmtMoney(c.amount, lang) })))) return
    const { error } = await supabase.from('cheques').delete().eq('id', c.id).eq('org_id', org.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('deleted'))
    refresh()
  }

  return (
    <div className="space-y-4">
      <Explain>{t('bankChequesExplain')}</Explain>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => { setDir('received'); setStatus('pending') }}
          className={cx('rounded-xl border p-4 text-start cursor-pointer', dir === 'received' ? 'border-brand-200 bg-brand-50' : 'border-stone-200 bg-surface')}
        >
          <div className="text-sm text-stone-500">{t('bankChequesInHand')}</div>
          <div className="num text-2xl font-bold text-brand-700">{fmtMoney(sum(pendingIn), lang)}</div>
          <div className="text-xs text-stone-500">{t('bankChequeCount', { n: pendingIn.length })}</div>
        </button>
        <button
          onClick={() => { setDir('issued'); setStatus('pending') }}
          className={cx('rounded-xl border p-4 text-start cursor-pointer', dir === 'issued' ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-surface')}
        >
          <div className="text-sm text-stone-500">{t('bankChequesGiven')}</div>
          <div className="num text-2xl font-bold text-red-700">{fmtMoney(sum(pendingOut), lang)}</div>
          <div className="text-xs text-stone-500">{t('bankChequeCount', { n: pendingOut.length })}</div>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={dir} onChange={setDir} items={[{ value: 'received', label: t('bankReceived') }, { value: 'issued', label: t('bankIssued') }]} />
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          className="max-w-full overflow-x-auto"
          items={[
            { value: 'pending', label: t('bankPending'), tone: 'amber' },
            { value: 'cleared', label: t('bankCleared') },
            { value: 'bounced', label: t('bankBounced') },
            { value: 'all', label: t('all') },
          ]}
        />
        <Button className="ms-auto" onClick={() => setAdding(true)}><Plus className="size-4" /> {t('bankAddCheque')}</Button>
      </div>

      {loading && !data ? <Loading /> : error ? <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox> : (
        <Card>
          {list.length === 0 ? (
            <Empty>{t('bankNoCheques')}</Empty>
          ) : (
            <>
              <ul className="divide-y divide-stone-100">
                {list.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <Link to={`/khata/${c.party_id}`} className="font-semibold text-stone-900 hover:underline">{c.parties?.name ?? '?'}</Link>
                        <div className="num text-xs text-stone-500" dir="auto">
                          {[c.cheque_no ? `#${c.cheque_no}` : null, c.bank_name].filter(Boolean).join(' · ') || t('bankNoChequeNo')}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className={cx('num text-xl font-bold', c.direction === 'received' ? 'text-brand-700' : 'text-red-700', c.status !== 'pending' && c.status !== 'cleared' && 'text-stone-400 line-through')}>
                          {fmtMoney(c.amount, lang)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                      <Badge tone={STATUS_TONE[c.status]}>{t(`bankSt_${c.status}`)}</Badge>
                      {c.status === 'pending' && <ChequeDueBadge date={c.cheque_date} />}
                      <span className="num">{t('bankChequeDate')}: {fmtDate(c.cheque_date, lang)}</span>
                      <span>·</span>
                      <span className="num">{c.direction === 'received' ? t('bankReceivedOn') : t('bankIssuedOn')}: {fmtDate(c.received_on, lang)}</span>
                      {c.status === 'cleared' && c.cleared_on && (
                        <><span>·</span><span className="num">{t('bankClearedOn')}: {fmtDate(c.cleared_on, lang)}</span></>
                      )}
                      {(c.status === 'bounced' || c.status === 'cancelled') && c.cleared_on && (
                        <><span>·</span><span className="num">{fmtDate(c.cleared_on, lang)}</span></>
                      )}
                      {c.account_id && (
                        <><span>·</span><span>{c.direction === 'received' ? t('bankDepositIn') : t('bankDrawnOn')}: {accName(c.account_id)}</span></>
                      )}
                      {c.created_by_name && <><span>·</span><span>{t('by')} {c.created_by_name}</span></>}
                    </div>
                    {c.note && <div className="mt-1 text-sm text-stone-600">{c.note}</div>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.status === 'pending' && (
                        <>
                          <Button size="sm" onClick={() => setClearing(c)}><CheckCircle2 className="size-4" /> {t('bankMarkCleared')}</Button>
                          <Button size="sm" variant="secondary" onClick={() => setStatusOf(c, 'bounced')}><XCircle className="size-4 text-red-600" /> {t('bankMarkBounced')}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setStatusOf(c, 'cancelled')}><Ban className="size-4" /> {t('bankMarkCancelled')}</Button>
                        </>
                      )}
                      {c.status === 'cleared' && isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => setStatusOf(c, 'pending')}><Undo2 className="size-4" /> {t('bankUndoClear')}</Button>
                      )}
                      {(c.status === 'bounced' || c.status === 'cancelled') && isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => setStatusOf(c, 'pending')}><RotateCcw className="size-4" /> {t('bankBackToPending')}</Button>
                      )}
                      {c.status !== 'cleared' && isAdmin && (
                        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => remove(c)} aria-label={t('delete')} title={t('delete')}>
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-4 py-3 font-semibold">
                <span>{t('total')} ({list.length})</span>
                <span className="num text-lg">{fmtMoney(listTotal, lang)}</span>
              </div>
            </>
          )}
        </Card>
      )}

      <ChequeForm open={adding} direction={dir} onClose={() => setAdding(false)} onSaved={(d) => { setAdding(false); setDir(d); setStatus('pending'); toast(t('saved')); refresh() }} />
      <ClearModal cheque={clearing} onClose={() => setClearing(null)} onSaved={() => { setClearing(null); toast(t('saved')); refresh() }} />
    </div>
  )
}

function ChequeForm({ open, direction, onClose, onSaved }: { open: boolean; direction: Dir; onClose: () => void; onSaved: (d: Dir) => void }) {
  const { t } = useI18n()
  const { org, today, version } = useOrg()
  const { data: accounts } = useAccounts()
  const [dir, setDir] = useState<Dir>(direction)
  const [party, setParty] = useState('')
  const [amount, setAmount] = useState('')
  const [no, setNo] = useState('')
  const [bank, setBank] = useState('')
  const [chequeDate, setChequeDate] = useState(today)
  const [on, setOn] = useState(today)
  const [account, setAccount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wasOpen, setWasOpen] = useState(false)
  const kind: PartyKind = dir === 'received' ? 'customer' : 'supplier'
  const parties = useLoad(() => (open ? loadParties(org.id, kind) : Promise.resolve([])), [org.id, kind, open, version])
  const activeAccounts = (accounts ?? []).filter((a) => a.is_active)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDir(direction)
      setParty('')
      setAmount('')
      setNo('')
      setBank('')
      setChequeDate(today)
      setOn(today)
      setAccount(direction === 'issued' ? activeAccounts[0]?.id ?? '' : '')
      setNote('')
      setError('')
    }
  }

  const changeDir = (d: Dir) => {
    setDir(d)
    setParty('')
    setAccount(d === 'issued' ? activeAccounts[0]?.id ?? '' : '')
  }

  const save = async () => {
    setError('')
    const n = amountOf(amount)
    if (!party) return setError(dir === 'received' ? t('bankPickCustomer') : t('bankPickCompany'))
    if (!(n > 0)) return setError(t('errInvalidAmount'))
    if (!chequeDate) return setError(t('errInvalidDate'))
    if (on > today) return setError(t('errInvalidDate'))
    if (dir === 'issued' && !account) return setError(t('bankPickAccount'))
    setBusy(true)
    const { error } = await supabase.rpc('record_cheque', {
      p_org: org.id, p_direction: dir, p_party: party, p_amount: r2(n), p_cheque_date: chequeDate,
      p_cheque_no: no.trim() || null, p_bank_name: bank.trim() || null, p_received_on: on || today,
      p_account: account || null, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved(dir)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bankAddCheque')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented value={dir} onChange={changeDir} items={[{ value: 'received', label: t('bankChequeFromCustomer') }, { value: 'issued', label: t('bankChequeToCompany') }]} />
        <p className="text-sm text-stone-500">{dir === 'received' ? t('bankChequeReceivedHint') : t('bankChequeIssuedHint')}</p>
        <Field label={dir === 'received' ? t('customer') : t('supplier')} required>
          <PartyPicker
            kind={kind}
            parties={parties.data ?? []}
            value={party}
            onChange={setParty}
            onCreated={(id) => { parties.reload(); setParty(id) }}
            noneLabel={t('bankChoose')}
          />
        </Field>
        <Field label={t('amount')} required>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-semibold" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('bankChequeNo')} optional>
            <Input value={no} onChange={(e) => setNo(e.target.value)} dir="ltr" inputMode="numeric" />
          </Field>
          <Field label={t('bankChequeBank')} optional>
            <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="HBL, MCB, UBL" />
          </Field>
          <Field label={t('bankChequeDate')} required hint={t('bankChequeDateHint')}>
            <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
          </Field>
          <Field label={dir === 'received' ? t('bankReceivedOn') : t('bankIssuedOn')}>
            <Input type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} />
          </Field>
        </div>
        {dir === 'issued' ? (
          activeAccounts.length === 0 ? (
            <ErrorBox>{t('bankNeedAccount')}</ErrorBox>
          ) : (
            <Field label={t('bankDrawnOn')} required>
              <AccountPicker value={account} onChange={setAccount} cash={false} />
            </Field>
          )
        ) : activeAccounts.length > 0 && (
          <Field label={t('bankWillDepositIn')} optional>
            <AccountPickerOptional value={account} onChange={setAccount} />
          </Field>
        )}
        <Field label={t('note')} optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}

/** Bank account or "not decided yet" */
function AccountPickerOptional({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const { data: accounts } = useAccounts()
  return (
    <SelectNone value={value} onChange={onChange} none={t('bankNotDecided')} options={(accounts ?? []).filter((a) => a.is_active || a.id === value).map((a) => ({ value: a.id, label: a.name }))} />
  )
}

function ClearModal({ cheque, onClose, onSaved }: { cheque: Cheque | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { confirm } = useFeedback()
  const { data: accounts } = useAccounts()
  const [account, setAccount] = useState('')
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<string | null>(null)
  const active = (accounts ?? []).filter((a) => a.is_active)
  if ((cheque?.id ?? null) !== last) {
    setLast(cheque?.id ?? null)
    if (cheque) {
      setAccount(cheque.account_id ?? active[0]?.id ?? '')
      setDate(today)
      setError('')
    }
  }
  const save = async () => {
    if (!cheque) return
    setError('')
    if (!account) return setError(t('bankPickAccount'))
    if (date > today) return setError(t('errInvalidDate'))
    const name = accounts?.find((a) => a.id === account)?.name ?? ''
    if (!(await confirm(t('bankClearConfirm', { amount: fmtMoney(cheque.amount, lang), account: name }), false))) return
    setBusy(true)
    const { error } = await supabase.rpc('set_cheque_status', { p_org: org.id, p_cheque: cheque.id, p_status: 'cleared', p_date: date, p_account: account })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }
  return (
    <Modal
      open={!!cheque}
      onClose={onClose}
      size="sm"
      title={t('bankMarkCleared')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy} disabled={active.length === 0}><CheckCircle2 className="size-4" /> {t('bankMarkCleared')}</Button>
        </>
      }
    >
      {cheque && (
        <div className="space-y-3">
          <div className="rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200">
            <div className="font-semibold">{cheque.parties?.name}</div>
            <div className="num text-2xl font-bold">{fmtMoney(cheque.amount, lang)}</div>
            <div className="num text-xs text-stone-500">{[cheque.cheque_no ? `#${cheque.cheque_no}` : null, cheque.bank_name, fmtDate(cheque.cheque_date, lang)].filter(Boolean).join(' · ')}</div>
          </div>
          <p className="text-sm text-stone-500">{cheque.direction === 'received' ? t('bankClearReceivedHint') : t('bankClearIssuedHint')}</p>
          {active.length === 0 ? (
            <ErrorBox>{t('bankNeedAccount')}</ErrorBox>
          ) : (
            <Field label={cheque.direction === 'received' ? t('bankDepositIn') : t('bankDrawnOn')} required>
              <AccountPicker value={account} onChange={setAccount} cash={false} />
            </Field>
          )}
          <Field label={t('bankClearedOn')}>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}
    </Modal>
  )
}
