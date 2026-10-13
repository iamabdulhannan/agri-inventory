import { ArrowLeftRight, BookOpen, Pencil, Plus, Power } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountPicker, accountIcon } from '../AccountPicker'
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, Segmented, useFeedback } from '../ui'
import { useAccounts } from '../../lib/accounts'
import { useOrg } from '../../lib/app'
import { cx } from '../../lib/cx'
import { useLoad } from '../../lib/data'
import { errText } from '../../lib/errors'
import { useI18n } from '../../lib/i18n'
import { fmtMoney, r2 } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { amountOf, loadPosition, type MoneyPosition, type PositionAccount } from './money'
import { Explain } from './shared'

export function AccountsTab() {
  const { t, lang } = useI18n()
  const { org, version, isAdmin, refresh } = useOrg()
  const { toast, confirm } = useFeedback()
  const nav = useNavigate()
  const { data, error, loading, reload } = useLoad(() => loadPosition(org.id), [org.id, version])
  const [form, setForm] = useState<PositionAccount | 'new' | null>(null)
  const [transfer, setTransfer] = useState(false)

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null

  const active = data.accounts.filter((a) => a.is_active)
  const inactive = data.accounts.filter((a) => !a.is_active)
  const inBanks = active.reduce((s, a) => s + a.balance, 0)

  const toggle = async (a: PositionAccount) => {
    const text = a.is_active
      ? t('bankDeactivateConfirm', { name: a.name }) + (Math.abs(a.balance) > 0.005 ? ' ' + t('bankStillHas', { amount: fmtMoney(a.balance, lang) }) : '')
      : t('bankActivateConfirm', { name: a.name })
    if (!(await confirm(text, a.is_active))) return
    const { error } = await supabase.from('money_accounts').update({ is_active: !a.is_active }).eq('id', a.id).eq('org_id', org.id)
    if (error) return toast(errText(error, t), 'err')
    toast(t('saved'))
    refresh()
  }

  return (
    <div className="space-y-4">
      <Explain>{t('bankAccountsExplain')}</Explain>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-stone-500">{t('bankAllMoney')}</div>
            <div className="num text-2xl font-bold sm:text-3xl">{fmtMoney(data.cash + inBanks, lang)}</div>
            {active.length > 0 && (
              <div className="num mt-0.5 text-xs text-stone-500">
                {t('cashInHandOpt')} {fmtMoney(data.cash, lang)} · {t('bankInBanks')} {fmtMoney(inBanks, lang)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button variant="secondary" onClick={() => setForm('new')}><Plus className="size-4" /> {t('bankAddAccount')}</Button>
            )}
            <Button onClick={() => setTransfer(true)} disabled={active.length === 0}><ArrowLeftRight className="size-4" /> {t('bankTransfer')}</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AccountCard
          kind="cash"
          name={t('cashInHandOpt')}
          sub={t('bankCashSub')}
          balance={data.cash}
          onOpen={() => nav('/roznamcha')}
        />
        {active.map((a) => (
          <AccountCard
            key={a.id}
            kind={a.kind}
            name={a.name}
            sub={[a.bank_name !== a.name ? a.bank_name : null, a.account_no].filter(Boolean).join(' · ')}
            balance={a.balance}
            onOpen={() => nav(`/roznamcha?account=${a.id}`)}
            onEdit={isAdmin ? () => setForm(a) : undefined}
            onToggle={isAdmin ? () => toggle(a) : undefined}
          />
        ))}
        {active.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 p-5 text-center text-sm text-stone-500">
            {t('bankNoAccounts')}
            {isAdmin ? (
              <Button size="sm" variant="secondary" onClick={() => setForm('new')}><Plus className="size-4" /> {t('bankAddAccount')}</Button>
            ) : (
              <span className="text-xs">{t('bankAskOwner')}</span>
            )}
          </div>
        )}
      </div>

      {inactive.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-500">{t('bankInactiveAccounts')}</h3>
          <div className="grid gap-3 opacity-75 sm:grid-cols-2 xl:grid-cols-3">
            {inactive.map((a) => (
              <AccountCard
                key={a.id}
                kind={a.kind}
                name={a.name}
                sub={[a.bank_name !== a.name ? a.bank_name : null, a.account_no].filter(Boolean).join(' · ')}
                balance={a.balance}
                inactive
                onOpen={() => nav(`/roznamcha?account=${a.id}`)}
                onEdit={isAdmin ? () => setForm(a) : undefined}
                onToggle={isAdmin ? () => toggle(a) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      <AccountForm open={!!form} account={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); toast(t('saved')); refresh() }} />
      <TransferModal open={transfer} position={data} onClose={() => setTransfer(false)} onSaved={() => { setTransfer(false); toast(t('saved')); refresh() }} />
    </div>
  )
}

function AccountCard({
  kind, name, sub, balance, inactive, onOpen, onEdit, onToggle,
}: {
  kind: 'cash' | 'bank' | 'wallet'
  name: string
  sub?: string | null
  balance: number
  inactive?: boolean
  onOpen: () => void
  onEdit?: () => void
  onToggle?: () => void
}) {
  const { t, lang } = useI18n()
  const Icon = accountIcon(kind)
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', kind === 'cash' ? 'bg-brand-50 text-brand-700' : kind === 'wallet' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800')}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-stone-900">{name}</span>
            {inactive && <Badge>{t('inactive')}</Badge>}
            {kind === 'wallet' && <Badge tone="blue">{t('bankWallet')}</Badge>}
          </div>
          {sub && <div className="num truncate text-xs text-stone-500" dir="auto">{sub}</div>}
        </div>
      </div>
      <div className={cx('num mt-3 text-2xl font-bold', balance < 0 && 'text-red-700')}>{fmtMoney(balance, lang)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-stone-100 pt-3">
        <Button size="sm" variant="secondary" onClick={onOpen}><BookOpen className="size-4" /> {kind === 'cash' ? t('navRoznamcha') : t('bankStatement')}</Button>
        <div className="ms-auto flex gap-1">
          {onEdit && <Button size="sm" variant="ghost" onClick={onEdit} aria-label={t('edit')} title={t('edit')}><Pencil className="size-4" /></Button>}
          {onToggle && (
            <Button size="sm" variant="ghost" onClick={onToggle} title={inactive ? t('activate') : t('deactivate')}>
              <Power className={cx('size-4', !inactive && 'text-red-600')} /> <span className="hidden sm:inline">{inactive ? t('activate') : t('deactivate')}</span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

const WALLETS = ['Easypaisa', 'JazzCash', 'SadaPay', 'NayaPay']

function AccountForm({ open, account, onClose, onSaved }: { open: boolean; account: PositionAccount | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const { org } = useOrg()
  const { data: accounts } = useAccounts()
  const [kind, setKind] = useState<'bank' | 'wallet'>('bank')
  const [name, setName] = useState('')
  const [bank, setBank] = useState('')
  const [no, setNo] = useState('')
  const [opening, setOpening] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })

  if (last.open !== open || last.id !== (account?.id ?? null)) {
    setLast({ open, id: account?.id ?? null })
    if (open) {
      setError('')
      setKind(account?.kind ?? 'bank')
      setName(account?.name ?? '')
      setBank(account?.bank_name ?? '')
      setNo(account?.account_no ?? '')
      // opening balance is not in money_position: take it from the accounts table
      const ob = Number(accounts?.find((x) => x.id === account?.id)?.opening_balance ?? 0)
      setOpening(account && ob ? String(ob) : '')
    }
  }

  const save = async () => {
    setError('')
    if (!name.trim()) return setError(t('bankNameRequired'))
    const ob = opening.trim() === '' ? 0 : Number(opening)
    if (!Number.isFinite(ob)) return setError(t('errInvalidAmount'))
    const row = { kind, name: name.trim(), bank_name: bank.trim() || null, account_no: no.trim() || null, opening_balance: r2(ob) }
    setBusy(true)
    const { error } = account
      ? await supabase.from('money_accounts').update(row).eq('id', account.id).eq('org_id', org.id)
      : await supabase.from('money_accounts').insert({ ...row, org_id: org.id })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? t('bankEditAccount') : t('bankAddAccount')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('type')}>
          <Segmented value={kind} onChange={setKind} items={[{ value: 'bank', label: t('bankBankAccount') }, { value: 'wallet', label: t('bankMobileWallet') }]} />
        </Field>
        {kind === 'wallet' && (
          <div className="flex flex-wrap gap-1.5">
            {WALLETS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => { setBank(w); if (!name.trim() || WALLETS.includes(name.trim())) setName(w) }}
                className={cx('rounded-full px-3 py-1 text-sm ring-1 ring-inset cursor-pointer', bank === w ? 'bg-brand-50 text-brand-800 ring-brand-200' : 'bg-surface text-stone-700 ring-stone-200 hover:bg-stone-50')}
              >
                {w}
              </button>
            ))}
          </div>
        )}
        <Field label={t('bankAccountName')} required hint={t('bankAccountNameHint')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'wallet' ? 'Easypaisa' : 'HBL'} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === 'wallet' ? t('bankService') : t('bankBankName')} optional>
            <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder={kind === 'wallet' ? 'Easypaisa, JazzCash' : 'Habib Bank'} />
          </Field>
          <Field label={kind === 'wallet' ? t('bankWalletNo') : t('bankAccountNo')} optional>
            <Input value={no} onChange={(e) => setNo(e.target.value)} dir="ltr" inputMode={kind === 'wallet' ? 'tel' : 'text'} />
          </Field>
        </div>
        <Field label={t('bankOpeningBalance')} optional hint={t('bankOpeningHint')}>
          <Input type="number" step="any" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}

