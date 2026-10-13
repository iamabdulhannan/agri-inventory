import { Banknote, ChevronDown, Landmark, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountPicker } from '../AccountPicker'
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, Segmented, Select, Textarea, useFeedback } from '../ui'
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
import { amountOf, loadFacilities, type Facility, type FacilityEntry, type FacilitySummary } from './money'
import { Explain, ExpiryDays, Figure, Meter, SelectNone } from './shared'

const EMPTY_SUM = (id: string): FacilitySummary => ({ facility_id: id, drawn: 0, repaid: 0, markup_paid: 0, owed: 0, guarantee_used: null })

export function FacilitiesTab() {
  const { t, lang } = useI18n()
  const { org, version, isAdmin, refresh } = useOrg()
  const { toast } = useFeedback()
  const { data, error, loading, reload } = useLoad(() => loadFacilities(org.id), [org.id, version])
  const [form, setForm] = useState<Facility | 'new' | null>(null)
  const [drawdown, setDrawdown] = useState<Facility | null>(null)
  const [repay, setRepay] = useState<Facility | null>(null)

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null

  const totalOwed = data.facilities.reduce((s, f) => s + (data.summary.get(f.id)?.owed ?? 0), 0)
  const saved = (close: () => void) => () => { close(); toast(t('saved')); refresh() }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-2">
        <Explain><b className="font-semibold text-stone-800">{t('bankFinance')}:</b> {t('bankFinanceExplain')}</Explain>
        <Explain><b className="font-semibold text-stone-800">{t('bankGuarantee')}:</b> {t('bankGuaranteeExplain')}</Explain>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-stone-500">{t('bankYouOweBanks')}</div>
            <div className={cx('num text-2xl font-bold sm:text-3xl', totalOwed > 0 && 'text-red-700')}>{fmtMoney(totalOwed, lang)}</div>
          </div>
          {isAdmin && <Button variant="secondary" onClick={() => setForm('new')}><Plus className="size-4" /> {t('bankAddFacility')}</Button>}
        </div>
      </Card>

      {data.facilities.length === 0 ? (
        <Card><Empty icon={<Landmark className="size-8 text-stone-300" />}>{t('bankNoFacilities')}{!isAdmin && <span className="text-xs">{t('bankAskOwner')}</span>}</Empty></Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.facilities.map((f) => (
            <FacilityCard
              key={f.id}
              f={f}
              sum={data.summary.get(f.id) ?? EMPTY_SUM(f.id)}
              entries={data.byFacility.get(f.id) ?? []}
              onEdit={() => setForm(f)}
              onDrawdown={() => setDrawdown(f)}
              onRepay={() => setRepay(f)}
            />
          ))}
        </div>
      )}

      <FacilityForm open={!!form} facility={form === 'new' ? null : form} hasEntries={form && form !== 'new' ? (data.byFacility.get(form.id)?.length ?? 0) > 0 : false} onClose={() => setForm(null)} onSaved={saved(() => setForm(null))} />
      <DrawdownModal facility={drawdown} onClose={() => setDrawdown(null)} onSaved={saved(() => setDrawdown(null))} />
      <RepayModal facility={repay} owed={repay ? data.summary.get(repay.id)?.owed ?? 0 : 0} onClose={() => setRepay(null)} onSaved={saved(() => setRepay(null))} />
    </div>
  )
}

