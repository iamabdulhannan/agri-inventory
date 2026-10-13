import { useState } from 'react'
import { useOrg } from '../../lib/app'
import { cx } from '../../lib/cx'
import { errText } from '../../lib/errors'
import { useI18n } from '../../lib/i18n'
import { advanceTitle, CROPS, cropToStore, type CropAdvance } from '../../lib/khataMoney'
import { fmtMoney } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import type { PartyBalance } from '../../lib/types'
import { AccountPicker } from '../AccountPicker'
import { PartyPicker } from '../PartyPicker'
import { Button, ErrorBox, Field, Input, Modal, useFeedback } from '../ui'

function Chips({ items, value, onPick }: { items: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((x) => (
        <button
          key={x}
          type="button"
          onClick={() => onPick(x)}
          className={cx(
            'h-7 rounded-full px-2.5 text-xs font-medium cursor-pointer transition-colors',
            x === value ? 'bg-primary text-white' : 'bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-200 hover:bg-stone-200',
          )}
        >
          {x}
        </button>
      ))}
    </div>
  )
}

/** Open a crop advance: a farmer pays in advance for a crop / season */
export function NewAdvanceModal({
  open, onClose, onSaved, party, parties, onPartyCreated,
}: {
  open: boolean
  onClose: () => void
  onSaved: (partyId: string) => void
  /** fixed customer (khata detail page) */
  party?: { id: string; name: string } | null
  /** customers to choose from (list page) */
  parties?: PartyBalance[]
  onPartyCreated?: () => void
}) {
  const { t } = useI18n()
  const { org, today } = useOrg()
  const [partyId, setPartyId] = useState('')
  const [crop, setCrop] = useState('')
  const [season, setSeason] = useState('')
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState(false)
  if (open !== last) {
    setLast(open)
    if (open) {
      setPartyId(party?.id ?? '')
      setCrop('')
      setSeason('')
      setAmount('')
      setAccount('')
      setDate(today)
      setNote('')
      setError('')
    }
  }
  const y = Number(today.slice(0, 4))
  const yy = (n: number) => String(n % 100).padStart(2, '0')
  const seasons = [String(y), `${t('khRabi')} ${y}-${yy(y + 1)}`, `${t('khKharif')} ${y}`, String(y + 1)]

  const save = async () => {
    setError('')
    const pid = party?.id ?? partyId
    if (!pid) return setError(t('khChooseCustomer'))
    if (!crop.trim()) return setError(t('khEnterCrop'))
    if (!(Number(amount) > 0)) return setError(t('errInvalidAmount'))
    setBusy(true)
    const { error } = await supabase.rpc('open_crop_advance', {
      p_org: org.id, p_party: pid, p_crop: cropToStore(crop, t), p_season: season.trim() || null,
      p_date: date, p_amount: Number(amount), p_account: account || null, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved(pid)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('khNewAdvance')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-stone-500">{t('khAdvanceExplain')}</p>
      <div className="space-y-3">
        {party ? (
          <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm font-medium">{party.name}</div>
        ) : (
          <Field label={t('customer')} required>
            <PartyPicker
              kind="customer"
              parties={parties ?? []}
              value={partyId}
              onChange={setPartyId}
              onCreated={(id) => {
                setPartyId(id)
                onPartyCreated?.()
              }}
              noneLabel={t('khChooseCustomer')}
            />
          </Field>
        )}
        <div>
          <Field label={t('khCrop')} required>
            <Input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder={t('khCropPotato')} />
          </Field>
          <Chips items={CROPS.map((c) => t(c.key))} value={crop} onPick={setCrop} />
        </div>
        <div>
          <Field label={t('khSeason')} optional>
            <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder={`${y} / ${t('khRabi')} ${y}-${yy(y + 1)}`} />
          </Field>
          <Chips items={seasons} value={season} onPick={setSeason} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('amount')} required>
            <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t('date')}>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('khReceivedIn')}>
          <AccountPicker value={account} onChange={setAccount} />
        </Field>
        <Field label={t('note')} optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}

export type MoveKind = 'deposit' | 'refund' | 'to_khata'

/** Add money to / refund from / move to khata a crop advance */
export function AdvanceMoveModal({
  advance, kind, partyName, onClose, onSaved,
}: {
  advance: CropAdvance | null
  kind: MoveKind
  partyName: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { confirm } = useFeedback()
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<string | null>(null)
  const key = advance ? `${advance.id}:${kind}` : null
  if (key !== last) {
    setLast(key)
    if (advance) {
      setAmount(kind !== 'deposit' && advance.balance > 0 ? String(advance.balance) : '')
      setAccount('')
      setDate(today)
      setNote('')
      setError('')
    }
  }
  if (!advance) return null
  const title = kind === 'deposit' ? t('khAddMoney') : kind === 'refund' ? t('khRefund') : t('khMoveToKhata')
  const n = Number(amount)

  const save = async () => {
    setError('')
    if (!(n > 0)) return setError(t('errInvalidAmount'))
    if (kind !== 'deposit' && n > advance.balance + 0.005) return setError(t('errAdvanceTooMuch'))
    const money = fmtMoney(n, lang)
    if (kind === 'to_khata' && !(await confirm(t('khMoveConfirm', { amount: money, name: partyName }), false))) return
    if (kind === 'refund' && !(await confirm(t('khRefundConfirm', { amount: money, name: partyName }), false))) return
    setBusy(true)
    const { error } = await supabase.rpc('advance_move', {
      p_org: org.id, p_advance: advance.id, p_kind: kind, p_date: date, p_amount: n,
      p_account: kind === 'to_khata' ? null : account || null, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <div className="mb-4 rounded-lg bg-stone-50 px-3 py-2 text-sm">
        <div className="font-medium">{partyName} · {advanceTitle(advance, t)}</div>
        <div className="num text-stone-600">{t('khLeft')}: {fmtMoney(advance.balance, lang)}</div>
      </div>
      {kind === 'to_khata' && <p className="mb-3 text-sm text-stone-600">{t('khMoveExplain')}</p>}
      {kind === 'refund' && <p className="mb-3 text-sm text-stone-600">{t('khRefundExplain')}</p>}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('amount')} required>
            <Input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t('date')}>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {kind !== 'to_khata' && (
          <Field label={kind === 'deposit' ? t('khReceivedIn') : t('khPaidFrom')}>
            <AccountPicker value={account} onChange={setAccount} />
          </Field>
        )}
        <Field label={t('note')} optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {n > 0 && (
          <div className="num text-sm text-stone-600">
            {t('khLeftAfter')}: <b>{fmtMoney(kind === 'deposit' ? advance.balance + n : advance.balance - n, lang)}</b>
          </div>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}
