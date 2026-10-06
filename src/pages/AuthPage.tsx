import { Building2, CheckCircle2, MailCheck, UserPlus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Logo } from '../components/Layout'
import { Button, ErrorBox, Field, Input, Modal, PasswordInput } from '../components/ui'
import { cx } from '../lib/cx'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n'
import { EMAILS_ENABLED } from '../lib/config'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { Role } from '../lib/types'
import { Landing } from './Landing'

type Mode = 'signin' | 'create' | 'join' | 'forgot' | 'check'

export function AuthPage() {
  const { t } = useI18n()
  const [removed] = useState(() => {
    try {
      const v = sessionStorage.getItem('agri.removed') === '1'
      sessionStorage.removeItem('agri.removed')
      return v
    } catch {
      return false
    }
  })
  const [mode, setMode] = useState<Mode | null>(() => (new URLSearchParams(location.search).get('code') ? 'join' : null))

  return (
    <div className="min-h-screen bg-page">
      <Landing onAction={setMode} />

      {removed && (
        <div className="fixed inset-x-0 top-0 z-40 bg-amber-500 px-4 py-2.5 text-center text-sm font-medium text-white">{t('signedOutRemoved')}</div>
      )}
      <AuthModal mode={mode} setMode={setMode} />
      {!supabaseConfigured && (
        <div className="fixed inset-x-0 bottom-0 bg-red-600 px-4 py-3 text-center text-sm text-white">{t('errNotConfigured')}</div>
      )}
    </div>
  )
}

