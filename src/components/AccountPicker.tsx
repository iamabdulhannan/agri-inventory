import { Landmark, Smartphone, Wallet } from 'lucide-react'
import { useAccounts } from '../lib/accounts'
import { useI18n } from '../lib/i18n'
import { Select } from './ui'

/**
 * Where money goes into / comes out of: Cash in hand ('') or a bank account / wallet (its id).
 * Shows nothing extra when the shop has no accounts yet (cash only).
 */
export function AccountPicker({
  value, onChange, cash = true, className, 'aria-label': ariaLabel,
}: { value: string; onChange: (id: string) => void; cash?: boolean; className?: string; 'aria-label'?: string }) {
  const { t } = useI18n()
  const { data: accounts } = useAccounts()
  const list = (accounts ?? []).filter((a) => a.is_active || a.id === value)
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label={ariaLabel ?? t('accountLabel')}>
      {cash && <option value="">{t('cashInHandOpt')}</option>}
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}{a.bank_name && a.bank_name !== a.name ? ` · ${a.bank_name}` : ''}
        </option>
      ))}
    </Select>
  )
}

export const accountIcon = (kind: 'cash' | 'bank' | 'wallet') => (kind === 'bank' ? Landmark : kind === 'wallet' ? Smartphone : Wallet)
