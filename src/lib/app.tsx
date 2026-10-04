import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Membership, Organization, Profile, Role } from './types'
import { todayIn } from './format'

interface AppState {
  ready: boolean
  session: Session | null
  profile: Profile | null
  memberships: Membership[]
  org: Organization | null
  role: Role | null
  isAdmin: boolean
  today: string
  /** bumps whenever stock changes so widgets (expiry bar, dashboard) reload */
  version: number
  refresh: () => void
  switchOrg: (id: string) => void
  reloadOrgs: () => Promise<void>
  setProfile: (p: Profile) => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)
const ORG_KEY = 'agri.org'

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [orgsReady, setOrgsReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [orgId, setOrgId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ORG_KEY)
    } catch {
      return null
    }
  })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  // A member removed by the owner is deleted on the server. Check when the app regains
  // focus and every minute; if the account is gone, sign out on this device too.
  useEffect(() => {
    if (!userId) return
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      const { error } = await supabase.auth.getUser()
      if (!error) return
      const gone = error.status === 401 || error.status === 403 || error.status === 404 || /not.?found|does not exist/i.test(error.message)
      if (gone && !stopped) {
        try {
          sessionStorage.setItem('agri.removed', '1')
        } catch {
          /* ignore */
        }
        await supabase.auth.signOut({ scope: 'local' })
      }
    }
    const id = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      clearInterval(id)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [userId])

  const reloadOrgs = useCallback(async () => {
    if (!userId) {
      setMemberships([])
      setProfile(null)
      setOrgsReady(true)
      return
    }
    const [m, p] = await Promise.all([
      supabase.from('memberships').select('role, organizations(*)').eq('user_id', userId).order('created_at'),
      supabase.from('profiles').select('id, full_name, email').eq('id', userId).maybeSingle(),
    ])
    setMemberships(((m.data ?? []) as unknown as Membership[]).filter((x) => x.organizations))
    setProfile((p.data as Profile) ?? null)
    setOrgsReady(true)
  }, [userId])

  useEffect(() => {
    setOrgsReady(false)
    reloadOrgs()
  }, [reloadOrgs])

  const current = memberships.find((m) => m.organizations.id === orgId) ?? memberships[0] ?? null

  const switchOrg = useCallback((id: string) => {
    setOrgId(id)
    try {
      localStorage.setItem(ORG_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setMemberships([])
    setProfile(null)
  }, [])

  const org = current?.organizations ?? null
  const value = useMemo<AppState>(
    () => ({
      ready: authReady && (!session || orgsReady),
      session,
      profile,
      memberships,
      org,
      role: current?.role ?? null,
      isAdmin: current?.role === 'owner' || current?.role === 'admin',
      today: todayIn(org?.timezone),
      version,
      refresh: () => setVersion((v) => v + 1),
      switchOrg,
      reloadOrgs,
      setProfile,
      signOut,
    }),
    [authReady, orgsReady, session, profile, memberships, org, current, version, switchOrg, reloadOrgs, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

/** For pages inside the app shell where an organization is guaranteed */
export function useOrg() {
  const a = useApp()
  if (!a.org) throw new Error('No organization selected')
  return { ...a, org: a.org }
}
