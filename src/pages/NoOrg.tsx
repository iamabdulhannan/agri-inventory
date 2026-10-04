import { LogOut } from 'lucide-react'
import { LangToggle, Logo, ThemeToggle } from '../components/Layout'
import { OrgActions } from '../components/OrgActions'
import { Button } from '../components/ui'
import { useApp } from '../lib/app'
import { useI18n } from '../lib/i18n'

export function NoOrg() {
  const { t } = useI18n()
  const { signOut, session } = useApp()
  return (
    <div className="min-h-screen bg-stone-100">
      <header className="flex items-center justify-between border-b border-stone-200 bg-surface px-5 py-3">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LangToggle />
          <Button variant="ghost" onClick={signOut}><LogOut className="size-4" /> {t('signOut')}</Button>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">{t('noOrgTitle')}</h1>
        <p className="mt-1 text-stone-600">{t('noOrgText')}</p>
        <p className="mt-1 text-sm text-stone-500">{session?.user.email}</p>
        <div className="mt-6 rounded-2xl bg-surface p-5 shadow-sm"><OrgActions /></div>
      </div>
    </div>
  )
}
