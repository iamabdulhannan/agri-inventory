import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BarChart3, BookUser, CalendarClock, CheckCircle2, ChevronRight, FileText, NotebookPen,
  History, LayoutDashboard, LogOut, Menu, Moon, Package, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Sprout, Sun, X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useOrg } from '../lib/app'
import { useLoad } from '../lib/data'
import { useTheme } from '../lib/theme'
import { useI18n, type TKey } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { ExpiryAlert } from '../lib/types'
import { fmtPack } from '../lib/units'
import { Badge } from './ui'
import { cx } from '../lib/cx'

const NAV: { to: string; key: TKey; icon: typeof Package; end?: boolean; admin?: boolean }[] = [
  { to: '/', key: 'navDashboard', icon: LayoutDashboard, end: true },
  { to: '/products', key: 'navProducts', icon: Package },
  { to: '/stock-in', key: 'navStockIn', icon: ArrowDownToLine },
  { to: '/stock-out', key: 'navStockOut', icon: ArrowUpFromLine },
  { to: '/sales', key: 'navSales', icon: FileText },
  { to: '/khata', key: 'navKhata', icon: BookUser },
  { to: '/roznamcha', key: 'navRoznamcha', icon: NotebookPen },
  { to: '/expiry', key: 'navExpiry', icon: CalendarClock },
  { to: '/history', key: 'navLedger', icon: History },
  { to: '/reports', key: 'navReports', icon: BarChart3 },
  { to: '/audit', key: 'navAudit', icon: ShieldCheck, admin: true },
  { to: '/settings', key: 'navSettings', icon: Settings },
]
const MOBILE = ['/', '/stock-in', '/stock-out', '/khata']

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n()
  return (
    <div className={cx('inline-flex rounded-lg bg-stone-100 p-0.5 text-sm', className)}>
      <button onClick={() => setLang('en')} className={cx('rounded-md px-2.5 py-1 cursor-pointer', lang === 'en' ? 'bg-surface font-semibold shadow-sm' : 'text-stone-500')}>
        EN
      </button>
      <button onClick={() => setLang('ur')} className={cx('rounded-md px-2.5 py-1 cursor-pointer', lang === 'ur' ? 'bg-surface font-semibold shadow-sm' : 'text-stone-500')} style={{ fontFamily: 'Noto Nastaliq Urdu' }}>
        اردو
      </button>
    </div>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme()
  const { t } = useI18n()
  const label = resolved === 'dark' ? t('themeLight') : t('themeDark')
  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cx('grid size-9 place-items-center rounded-lg text-stone-600 hover:bg-stone-100 hover:text-stone-900 cursor-pointer', className)}
    >
      {resolved === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  )
}

const SIDEBAR_KEY = 'agri.sidebar'

export function Logo({ light }: { light?: boolean }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      <span className={cx('grid size-9 place-items-center rounded-xl', light ? 'bg-white/15 text-white' : 'bg-primary text-white')}>
        <Sprout className="size-5" />
      </span>
      <span className={cx('text-lg font-bold tracking-tight', light ? 'text-white' : 'text-stone-900')}>{t('appName')}</span>
    </div>
  )
}

