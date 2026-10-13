import { useEffect, useState } from 'react'
import { useOrg } from '../lib/app'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { PartyWithRule } from '../lib/khataMoney'
import type { Party, PartyKind } from '../lib/types'
import { DueRuleChips } from './khata/DueRuleChips'
import { Button, ErrorBox, Field, Input, Modal, Textarea } from './ui'

/** Add or edit a customer / supplier khata account */
export function PartyForm({
  open, onClose, kind, party, onSaved,
}: {
  open: boolean
  onClose: () => void
  kind: PartyKind
  party?: Party | null
  onSaved: (id: string) => void
}) {
  const { t } = useI18n()
  const { org } = useOrg()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [opening, setOpening] = useState('')
  const [notes, setNotes] = useState('')
  const [dueRule, setDueRule] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setName(party?.name ?? '')
    setPhone(party?.phone ?? '')
    setAddress(party?.address ?? '')
    setOpening(party && Number(party.opening_balance) ? String(Number(party.opening_balance)) : '')
    setNotes(party?.notes ?? '')
    setDueRule((party as PartyWithRule | null | undefined)?.due_rule ?? '')
  }, [open, party])

  const save = async () => {
    setError('')
    if (!name.trim()) return setError(`${t('name')} *`)
    const row = {
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      opening_balance: Number(opening) || 0,
      notes: notes.trim() || null,
    }
    const write = (r: typeof row & { due_rule?: string | null }) =>
      party
        ? supabase.from('parties').update(r).eq('id', party.id).select('id').single()
        : supabase.from('parties').insert({ ...r, org_id: org.id, kind }).select('id').single()
    setBusy(true)
    let res = await write(kind === 'customer' ? { ...row, due_rule: dueRule || null } : row)
    // before migration 013 there is no due_rule column: save the rest
    if (res.error && kind === 'customer' && /due_rule/.test(`${res.error.message} ${res.error.details ?? ''}`)) res = await write(row)
    setBusy(false)
    if (res.error) return setError(errText(res.error, t))
    onSaved(res.data.id)
  }

  const title = party ? t('edit') : kind === 'customer' ? t('addCustomer') : t('addSupplier')
  return (
    <Modal
      open={open}
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
      <div className="space-y-3">
        <Field label={t('name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'customer' ? 'Muhammad Aslam' : 'Ali Akbar Group'} />
        </Field>
        <Field label={t('phone')} optional>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="0300-1234567" />
        </Field>
        <Field label={t('address')} optional>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label={t('openingBalance')} hint={kind === 'customer' ? t('openingHintCustomer') : t('openingHintSupplier')}>
          <Input type="number" step="any" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
        </Field>
        {kind === 'customer' && (
          <div>
            <div className="mb-1.5 text-sm font-medium text-stone-700">{t('khUsuallyPays')}</div>
            <DueRuleChips value={dueRule} onChange={setDueRule} />
            <div className="mt-1 text-xs text-stone-500">{t('khUsuallyPaysHint')}</div>
          </div>
        )}
        <Field label={t('note')} optional>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  )
}
