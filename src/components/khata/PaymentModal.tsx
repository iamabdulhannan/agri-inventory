import { Info } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccounts } from '../../lib/accounts'
import { useOrg } from '../../lib/app'
import { errText } from '../../lib/errors'
import { useI18n } from '../../lib/i18n'
import { fmtMoney } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import type { PartyBalance } from '../../lib/types'
import { AccountPicker } from '../AccountPicker'
import { Button, ErrorBox, Field, Input, Modal, Segmented, Select } from '../ui'

type Mode = 'money' | 'cheque'

/** Receive from a customer / pay a supplier: cash, bank / wallet, or a cheque (khata changes when it clears) */
export function PaymentModal({
  open, onClose, party, onSaved,
}: { open: boolean; onClose: () => void; party: PartyBalance; onSaved: (message: string) => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { data: accounts } = useAccounts()
  const banks = (accounts ?? []).filter((a) => a.is_active)
  const [mode, setMode] = useState<Mode>('money')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [account, setAccount] = useState('')
  const [chequeNo, setChequeNo] = useState('')
  const [bank, setBank] = useState('')
  const [chequeDate, setChequeDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState(false)
  if (open !== last) {
    setLast(open)
    if (open) {
      setMode('money')
      setAmount(party.balance > 0 ? String(party.balance) : '')
      setDate(today)
      setNote('')
      setAccount('')
      setChequeNo('')
      setBank('')
      setChequeDate(today)
      setError('')
    }
  }
  const isCustomer = party.kind === 'customer'
  // a cheque we give is drawn on one of our bank accounts
  const chequeAccount = mode === 'cheque' && !isCustomer && !account && banks[0] ? banks[0].id : account
  const switchMode = (m: Mode) => {
    setMode(m)
    setAccount('')
    setError('')
  }

  const save = async () => {
    setError('')
    if (!(Number(amount) > 0)) return setError(t('errInvalidAmount'))
    setBusy(true)
    if (mode === 'money') {
      const { error } = await supabase.rpc('record_party_payment', {
        p_org: org.id, p_party: party.id, p_date: date, p_amount: Number(amount), p_note: note || null, p_account: account || null,
      })
      setBusy(false)
      if (error) return setError(errText(error, t))
      return onSaved(t('paymentSaved'))
    }
    if (!isCustomer && !chequeAccount) {
      setBusy(false)
      return setError(t('khChequeNeedsBank'))
    }
    const { error } = await supabase.rpc('record_cheque', {
      p_org: org.id,
      p_direction: isCustomer ? 'received' : 'issued',
      p_party: party.id,
      p_amount: Number(amount),
      p_cheque_date: chequeDate,
      p_cheque_no: chequeNo || null,
      p_bank_name: bank || null,
      p_received_on: date,
      p_account: chequeAccount || null,
      p_note: note || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved(t('khChequeSaved'))
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
      <Segmented
        className="mb-4 w-full [&>button]:flex-1"
        value={mode}
        onChange={switchMode}
        items={[
          { value: 'money', label: t('khCashBank') },
          { value: 'cheque', label: t('khCheque') },
        ]}
      />
      <div className="space-y-3">
        <Field label={t('amount')} required>
          <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>

        {mode === 'money' ? (
          <>
            <Field label={isCustomer ? t('khReceivedIn') : t('khPaidFrom')}>
              <AccountPicker value={account} onChange={setAccount} />
            </Field>
            <Field label={t('date')}>
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('khChequeNo')} optional>
                <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} inputMode="numeric" dir="ltr" placeholder="445566" />
              </Field>
              <Field label={t('khChequeBank')} optional>
                <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="MCB, HBL…" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('khChequeDate')} hint={chequeDate > today ? t('khPostDated') : undefined}>
                <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
              </Field>
              <Field label={isCustomer ? t('khReceivedOn') : t('khGivenOn')}>
                <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            {isCustomer ? (
              banks.length > 0 && (
                <Field label={t('khDepositInto')} optional>
                  <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                    <option value="">{t('khDecideLater')}</option>
                    {banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
              )
            ) : banks.length > 0 ? (
              <Field label={t('khDrawnOn')} required>
                <AccountPicker value={chequeAccount} onChange={setAccount} cash={false} />
              </Field>
            ) : (
              <ErrorBox>
                {t('khChequeNeedsBank')}{' '}
                <Link to="/bank" className="font-medium underline">{t('khOpenBank')}</Link>
              </ErrorBox>
            )}
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-100 px-3 py-2 text-sm text-sky-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>{t('khChequeExplain')}</span>
            </div>
          </>
        )}

        <Field label={t('note')} optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {mode === 'money' && Number(amount) > 0 && (
          <div className="num text-sm text-stone-600">{t('newBalance')}: <b>{fmtMoney(party.balance - Number(amount), lang)}</b></div>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}
