import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeCtx {
  mode: ThemeMode
  /** the theme actually shown (system resolved) */
  resolved: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
  toggle: () => void
}

const Ctx = createContext<ThemeCtx | null>(null)
const KEY = 'agri.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode)
  const [systemDark, setSystemDark] = useState(() => media().matches)

  useEffect(() => {
    const mq = media()
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#1a1d1a' : '#15803d')
  }, [resolved])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    try {
      if (m === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, m)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved, setMode])

  return <Ctx.Provider value={{ mode, resolved, setMode, toggle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme outside provider')
  return v
}
