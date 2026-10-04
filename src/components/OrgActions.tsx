import { Building2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../lib/app'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { Button, ErrorBox, Field, Input } from './ui'

/** For a signed-in account that has no organization yet: create one, or join one with an invite code */
export function OrgActions({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n()
  const { reloadOrgs, switchOrg } = useApp()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')

  const run = async (kind: 'create' | 'join') => {
    setError('')
    setBusy(kind)
    const { data, error } =
      kind === 'create'
        ? await supabase.rpc('create_organization', { p_name: name.trim() })
        : await supabase.rpc('accept_invite', { p_code: code.trim() })
    setBusy(null)
    if (error) return setError(errText(error, t))
    switchOrg(data as string)
    await reloadOrgs()
    setName('')
    setCode('')
    onDone?.()
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form className="rounded-xl border border-stone-200 p-4" onSubmit={(e) => { e.preventDefault(); run('create') }}>
        <div className="mb-3 flex items-center gap-2 font-semibold"><Building2 className="size-5 text-brand-700" /> {t('createOrg')}</div>
        <Field label={t('orgName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('orgNamePh')} minLength={2} required />
        </Field>
        <Button type="submit" className="mt-3" loading={busy === 'create'}>{t('create')}</Button>
      </form>
      <form className="rounded-xl border border-stone-200 p-4" onSubmit={(e) => { e.preventDefault(); run('join') }}>
        <div className="mb-3 flex items-center gap-2 font-semibold"><UserPlus className="size-5 text-brand-700" /> {t('joinOrg')}</div>
        <Field label={t('inviteCode')}>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="num tracking-widest" placeholder="A1B2C3D4" required />
        </Field>
        <Button type="submit" className="mt-3" loading={busy === 'join'}>{t('joinOrg')}</Button>
      </form>
      {error && <div className="md:col-span-2"><ErrorBox>{error}</ErrorBox></div>}
    </div>
  )
}