function AuthModal({ mode, setMode }: { mode: Mode | null; setMode: (m: Mode | null) => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') ?? '')
  const [invite, setInvite] = useState<{ org_name: string; role: Role; email: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const resend = async () => {
    setError('')
    setInfo('')
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: location.origin } })
    if (error) return setError(errText(error, t))
    setInfo(t('confirmResent', { email: email.trim() }))
    setCooldown(60)
  }

  const go = (m: Mode) => {
    setError('')
    setInfo('')
    setNeedsConfirm(false)
    setMode(m)
  }

  const checkCode = async () => {
    setError('')
    setInvite(null)
    if (!code.trim()) return
    if (!supabaseConfigured) return setError(t('errNotConfigured'))
    setBusy(true)
    const { data, error } = await supabase.rpc('check_invite', { p_code: code.trim() })
    setBusy(false)
    if (error) return setError(errText(error, t))
    const row = (data as typeof invite[])?.[0]
    if (!row) return setError(t('errInvalidInvite'))
    setInvite(row)
    if (row.email) setEmail(row.email)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!supabaseConfigured) return setError(t('errNotConfigured'))
    try {
      setBusy(true)
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) {
          setNeedsConfirm(/not confirmed/i.test(error.message))
          throw error
        }
        return
      }
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset-password` })
        if (error) throw error
        setInfo(t('resetSent'))
        return
      }
      // sign up
      if (password.length < 6) throw new Error(t('passwordMin'))
      if (password !== password2) throw new Error(t('passwordsDontMatch'))
      const meta: Record<string, string> = { full_name: fullName.trim() }
      if (mode === 'create') meta.org_name = orgName.trim()
      else {
        if (!invite) throw new Error(t('errInvalidInvite'))
        meta.invite_code = code.trim().toUpperCase()
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: meta, emailRedirectTo: location.origin },
      })
      if (error) throw error
      // Supabase hides existing accounts by returning a user without identities
      if (data.user && data.user.identities?.length === 0) throw new Error(t('errUserExists'))
      if (!data.session) go('check')
    } catch (err) {
      setError(errText(err, t))
    } finally {
      setBusy(false)
    }
  }

  const isSignup = mode === 'create' || mode === 'join'
  const title =
    mode === 'signin' ? t('signIn') : mode === 'create' ? t('createOrg') : mode === 'join' ? t('joinOrg') : mode === 'forgot' ? t('forgotPassword') : t('checkEmailTitle')

  return (
    <Modal open={!!mode} onClose={() => setMode(null)} title={title} size="sm">
      {mode === 'check' ? (
        <div className="py-4 text-center">
          <MailCheck className="mx-auto size-12 text-brand-700" />
          <p className="mt-3 text-stone-700">{EMAILS_ENABLED ? t('checkEmailText', { email }) : t('confirmStillOn')}</p>
          {EMAILS_ENABLED && <p className="mt-2 text-sm text-stone-500">{t('checkSpam')}</p>}
          {error && <div className="mt-4 text-start"><ErrorBox>{error}</ErrorBox></div>}
          {info && <div className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{info}</div>}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {EMAILS_ENABLED && (
              <Button variant="secondary" onClick={resend} disabled={cooldown > 0}>
                {cooldown > 0 ? t('resendIn', { n: cooldown }) : t('resendEmail')}
              </Button>
            )}
            <Button onClick={() => go('signin')}>{t('signIn')}</Button>
          </div>
        </div>
      ) : (
        <>
          {isSignup && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              {(['create', 'join'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => go(m)}
                  className={cx('flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium cursor-pointer', mode === m ? 'bg-surface shadow-sm text-brand-800' : 'text-stone-600')}
                >
                  {m === 'create' ? <Building2 className="size-4" /> : <UserPlus className="size-4" />}
                  {m === 'create' ? t('createOrg') : t('joinOrg')}
                </button>
              ))}
            </div>
          )}
          {mode === 'create' && <p className="mb-4 text-sm text-stone-500">{t('createOrgHint')}</p>}
          {mode === 'join' && <p className="mb-4 text-sm text-stone-500">{t('joinOrgHint')}</p>}

          <form onSubmit={submit} className="space-y-3">
            {mode === 'join' && (
              <>
                <Field label={t('inviteCode')} required>
                  <div className="flex gap-2">
                    <Input
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase())
                        setInvite(null)
                      }}
                      onBlur={() => code && !invite && checkCode()}
                      className="num tracking-widest uppercase"
                      placeholder="A1B2C3D4"
                      maxLength={12}
                      required
                    />
                    <Button type="button" variant="secondary" onClick={checkCode} loading={busy && !invite}>{t('checkCode')}</Button>
                  </div>
                </Field>
                {invite && (
                  <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                    <CheckCircle2 className="size-4 shrink-0" />
                    {t('joiningAs', { org: invite.org_name, role: t(`role_${invite.role}`) })}
                  </div>
                )}
              </>
            )}
            {mode === 'create' && (
              <Field label={t('orgName')} required>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={t('orgNamePh')} minLength={2} maxLength={120} required />
              </Field>
            )}
            {isSignup && (
              <Field label={t('fullName')} required>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
              </Field>
            )}
            <Field label={t('email')} required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={mode === 'join' && !!invite?.email}
                required
                dir="ltr"
              />
            </Field>
            {mode !== 'forgot' && (
              <Field label={t('password')} required hint={isSignup ? t('passwordMin') : undefined}>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={6} required />
              </Field>
            )}
            {isSignup && (
              <Field label={t('confirmPassword')} required error={password2 && password !== password2 ? t('passwordsDontMatch') : undefined}>
                <PasswordInput value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required />
              </Field>
            )}

            {error && <ErrorBox>{error}</ErrorBox>}
            {mode === 'signin' && needsConfirm && !EMAILS_ENABLED && (
              <p className="text-xs text-stone-500">{t('confirmStillOn')}</p>
            )}
            {mode === 'signin' && needsConfirm && EMAILS_ENABLED && (
              <Button type="button" variant="secondary" className="w-full" onClick={resend} disabled={cooldown > 0}>
                {cooldown > 0 ? t('resendIn', { n: cooldown }) : t('resendEmail')}
              </Button>
            )}
            {info && <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{info}</div>}

            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={mode === 'join' && !invite}>
              {mode === 'signin' ? t('signIn') : mode === 'forgot' ? t('sendResetLink') : mode === 'create' ? t('createOrgBtn') : t('joinOrg')}
            </Button>
          </form>

          <div className="mt-4 space-y-1 text-center text-sm text-stone-600">
            {mode === 'signin' && (
              <>
                <button
                  type="button"
                  className="text-brand-700 hover:underline cursor-pointer"
                  onClick={() => (EMAILS_ENABLED ? go('forgot') : (setError(''), setInfo(t('forgotNoEmail'))))}
                >
                  {t('forgotPassword')}
                </button>
                <div>
                  {t('noAccount')}{' '}
                  <button className="font-medium text-brand-700 hover:underline cursor-pointer" onClick={() => go('create')}>{t('signUp')}</button>
                </div>
              </>
            )}
            {isSignup && (
              <div>
                {t('haveAccount')}{' '}
                <button className="font-medium text-brand-700 hover:underline cursor-pointer" onClick={() => go('signin')}>{t('signIn')}</button>
              </div>
            )}
            {mode === 'forgot' && (
              <button className="font-medium text-brand-700 hover:underline cursor-pointer" onClick={() => go('signin')}>{t('backToSignIn')}</button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

/** Shown when the user arrives from a password-reset email */
export function ResetPassword({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (pw.length < 6) return setError(t('passwordMin'))
    if (pw !== pw2) return setError(t('passwordsDontMatch'))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError(errText(error, t))
    setDone(true)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-stone-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl bg-surface p-6 shadow-xl">
        <Logo />
        <h1 className="pt-2 text-lg font-semibold">{t('updatePassword')}</h1>
        {done ? (
          <>
            <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{t('passwordUpdated')}</div>
            <Button className="w-full" onClick={onDone} type="button">{t('go')}</Button>
          </>
        ) : (
          <>
            <Field label={t('newPassword')}>
              <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
            </Field>
            <Field label={t('confirmPassword')}>
              <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" className="w-full" loading={busy}>{t('updatePassword')}</Button>
          </>
        )}
      </form>
    </div>
  )
}