/** Always-visible strip of expired / expiring batches */
function ExpiryBar() {
  const { org, version } = useOrg()
  const { t, pick, lang } = useI18n()
  const nav = useNavigate()
  const { data } = useLoad(async () => {
    const { data, error } = await supabase
      .from('expiry_alerts')
      .select('*')
      .eq('org_id', org.id)
      .order('expiry_date')
      .limit(500)
    if (error) throw error
    return (data ?? []) as ExpiryAlert[]
  }, [org.id, version, org.expiry_alert_days])

  if (!data) return null
  const days = org.expiry_alert_days
  const expired = data.filter((a) => a.days_left < 0)
  const soon = data.filter((a) => a.days_left >= 0)

  if (data.length === 0) {
    return (
      <div className="no-print flex items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-1.5 text-sm text-brand-800 lg:px-6">
        <CheckCircle2 className="size-4" /> {t('noExpiry', { d: days })}
      </div>
    )
  }
  const danger = expired.length > 0
  return (
    <div className={cx('no-print border-b px-4 py-2 lg:px-6', danger ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}>
      <div className="flex items-center gap-3">
        <button onClick={() => nav('/expiry')} className="flex shrink-0 items-center gap-2 text-sm font-semibold cursor-pointer">
          <AlertTriangle className={cx('size-5', danger ? 'text-red-600' : 'text-amber-600')} />
          {expired.length > 0 && <span className="text-red-700">{t('expiredCount', { n: expired.length })}</span>}
          {expired.length > 0 && soon.length > 0 && <span className="text-stone-400">·</span>}
          {soon.length > 0 && <span className="text-amber-800">{t('expiringCount', { n: soon.length, d: days })}</span>}
        </button>
        <div className="hidden min-w-0 flex-1 gap-2 overflow-x-auto md:flex">
          {data.slice(0, 12).map((a) => (
            <button
              key={a.batch_id}
              onClick={() => nav(`/products/${a.product_id}`)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-xs ring-1 ring-stone-200 hover:ring-stone-400 cursor-pointer"
            >
              <span className="font-medium">{pick(a.name, a.name_ur)}</span>
              <span className="num text-stone-500">{fmtPack(a.pack_size, a.pack_unit, lang)}</span>
              <Badge tone={a.days_left < 0 ? 'red' : a.days_left <= 30 ? 'orange' : 'amber'}>
                {a.days_left < 0 ? t('expiredAgo', { n: -a.days_left }) : a.days_left === 0 ? t('expiresToday') : t('daysLeft', { n: a.days_left })}
              </Badge>
            </button>
          ))}
        </div>
        <button onClick={() => nav('/expiry')} className="ms-auto flex shrink-0 items-center gap-1 text-sm font-medium text-stone-700 hover:underline cursor-pointer">
          {t('viewAll')} <ChevronRight className="size-4 rtl:rotate-180" />
        </button>
      </div>
    </div>
  )
}

export function Layout() {
  const { org, profile, session, role, signOut } = useOrg()
  // owner / admin only items (the audit trail is admin-only in the database too)
  const nav = NAV.filter((n) => !n.admin || role === 'owner' || role === 'admin')
  const { t } = useI18n()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleSidebar = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  useEffect(() => {
    if (!userMenu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setUserMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [userMenu])
  // header + expiry bar height changes (bar shown/hidden, wraps on small screens),
  // so measure it and place the sidebar right below it
  const topRef = useRef<HTMLDivElement>(null)
  const [topH, setTopH] = useState(56)
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTopH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setMore(false)
    setUserMenu(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  const hideBar = loc.pathname === '/' || loc.pathname === '/expiry'
  const initials = (profile?.full_name || session?.user.email || '?').trim().slice(0, 1).toUpperCase()

  return (
    <div className="min-h-screen">
      <div ref={topRef} className="sticky top-0 z-40">
        <header className="no-print flex h-14 items-center gap-3 border-b border-stone-200 bg-surface px-4 lg:px-6">
          <button
            onClick={toggleSidebar}
            title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            className="-ms-1.5 hidden size-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 lg:grid cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen className="size-5 rtl:rotate-180" /> : <PanelLeftClose className="size-5 rtl:rotate-180" />}
          </button>
          <Logo />
          <div className="mx-2 hidden h-6 w-px bg-stone-200 sm:block" />
          <span className="hidden truncate text-sm font-medium text-stone-600 sm:block">{org.name}</span>
          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            <LangToggle />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setUserMenu((v) => !v)} className="grid size-9 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800 cursor-pointer">
                {initials}
              </button>
              {userMenu && (
                <div className="absolute end-0 top-11 w-64 rounded-xl border border-stone-200 bg-surface p-3 shadow-xl">
                  <div className="font-medium">{profile?.full_name || '—'}</div>
                  <div className="truncate text-sm text-stone-500">{session?.user.email}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <Badge tone="green">{t(`role_${role ?? 'staff'}`)}</Badge>
                    <span className="truncate text-stone-600">{org.name}</span>
                  </div>
                  <button onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-700 hover:bg-red-50 cursor-pointer">
                    <LogOut className="size-4 rtl:rotate-180" /> {t('signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {!hideBar && <ExpiryBar />}
      </div>

      <div className="flex">
        <aside
          className={cx(
            'no-print sticky hidden shrink-0 flex-col border-e border-stone-200 bg-surface p-3 transition-[width] duration-200 lg:flex',
            collapsed ? 'w-[4.25rem]' : 'w-60 overflow-y-auto',
          )}
          style={{ top: topH, height: `calc(100vh - ${topH}px)` }}
        >
          <nav className="flex flex-col gap-1">
            {nav.map(({ to, key, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={collapsed ? t(key) : undefined}
                className={({ isActive }) =>
                  cx(
                    'group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900',
                  )
                }
              >
                <Icon className="size-5 shrink-0" />
                {collapsed ? (
                  <span className="pointer-events-none absolute start-full z-50 ms-3 whitespace-nowrap rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {t(key)}
                  </span>
                ) : (
                  <span className="truncate">{t(key)}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={toggleSidebar}
            className={cx(
              'group relative mt-auto flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-900 cursor-pointer',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
            aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          >
            {collapsed ? <PanelLeftOpen className="size-5 shrink-0 rtl:rotate-180" /> : <PanelLeftClose className="size-5 shrink-0 rtl:rotate-180" />}
            {collapsed ? (
              <span className="pointer-events-none absolute start-full z-50 ms-3 whitespace-nowrap rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {t('expandSidebar')}
              </span>
            ) : (
              <span>{t('collapseSidebar')}</span>
            )}
          </button>
        </aside>
        <main className="min-w-0 flex-1 px-4 pt-5 pb-28 lg:px-8 lg:pt-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-stone-200 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.filter((n) => MOBILE.includes(n.to)).map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-stone-500')}>
            <Icon className="size-5" />
            <span className="truncate">{t(key)}</span>
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-stone-500 cursor-pointer">
          <Menu className="size-5" /> {t('more')}
        </button>
      </nav>
      {more && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{t('more')}</span>
              <button onClick={() => setMore(false)} className="p-1 cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {nav.filter((n) => !MOBILE.includes(n.to)).map(({ to, key, icon: Icon }) => (
                <NavLink key={to} to={to} className="flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-3 text-sm font-medium">
                  <Icon className="size-5 text-brand-700" /> {t(key)}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
