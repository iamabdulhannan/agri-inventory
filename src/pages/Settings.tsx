import { Copy, Info, KeyRound, LockKeyhole, MessageCircle, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, useFeedback, Modal, PasswordInput } from '../components/ui'
import { useOrg } from '../lib/app'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeMode } from '../lib/theme'
import type { Category, Company, Role } from '../lib/types'

export function SettingsPage() {
  const { t } = useI18n()
  const { isAdmin } = useOrg()
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={t('settings')} />
      <OrgCard />
      {isAdmin && <InvitesCard />}
      <MembersCard />
      <CatalogListCard kind="categories" />
      <CatalogListCard kind="companies" />
      <ProfileCard />
    </div>
  )
}

function OrgCard() {
  const { t } = useI18n()
  const { org, isAdmin, reloadOrgs, refresh } = useOrg()
  const { toast } = useFeedback()
  const [f, setF] = useState(org)
  const [busy, setBusy] = useState(false)
  useEffect(() => setF(org), [org])
  // NTN / STRN columns exist once migration 012 has been run
  const hasTax = 'ntn' in org

  const save = async () => {
    setBusy(true)
    const { error } = await supabase
      .from('organizations')
      .update({ name: f.name.trim(), address: f.address?.trim() || null, phone: f.phone?.trim() || null, ...(hasTax ? { ntn: f.ntn?.trim() || null, strn: f.strn?.trim() || null } : {}), expiry_alert_days: Math.min(365, Math.max(1, Number(f.expiry_alert_days) || 60)) })
      .eq('id', org.id)
    setBusy(false)
    if (error) return toast(errText(error, t), 'err')
    await reloadOrgs()
    refresh()
    toast(t('saved'))
  }

  return (
    <Card title={t('organization')}>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label={t('orgName')}><Input value={f.name} disabled={!isAdmin} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('phone')}><Input value={f.phone ?? ''} disabled={!isAdmin} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" /></Field>
        <Field label={t('address')} className="sm:col-span-2"><Input value={f.address ?? ''} disabled={!isAdmin} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        {hasTax && <Field label={t('ntn')} optional hint={t('ntnHint')}><Input value={f.ntn ?? ''} disabled={!isAdmin} onChange={(e) => setF({ ...f, ntn: e.target.value })} dir="ltr" /></Field>}
        {hasTax && <Field label={t('strn')} optional><Input value={f.strn ?? ''} disabled={!isAdmin} onChange={(e) => setF({ ...f, strn: e.target.value })} dir="ltr" /></Field>}
        <Field label={t('alertDays')} hint={t('alertDaysHint')}>
          <Input type="number" min={1} max={365} value={f.expiry_alert_days} disabled={!isAdmin} onChange={(e) => setF({ ...f, expiry_alert_days: Number(e.target.value) })} />
        </Field>
      </div>
      {isAdmin && (
        <div className="border-t border-stone-100 px-4 py-3">
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </div>
      )}
    </Card>
  )
}

interface Invite { id: string; code: string; role: Role; email: string | null; expires_at: string; used_at: string | null }