/** Move money between cash in hand and accounts (bank deposit / withdrawal / wallet top-up) */
export function TransferModal({
  open, position, onClose, onSaved,
}: { open: boolean; position: MoneyPosition | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { confirm } = useFeedback()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wasOpen, setWasOpen] = useState(false)
  const active = (position?.accounts ?? []).filter((a) => a.is_active)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setFrom('')
      setTo(active[0]?.id ?? '')
      setAmount('')
      setDate(today)
      setNote('')
      setError('')
    }
  }
  const nameOf = (id: string) => (id ? position?.accounts.find((a) => a.id === id)?.name ?? '' : t('cashInHandOpt'))
  const balanceOf = (id: string) => (id ? position?.accounts.find((a) => a.id === id)?.balance ?? 0 : position?.cash ?? 0)
  const n = amountOf(amount)
  const short = position && n > 0 && n > balanceOf(from) + 0.005

  const save = async () => {
    setError('')
    if (from === to) return setError(t('bankSameAccount'))
    if (!(n > 0)) return setError(t('errInvalidAmount'))
    if (date > today) return setError(t('errInvalidDate'))
    if (!(await confirm(t('bankTransferConfirm', { amount: fmtMoney(n, lang), from: nameOf(from), to: nameOf(to) }), false))) return
    setBusy(true)
    const { error } = await supabase.rpc('record_transfer', {
      p_org: org.id, p_date: date, p_from: from || null, p_to: to || null, p_amount: r2(n), p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('bankTransfer')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}><ArrowLeftRight className="size-4" /> {t('bankTransferBtn')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-stone-500">{t('bankTransferHint')}</p>
        <Field label={t('bankFrom')} hint={position ? `${t('bankAvailable')}: ${fmtMoney(balanceOf(from), lang)}` : undefined}>
          <AccountPicker value={from} onChange={setFrom} />
        </Field>
        <Field label={t('bankTo')}>
          <AccountPicker value={to} onChange={setTo} />
        </Field>
        <Field label={t('amount')} required>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-semibold" />
        </Field>
        {short && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">{t('bankMoreThanAvailable')}</p>}
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
    </Modal>
  )
}
