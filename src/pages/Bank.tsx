import { Landmark } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AccountsTab } from '../components/bank/AccountsTab'
import { ChequesTab } from '../components/bank/ChequesTab'
import { FacilitiesTab } from '../components/bank/FacilitiesTab'
import { PageHeader, Tabs } from '../components/ui'
import { useI18n } from '../lib/i18n'

type Tab = 'accounts' | 'cheques' | 'finance'

/** Bank accounts and wallets, cheques, bank finance and guarantees */
export function Bank() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const p = params.get('tab')
  const tab: Tab = p === 'cheques' || p === 'finance' ? p : 'accounts'
  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><Landmark className="size-6 text-brand-700" /> {t('bankTitle')}</span>}
        subtitle={t('bankSubtitle')}
      />
      <Tabs
        value={tab}
        onChange={(v) => setParams(v === 'accounts' ? {} : { tab: v }, { replace: true })}
        items={[
          { value: 'accounts', label: t('bankTabAccounts') },
          { value: 'cheques', label: t('bankTabCheques') },
          { value: 'finance', label: t('bankTabFinance') },
        ]}
      />
      {tab === 'accounts' ? <AccountsTab /> : tab === 'cheques' ? <ChequesTab /> : <FacilitiesTab />}
    </div>
  )
}