function FacilityCard({
  f, sum, entries, onEdit, onDrawdown, onRepay,
}: { f: Facility; sum: FacilitySummary; entries: FacilityEntry[]; onEdit: () => void; onDrawdown: () => void; onRepay: () => void }) {
  const { t, lang } = useI18n()
  const { org, isAdmin, refresh } = useOrg()
  const { toast, confirm } = useFeedback()
  const { data: accounts } = useAccounts()
  const [open, setOpen] = useState(false)
  const finance = f.kind === 'finance'
  const used = finance ? sum.owed : Math.max(sum.guarantee_used ?? 0, 0)
  const ratio = f.limit_amount > 0 ? used / f.limit_amount : 0
  const linked = f.account_id ? accounts?.find((a) => a.id === f.account_id)?.name : null

  const removeEntry = async (e: FacilityEntry) => {
    if (!(await confirm(t('bankDeleteEntryConfirm', { amount: fmtMoney(e.amount, lang) })))) return
    // repayment / markup: delete the money entry, the facility entry goes with it
    const { error } = e.cash_entry_id
      ? await supabase.from('cash_entries').delete().eq('id', e.cash_entry_id).eq('org_id', org.id)
      : await supabase.from('facility_entries').delete().eq('id', e.id).eq('org_id', org.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('deleted'))
    refresh()
  }

  return (
    <Card className={cx('flex flex-col', !f.is_active && 'opacity-75')}>
      <div className="flex items-start gap-3 border-b border-stone-100 p-4">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', finance ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800')}>
          {finance ? <Banknote className="size-5" /> : <ShieldCheck className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-stone-900">{f.bank_name}</span>
            <Badge tone={finance ? 'amber' : 'blue'}>{finance ? t('bankFinance') : t('bankGuarantee')}</Badge>
            {!f.is_active && <Badge>{t('inactive')}</Badge>}
          </div>
          {f.title && <div className="truncate text-sm text-stone-600">{f.title}</div>}
          {!finance && f.party_id && (
            <div className="text-sm text-stone-600">
              {t('bankForCompany')}: <Link to={`/khata/${f.party_id}`} className="font-medium hover:underline">{f.parties?.name}</Link>
            </div>
          )}
        </div>
        {isAdmin && (
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={t('edit')} title={t('edit')}><Pencil className="size-4" /></Button>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
          <span>{t('bankLimit')}: <b className="num text-stone-900">{fmtMoney(f.limit_amount, lang)}</b></span>
          {f.expiry_date && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span>{finance ? t('bankRepayBy') : t('bankValidUntil')}: <span className="num">{fmtDate(f.expiry_date, lang)}</span></span>
              {(finance ? sum.owed > 0 : f.is_active) && <ExpiryDays date={f.expiry_date} />}
            </span>
          )}
          {linked && <span>{t('accountLabel')}: {linked}</span>}
        </div>

        {finance ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Figure label={t('bankOwedNow')} tone={sum.owed > 0 ? 'red' : undefined} className="col-span-2 sm:col-span-1">{fmtMoney(sum.owed, lang)}</Figure>
            <Figure label={t('bankRepaid')} tone="green">{fmtMoney(sum.repaid, lang)}</Figure>
            <Figure label={t('bankMarkupPaid')}>{fmtMoney(sum.markup_paid, lang)}</Figure>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Figure label={t('bankGuaranteeUsed')} tone={ratio > 1 ? 'red' : ratio > 0.8 ? 'amber' : undefined}>{fmtMoney(used, lang)}</Figure>
            <Figure label={t('bankGuaranteeLeft')}>{fmtMoney(Math.max(f.limit_amount - used, 0), lang)}</Figure>
            {sum.owed > 0 && <Figure label={t('bankOwedNow')} tone="red" className="col-span-2">{fmtMoney(sum.owed, lang)}</Figure>}
          </div>
        )}
        {f.limit_amount > 0 && (
          <div>
            <Meter value={used} max={f.limit_amount} tone={ratio > 1 ? 'red' : ratio > 0.8 ? 'amber' : 'brand'} />
            <div className="num mt-1 text-xs text-stone-500">
              {finance ? t('bankUsedOfLimit', { pct: Math.round(ratio * 100) }) : t('bankCoveredOfLimit', { pct: Math.round(ratio * 100) })}
            </div>
          </div>
        )}
        {!finance && ratio > 1 && <p className="text-sm text-red-700">{t('bankOverGuarantee')}</p>}
        {f.note && <p className="text-sm text-stone-500">{f.note}</p>}

        {isAdmin && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant={sum.owed > 0 ? 'secondary' : 'primary'} onClick={onDrawdown}>
              <Landmark className="size-4" /> {finance ? t('bankPaidCompany') : t('bankGuaranteeCashed')}
            </Button>
            {/* markup can still be due after the loan itself is paid back */}
            {(sum.owed > 0 || sum.drawn > 0) && (
              <Button size="sm" variant={sum.owed > 0 ? 'primary' : 'secondary'} onClick={onRepay}><Banknote className="size-4" /> {t('bankRepay')}</Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-stone-100">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 cursor-pointer">
          <span>{t('bankHistory')} ({entries.length})</span>
          <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          entries.length === 0 ? <div className="px-4 pb-4 text-sm text-stone-500">{t('bankNoHistory')}</div> : (
            <ul className="divide-y divide-stone-100 border-t border-stone-100">
              {entries.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={e.kind === 'drawdown' ? 'red' : e.kind === 'repayment' ? 'green' : 'orange'}>{t(`bankFe_${e.kind}`)}</Badge>
                      <span className="num text-stone-500">{fmtDate(e.entry_date, lang)}</span>
                    </div>
                    <div className="mt-0.5 text-stone-600">
                      {e.parties?.name && <Link to={`/khata/${e.party_id}`} className="font-medium hover:underline">{e.parties.name}</Link>}
                      {e.parties?.name && e.note ? ' · ' : ''}
                      {e.note}
                      {e.created_by_name && <span className="text-xs text-stone-400"> · {t('by')} {e.created_by_name}</span>}
                    </div>
                  </div>
                  <div className={cx('num shrink-0 font-semibold', e.kind === 'drawdown' ? 'text-red-700' : 'text-stone-900')}>{fmtMoney(e.amount, lang)}</div>
                  {isAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => removeEntry(e)} aria-label={t('delete')} title={t('delete')}><Trash2 className="size-4 text-red-600" /></Button>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </Card>
  )
}

function FacilityForm({
  open, facility, hasEntries, onClose, onSaved,
}: { open: boolean; facility: Facility | null; hasEntries: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { org, version } = useOrg()
  const { toast, confirm } = useFeedback()
  const { data: accounts } = useAccounts()
  const [kind, setKind] = useState<'finance' | 'guarantee'>('finance')
  const [bank, setBank] = useState('')
  const [title, setTitle] = useState('')
  const [limit, setLimit] = useState('')
  const [start, setStart] = useState('')
  const [expiry, setExpiry] = useState('')
  const [party, setParty] = useState('')
  const [account, setAccount] = useState('')
  const [active, setActive] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })
  const suppliers = useLoad(() => (open ? loadParties(org.id, 'supplier') : Promise.resolve([])), [org.id, open, version])

  if (last.open !== open || last.id !== (facility?.id ?? null)) {
    setLast({ open, id: facility?.id ?? null })
    if (open) {
      setKind(facility?.kind ?? 'finance')
      setBank(facility?.bank_name ?? '')
      setTitle(facility?.title ?? '')
      setLimit(facility?.limit_amount ? String(facility.limit_amount) : '')
      setStart(facility?.start_date ?? '')
      setExpiry(facility?.expiry_date ?? '')
      setParty(facility?.party_id ?? '')
      setAccount(facility?.account_id ?? '')
      setActive(facility?.is_active ?? true)
      setNote(facility?.note ?? '')
      setError('')
    }
  }

  const save = async () => {
    setError('')
    if (!bank.trim()) return setError(t('bankBankRequired'))
    const lim = limit.trim() === '' ? 0 : Number(limit)
    if (!(lim >= 0)) return setError(t('errInvalidAmount'))
    if (kind === 'guarantee' && !party) return setError(t('bankPickCompany'))
    if (start && expiry && expiry < start) return setError(t('errInvalidDate'))
    const row = {
      kind, bank_name: bank.trim(), title: title.trim() || null, limit_amount: r2(lim),
      start_date: start || null, expiry_date: expiry || null,
      party_id: kind === 'guarantee' ? party || null : null, account_id: account || null,
      is_active: active, note: note.trim() || null,
    }
    setBusy(true)
    const { error } = facility
      ? await supabase.from('bank_facilities').update(row).eq('id', facility.id).eq('org_id', org.id)
      : await supabase.from('bank_facilities').insert({ ...row, org_id: org.id })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }

  const remove = async () => {
    if (!facility || !(await confirm(t('bankDeleteFacilityConfirm')))) return
    setBusy(true)
    const { error } = await supabase.from('bank_facilities').delete().eq('id', facility.id).eq('org_id', org.id)
    setBusy(false)
    if (error) return setError(errText(error, t))
    toast(t('deleted'))
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={facility ? t('bankEditFacility') : t('bankAddFacility')}
      footer={
        <>
          {facility && !hasEntries && (
            <Button variant="ghost" className="me-auto text-red-700" onClick={remove} disabled={busy}><Trash2 className="size-4" /> {t('delete')}</Button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented value={kind} onChange={setKind} items={[{ value: 'finance', label: t('bankFinance') }, { value: 'guarantee', label: t('bankGuarantee') }]} />
        <p className="text-sm text-stone-500">{kind === 'finance' ? t('bankFinanceExplain') : t('bankGuaranteeExplain')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('bankBankName')} required>
            <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="HBL, MCB, Bank Alfalah" />
          </Field>
          <Field label={t('bankFacilityTitle')} optional>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'finance' ? t('bankTitleFinanceEg') : t('bankTitleGuaranteeEg')} />
          </Field>
        </div>
        {kind === 'guarantee' && (
          <Field label={t('bankGuaranteeFor')} required>
            <Select searchable value={party} onChange={(e) => setParty(e.target.value)}>
              <option value="">{t('bankChoose')}</option>
              {(suppliers.data ?? []).filter((p) => p.is_active || p.id === party).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('bankLimit')} hint={kind === 'finance' ? t('bankLimitFinanceHint') : t('bankLimitGuaranteeHint')}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} className="text-lg font-semibold" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('bankStartDate')} optional>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={kind === 'finance' ? t('bankRepayBy') : t('bankValidUntil')} optional>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
        {(accounts ?? []).length > 0 && (
          <Field label={t('bankLinkedAccount')} optional>
            <SelectNone value={account} onChange={setAccount} none={t('bankNone')} options={(accounts ?? []).filter((a) => a.is_active || a.id === account).map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
        )}
        <Field label={t('note')} optional>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {facility && <Checkbox checked={active} onChange={setActive} label={t('active')} />}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}

/** The bank paid a company for you (finance), or the company encashed the guarantee */
function DrawdownModal({ facility, onClose, onSaved }: { facility: Facility | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const { org, today, version } = useOrg()
  const { confirm } = useFeedback()
  const [party, setParty] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<string | null>(null)
  const [filled, setFilled] = useState(false)
  const open = !!facility
  const suppliers = useLoad(() => (open ? loadParties(org.id, 'supplier') : Promise.resolve([])), [org.id, open, version])
  const list = (suppliers.data ?? []).filter((p) => p.is_active || p.id === party).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
  const payable = (id: string) => Math.max(suppliers.data?.find((p) => p.id === id)?.balance ?? 0, 0)

  const pickParty = (id: string) => {
    setParty(id)
    const p = payable(id)
    setAmount(p > 0 ? String(p) : '')
  }

  if ((facility?.id ?? null) !== last) {
    setLast(facility?.id ?? null)
    if (facility) {
      setParty(facility.party_id ?? '')
      setAmount('')
      setFilled(false)
      setDate(today)
      setNote('')
      setError('')
    }
  }
  // the guarantee's company is pre-selected: fill its payable once the list has loaded
  if (facility && !filled && !suppliers.loading && (suppliers.data?.length ?? 0) > 0) {
    setFilled(true)
    if (party && payable(party) > 0) setAmount(String(payable(party)))
  }

  const save = async () => {
    if (!facility) return
    setError('')
    const n = amountOf(amount)
    if (!party) return setError(t('bankPickCompany'))
    if (!(n > 0)) return setError(t('errInvalidAmount'))
    if (date > today) return setError(t('errInvalidDate'))
    const name = suppliers.data?.find((p) => p.id === party)?.name ?? ''
    if (!(await confirm(t('bankDrawdownConfirm', { bank: facility.bank_name, amount: fmtMoney(n, lang), name }), false))) return
    setBusy(true)
    const { error } = await supabase.rpc('facility_drawdown', {
      p_org: org.id, p_facility: facility.id, p_date: date, p_amount: r2(n), p_party: party, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={facility?.kind === 'guarantee' ? t('bankGuaranteeCashed') : t('bankPaidCompany')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      {facility && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">{facility.kind === 'guarantee' ? t('bankGuaranteeCashedHint', { bank: facility.bank_name }) : t('bankPaidCompanyHint', { bank: facility.bank_name })}</p>
          <Field label={t('bankCompany')} required>
            <Select searchable value={party} onChange={(e) => pickParty(e.target.value)}>
              <option value="">{t('bankChoose')}</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.balance > 0 ? ` · ${t('youOwe')} ${fmtMoney(p.balance, lang)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          {party && (
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm ring-1 ring-inset ring-stone-200">
              {t('bankYouOweCompany')}: <b className="num">{fmtMoney(payable(party), lang)}</b>
            </div>
          )}
          <Field label={t('bankAmountBankPaid')} required>
            <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-semibold" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('date')}>
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t('note')} optional>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}
    </Modal>
  )
}

/** You pay the bank back: principal lowers what you owe; markup / charges is an expense */
function RepayModal({ facility, owed, onClose, onSaved }: { facility: Facility | null; owed: number; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { confirm } = useFeedback()
  const [principal, setPrincipal] = useState('')
  const [markup, setMarkup] = useState('')
  const [account, setAccount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<string | null>(null)
  const { data: accounts } = useAccounts()
  if ((facility?.id ?? null) !== last) {
    setLast(facility?.id ?? null)
    if (facility) {
      setPrincipal(owed > 0 ? String(owed) : '')
      setMarkup('')
      const linked = facility.account_id && accounts?.find((a) => a.id === facility.account_id && a.is_active)
      setAccount(linked ? facility.account_id ?? '' : '')
      setDate(today)
      setNote('')
      setError('')
    }
  }
  const p = principal.trim() === '' ? 0 : Number(principal)
  const m = markup.trim() === '' ? 0 : Number(markup)
  const total = (p > 0 ? p : 0) + (m > 0 ? m : 0)

  const save = async () => {
    if (!facility) return
    setError('')
    if (!(p >= 0) || !(m >= 0) || total <= 0) return setError(t('errInvalidAmount'))
    if (p > owed + 0.005) return setError(t('errRepayTooMuch'))
    if (date > today) return setError(t('errInvalidDate'))
    const from = account ? accounts?.find((a) => a.id === account)?.name ?? '' : t('cashInHandOpt')
    if (!(await confirm(t('bankRepayConfirm', { amount: fmtMoney(total, lang), bank: facility.bank_name, from }), false))) return
    setBusy(true)
    const { error } = await supabase.rpc('facility_repay', {
      p_org: org.id, p_facility: facility.id, p_date: date, p_principal: r2(p), p_markup: r2(m),
      p_account: account || null, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }

  return (
    <Modal
      open={!!facility}
      onClose={onClose}
      title={t('bankRepay')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      {facility && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 px-3 py-2 ring-1 ring-inset ring-red-200">
            <div className="text-sm text-red-800">{t('bankYouOweBank', { bank: facility.bank_name })}</div>
            <div className="num text-2xl font-bold text-red-700">{fmtMoney(owed, lang)}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('bankPrincipal')} hint={t('bankPrincipalHint')}>
              <Input type="number" min="0" step="any" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="text-lg font-semibold" />
            </Field>
            <Field label={t('bankMarkupCharges')} optional hint={t('bankMarkupHint')}>
              <Input type="number" min="0" step="any" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
            </Field>
          </div>
          <Field label={t('bankPaidFrom')}>
            <AccountPicker value={account} onChange={setAccount} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('date')}>
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t('note')} optional>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 font-semibold ring-1 ring-inset ring-stone-200">
            <span>{t('bankTotalPaying')}</span>
            <span className="num text-lg">{fmtMoney(total, lang)}</span>
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}
    </Modal>
  )
}