function InvitesCard() {
  const { t, lang } = useI18n()
  const { org } = useOrg()
  const { toast, confirm } = useFeedback()
  const [role, setRole] = useState<Role>('staff')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('invites').select('*').eq('org_id', org.id).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
    if (error) throw error
    return data as Invite[]
  }, [org.id])

  const create = async () => {
    setBusy(true)
    const { error } = await supabase.from('invites').insert({ org_id: org.id, role, email: email.trim() || null })
    setBusy(false)
    if (error) return toast(errText(error, t), 'err')
    setEmail('')
    toast(t('inviteCreated'))
    reload()
  }
  const shareText = (code: string) => t('shareInvite', { org: org.name, url: `${location.origin}/?code=${code}`, code })
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('copied'), 'info')
    } catch {
      /* clipboard unavailable */
    }
  }
  const remove = async (id: string) => {
    if (!(await confirm(`${t('delete')}?`))) return
    const { error } = await supabase.from('invites').delete().eq('id', id)
    if (error) return toast(errText(error, t), 'err')
    reload()
  }

  return (
    <Card title={<span className="flex items-center gap-2"><KeyRound className="size-5 text-brand-700" /> {t('invites')}</span>}>
      <div className="p-4">
        <p className="mb-4 text-sm text-stone-500">{t('inviteHint')}</p>
        <div className="grid gap-3 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
          <Field label={t('role')}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="staff">{t('role_staff')}</option>
              <option value="admin">{t('role_admin')}</option>
            </Select>
          </Field>
          <Field label={<>{t('inviteEmail')} <span className="font-normal text-stone-400">({t('optional')})</span></>}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" dir="ltr" />
          </Field>
          <Button onClick={create} loading={busy} className="w-full sm:w-auto">
            <Plus className="size-4" /> {t('createInvite')}
          </Button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
          <Info className="mt-0.5 size-3.5 shrink-0" /> {role === 'admin' ? t('roleAdminHint') : t('roleStaffHint')}
        </p>
      </div>

      {!data?.length ? (
        <div className="border-t border-stone-100 px-4 py-4 text-sm text-stone-500">{t('noInvites')}</div>
      ) : (
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          {data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <code className="num rounded-lg bg-brand-50 px-3 py-1.5 text-lg font-bold tracking-[0.2em] text-brand-800 ring-1 ring-brand-200">{i.code}</code>
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.role === 'admin' ? 'blue' : 'green'}>{t(`role_${i.role}`)}</Badge>
                  {i.email && <span className="truncate text-stone-600" dir="ltr">{i.email}</span>}
                </div>
                <div className="mt-0.5 text-xs text-stone-500">{t('expires')}: <span className="num">{fmtDate(i.expires_at.slice(0, 10), lang)}</span></div>
              </div>
              <div className="ms-auto flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => copy(i.code)}><Copy className="size-4" /> {t('copy')}</Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText(i.code))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-medium text-white shadow-sm hover:bg-[#1ebe5b]"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
                <Button size="sm" variant="ghost" onClick={() => remove(i.id)} aria-label={t('delete')} title={t('delete')}><Trash2 className="size-4 text-red-600" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

interface MemberRow { user_id: string; role: Role; created_at: string; profiles: { full_name: string; email: string | null } | null }

function MembersCard() {
  const { t } = useI18n()
  const { org, isAdmin, session, role: myRole } = useOrg()
  const { toast, confirm } = useFeedback()
  const [resetFor, setResetFor] = useState<MemberRow | null>(null)
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('memberships').select('user_id, role, created_at, profiles(full_name, email)').eq('org_id', org.id).order('created_at')
    if (error) throw error
    return data as unknown as MemberRow[]
  }, [org.id])

  const setRole = async (m: MemberRow, role: Role) => {
    const { error } = await supabase.from('memberships').update({ role }).eq('org_id', org.id).eq('user_id', m.user_id)
    if (error) return toast(errText(error, t), 'err')
    reload()
  }
  const remove = async (m: MemberRow) => {
    const name = m.profiles?.full_name || m.profiles?.email || ''
    if (!(await confirm(t('removeMemberConfirm', { name })))) return
    const { error } = await supabase.rpc('remove_member', { p_org: org.id, p_user: m.user_id })
    if (error) return toast(errText(error, t), 'err')
    toast(t('memberRemoved', { name }))
    reload()
  }

  return (
    <Card title={t('members')}>
      {loading && !data ? <Loading /> : error ? <div className="p-4"><ErrorBox>{errText(error, t)}</ErrorBox></div> : (
        <ul className="divide-y divide-stone-100">
          {data?.map((m) => {
            const me = m.user_id === session?.user.id
            const editable = isAdmin && !me && m.role !== 'owner'
            // owner can reset/remove anyone; admin only staff (same rule as the database)
            const canManage = !me && m.role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && m.role === 'staff'))
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="grid size-9 place-items-center rounded-full bg-stone-100 font-semibold text-stone-600">
                  {(m.profiles?.full_name || m.profiles?.email || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.profiles?.full_name || '—'} {me && <span className="text-xs text-stone-400">({t('you')})</span>}</div>
                  <div className="truncate text-sm text-stone-500" dir="ltr">{m.profiles?.email}</div>
                </div>
                {canManage && (
                  <Button size="sm" variant="secondary" onClick={() => setResetFor(m)}>
                    <LockKeyhole className="size-4" /> {t('resetPassword')}
                  </Button>
                )}
                {editable ? (
                  <>
                    <Select className="h-9 w-32" value={m.role} onChange={(e) => setRole(m, e.target.value as Role)}>
                      <option value="staff">{t('role_staff')}</option>
                      <option value="admin">{t('role_admin')}</option>
                    </Select>
                  </>
                ) : (
                  <Badge tone={m.role === 'owner' ? 'green' : m.role === 'admin' ? 'blue' : 'stone'}>{t(`role_${m.role}`)}</Badge>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => remove(m)} title={t('removeMember')} aria-label={t('removeMember')}>
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ResetPasswordModal member={resetFor} onClose={() => setResetFor(null)} />
    </Card>
  )
}

function ResetPasswordModal({ member, onClose }: { member: MemberRow | null; onClose: () => void }) {
  const { t } = useI18n()
  const { org } = useOrg()
  const { toast } = useFeedback()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setPw('')
    setPw2('')
    setError('')
  }, [member])

  const name = member?.profiles?.full_name || member?.profiles?.email || ''
  const save = async () => {
    if (!member) return
    setError('')
    if (pw.length < 6) return setError(t('passwordMin'))
    if (pw !== pw2) return setError(t('passwordsDontMatch'))
    setBusy(true)
    const { error } = await supabase.rpc('admin_reset_password', { p_org: org.id, p_user: member.user_id, p_password: pw })
    setBusy(false)
    if (error) return setError(errText(error, t))
    toast(t('passwordResetDone', { name }))
    onClose()
  }

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      size="sm"
      title={t('resetPassword')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      <div className="mb-4 rounded-lg bg-stone-50 px-3 py-2 text-sm">
        <div className="font-medium">{member?.profiles?.full_name || '—'}</div>
        <div className="text-stone-500" dir="ltr">{member?.profiles?.email}</div>
      </div>
      <div className="space-y-3">
        <Field label={t('newPassword')} hint={t('passwordMin')}>
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label={t('confirmPassword')} error={pw2 && pw !== pw2 ? t('passwordsDontMatch') : undefined}>
          <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-stone-500"><Info className="mt-0.5 size-3.5 shrink-0" /> {t('resetPasswordHint')}</p>
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
    </Modal>
  )
}

function CatalogListCard({ kind }: { kind: 'categories' | 'companies' }) {
  const { t } = useI18n()
  const { org, isAdmin, refresh, version } = useOrg()
  const { toast, confirm } = useFeedback()
  const [name, setName] = useState('')
  const [nameUr, setNameUr] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; name_ur: string } | null>(null)
  const { data, reload } = useLoad(
    () => fetchAll<Category & Company>((a, b) => supabase.from(kind).select('*').eq('org_id', org.id).order('name').range(a, b)),
    [org.id, kind, version],
  )

  const add = async () => {
    if (!name.trim()) return
    const { error } =
      kind === 'categories'
        ? await supabase.from('categories').insert({ org_id: org.id, name: name.trim(), name_ur: nameUr.trim() || null })
        : await supabase.from('companies').insert({ org_id: org.id, name: name.trim() })
    if (error) return toast(errText(error, t), 'err')
    setName('')
    setNameUr('')
    reload()
    refresh()
  }
  const save = async () => {
    if (!editing || !editing.name.trim()) return
    const patch: Record<string, string | null> = { name: editing.name.trim() }
    if (kind === 'categories') patch.name_ur = editing.name_ur.trim() || null
    const { error } = await supabase.from(kind).update(patch).eq('id', editing.id)
    if (error) return toast(errText(error, t), 'err')
    setEditing(null)
    reload()
    refresh()
  }
  const remove = async (id: string) => {
    if (!(await confirm(`${t('delete')}?`))) return
    const { error } = await supabase.from(kind).delete().eq('id', id)
    if (error) return toast(errText(error, t), 'err')
    reload()
    refresh()
  }

  return (
    <Card title={kind === 'categories' ? t('categories') : t('companies')}>
      <div className="flex flex-wrap items-end gap-2 p-4">
        <Field label={t('name')} className="min-w-48 flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></Field>
        {kind === 'categories' && (
          <Field label={t('urduName')} className="min-w-48 flex-1"><Input dir="rtl" value={nameUr} onChange={(e) => setNameUr(e.target.value)} /></Field>
        )}
        <Button onClick={add} disabled={!name.trim()}><Plus className="size-4" /> {kind === 'categories' ? t('addCategory') : t('addCompany')}</Button>
      </div>
      <ul className="divide-y divide-stone-100 border-t border-stone-100">
        {data?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
            {editing?.id === c.id ? (
              <>
                <Input className="h-9 max-w-xs" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                {kind === 'categories' && <Input className="h-9 max-w-xs" dir="rtl" value={editing.name_ur} onChange={(e) => setEditing({ ...editing, name_ur: e.target.value })} />}
                <Button size="sm" onClick={save}>{t('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              </>
            ) : (
              <>
                <span className="flex-1">{c.name}{kind === 'categories' && c.name_ur && <span className="ms-3 text-stone-500" dir="rtl">{c.name_ur}</span>}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name, name_ur: c.name_ur ?? '' })}>{t('edit')}</Button>
                {isAdmin && <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="size-4 text-red-600" /></Button>}
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ProfileCard() {
  const { t, lang, setLang } = useI18n()
  const { mode, setMode } = useTheme()
  const { profile, session, setProfile } = useOrg()
  const { toast } = useFeedback()
  const [name, setName] = useState(profile?.full_name ?? '')
  useEffect(() => setName(profile?.full_name ?? ''), [profile])

  const save = async () => {
    if (!session) return
    const { data, error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', session.user.id).select('id, full_name, email').single()
    if (error) return toast(errText(error, t), 'err')
    setProfile(data)
    toast(t('saved'))
  }

  return (
    <Card title={t('profile')}>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('fullName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('email')}><Input value={session?.user.email ?? ''} disabled dir="ltr" /></Field>
        <Field label={t('language')}>
          <Select value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'ur')}>
            <option value="en">English</option>
            <option value="ur">اردو</option>
          </Select>
        </Field>
        <Field label={t('theme')}>
          <Select value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}>
            <option value="system">{t('themeSystem')}</option>
            <option value="light">{t('themeLight')}</option>
            <option value="dark">{t('themeDark')}</option>
          </Select>
        </Field>
      </div>
      <div className="border-t border-stone-100 px-4 py-3"><Button onClick={save}>{t('save')}</Button></div>
      <ChangePassword />
    </Card>
  )
}

function ChangePassword() {
  const { t } = useI18n()
  const { toast } = useFeedback()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    if (pw.length < 6) return setError(t('passwordMin'))
    if (pw !== pw2) return setError(t('passwordsDontMatch'))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError(errText(error, t))
    setPw('')
    setPw2('')
    toast(t('passwordUpdated'))
  }

  return (
    <div className="border-t border-stone-100 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><LockKeyhole className="size-4 text-brand-700" /> {t('changePassword')}</h3>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label={t('newPassword')}>
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label={t('confirmPassword')}>
          <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button onClick={save} loading={busy} disabled={!pw}>{t('changePassword')}</Button>
      </div>
      {pw2 && pw !== pw2 && <p className="mt-1 text-xs text-red-600">{t('passwordsDontMatch')}</p>}
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
    </div>
  )
}
