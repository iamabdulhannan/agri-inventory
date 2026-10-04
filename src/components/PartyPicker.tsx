import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import type { PartyBalance, PartyKind } from '../lib/types'
import { PartyForm } from './PartyForm'
import { Select } from './ui'

/** Choose a customer / supplier khata account, or none; can add a new one inline */
export function PartyPicker({
  kind, parties, value, onChange, onCreated, noneLabel,
}: {
  kind: PartyKind
  parties: PartyBalance[]
  value: string
  onChange: (id: string) => void
  /** called after a new account is saved (reload the list, then select it) */
  onCreated: (id: string) => void
  noneLabel: string
}) {
  const { t, lang } = useI18n()
  const [adding, setAdding] = useState(false)
  return (
    <>
      <Select value={value} onChange={(e) => (e.target.value === '__new' ? setAdding(true) : onChange(e.target.value))}>
        <option value="">{noneLabel}</option>
        {parties
          .filter((p) => p.is_active || p.id === value)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.phone ? ` · ${p.phone}` : ''}
              {p.balance ? ` · ${fmtMoney(p.balance, lang)}` : ''}
            </option>
          ))}
        <option value="__new">+ {kind === 'customer' ? t('newCustomer') : t('newSupplier')}</option>
      </Select>
      <PartyForm
        open={adding}
        onClose={() => setAdding(false)}
        kind={kind}
        onSaved={(id) => {
          setAdding(false)
          onCreated(id)
        }}
      />
    </>
  )
}
