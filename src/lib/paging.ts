import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

export const PAGE_SIZES = [20, 50, 100] as const

/** true while the browser is printing: paged lists then show every row */
let printing = false
const listeners = new Set<(v: boolean) => void>()
if (typeof window !== 'undefined') {
  const set = (v: boolean) => {
    printing = v
    // render all rows before the print preview is taken
    flushSync(() => listeners.forEach((l) => l(v)))
  }
  window.addEventListener('beforeprint', () => set(true))
  window.addEventListener('afterprint', () => set(false))
}
function usePrinting() {
  const [p, setP] = useState(printing)
  useEffect(() => {
    listeners.add(setP)
    return () => { listeners.delete(setP) }
  }, [])
  return p
}

function readSize(key: string, fallback: number) {
  try {
    const v = Number(localStorage.getItem(`agri.pageSize.${key}`))
    return (PAGE_SIZES as readonly number[]).includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

export interface Paged<T> {
  /** rows of the current page (all rows while printing) */
  items: T[]
  /** index of the first row of the page in the full list */
  offset: number
  page: number
  pages: number
  size: number
  total: number
  setPage: (p: number) => void
  setSize: (s: number) => void
}

/**
 * Show a long list page by page. `key` remembers the page size per screen.
 * Goes back to page 1 when `reset` changes (search text, filters, date...).
 */
export function usePaged<T>(all: T[], key: string, reset: unknown[] = [], defaultSize = 20): Paged<T> {
  const printingNow = usePrinting()
  const [size, setSizeState] = useState(() => readSize(key, defaultSize))
  const [page, setPage] = useState(1)
  const total = all.length
  const pages = Math.max(1, Math.ceil(total / size))
  const resetKey = JSON.stringify(reset)
  useEffect(() => setPage(1), [resetKey])
  // the list got shorter (deleted / filtered): stay on a page that exists
  const current = Math.min(page, pages)
  const items = useMemo(
    () => (printingNow ? all : all.slice((current - 1) * size, current * size)),
    [all, current, size, printingNow],
  )
  const setSize = (s: number) => {
    setSizeState(s)
    setPage(1)
    try { localStorage.setItem(`agri.pageSize.${key}`, String(s)) } catch { /* ignore */ }
  }
  return { items, offset: printingNow ? 0 : (current - 1) * size, page: current, pages, size, total, setPage, setSize }
}
