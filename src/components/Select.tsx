import { Check, ChevronDown, Search } from 'lucide-react'
import {
  Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type ReactElement, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx'
import { useI18n } from '../lib/i18n'

interface Opt {
  value: string
  label: ReactNode
  text: string
  disabled: boolean
}

/** plain text of a React node, for search and type-ahead */
function textOf(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children)
  return ''
}

const SEARCH_FROM = 9 // show a search box when the list has this many options

/**
 * Drop-in replacement for <select>: same `value` / `onChange(e => e.target.value)` / <option> children,
 * but a styled, keyboard-friendly list that works in dark mode, RTL and inside modals.
 */
export function Select({
  value, onChange, children, className, disabled, title, id, 'aria-label': ariaLabel, searchable: searchProp,
}: {
  value: string | number
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode
  className?: string
  disabled?: boolean
  title?: string
  id?: string
  'aria-label'?: string
  /** true: always show the search box; default: only for long lists */
  searchable?: boolean
}) {
  const { t, lang } = useI18n()
  const listId = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number }>({ left: 0, width: 0, maxH: 300 })
  const typed = useRef({ text: '', at: 0 })

  const options = useMemo<Opt[]>(
    () =>
      Children.toArray(children)
        .filter((c): c is ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }> => isValidElement(c) && c.type === 'option')
        .map((c) => ({ value: String(c.props.value ?? ''), label: c.props.children, text: textOf(c.props.children), disabled: !!c.props.disabled })),
    [children],
  )
  const current = options.find((o) => o.value === String(value))
  const placeholder = !current || current.disabled
  const searchable = searchProp ?? options.length >= SEARCH_FROM

  const shown = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return options
    // action options such as "+ New customer" (value starting with "__") always stay visible
    return options.filter((o) => o.value.startsWith('__') || terms.every((x) => o.text.toLowerCase().includes(x)))
  }, [options, query])

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 240 && above > below
    const width = Math.max(r.width, 200)
    // keep the list on screen; in RTL align to the trigger's right edge
    let left = lang === 'ur' ? r.right - width : r.left
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8)
    setPos(up ? { bottom: window.innerHeight - r.top + 4, left, width, maxH: Math.min(320, above) } : { top: r.bottom + 4, left, width, maxH: Math.min(320, below) })
  }, [lang])

  const openList = () => {
    if (disabled) return
    place()
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === String(value) && !o.disabled)))
    setOpen(true)
  }
  const close = (focus = true) => {
    setOpen(false)
    if (focus) btn.current?.focus()
  }
  const choose = (o: Opt) => {
    if (o.disabled) return
    close()
    if (o.value !== String(value)) onChange({ target: { value: o.value } })
  }

  useLayoutEffect(() => {
    if (!open) return
    const onMove = () => place()
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (!pop.current?.contains(tgt) && !btn.current?.contains(tgt)) close(false)
    }
    // Escape closes only this list, never a surrounding modal (capture runs before the modal's listener)
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc, true)
    }
  }, [open, place])

  useEffect(() => {
    if (open && searchable) pop.current?.querySelector('input')?.focus()
  }, [open, searchable])
  useEffect(() => setActive((a) => Math.min(Math.max(a, 0), shown.length - 1)), [shown.length])
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const move = (dir: 1 | -1) => {
    if (!shown.length) return
    let i = active
    for (let n = 0; n < shown.length; n++) {
      i = (i + dir + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setActive(i)
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'Escape') return // handled by the capture listener while open
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]) }
    else if (e.key === 'Tab') close(false)
    else if (!searchable && e.key.length === 1) {
      // type-ahead: jump to the first option starting with the typed letters
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const i = shown.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(typed.current.text))
      if (i >= 0) setActive(i)
    }
  }

  // caller widths/heights (w-36, h-9…) replace the defaults instead of fighting them
  const cls = className ?? ''
  const hasW = /(^|\s)w-/.test(cls)
  const hasH = /(^|\s)h-/.test(cls)

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={cx(
          'flex items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-start text-sm transition-colors cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600',
          'disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500',
          open ? 'border-brand-600 ring-2 ring-brand-600/30' : 'border-stone-300 hover:border-stone-400',
          !hasW && 'w-full',
          !hasH && 'h-10',
          cls,
        )}
      >
        <span className={cx('min-w-0 truncate', placeholder ? 'text-stone-400' : 'text-stone-900')}>{current?.label ?? options[0]?.label ?? ''}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-stone-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open &&
        createPortal(
          <div
            ref={pop}
            data-popover
            dir={lang === 'ur' ? 'rtl' : 'ltr'}
            onKeyDown={onKey}
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
            className="z-[70] flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-surface shadow-2xl ring-1 ring-black/5"
          >
            {searchable && (
              <div className="relative border-b border-stone-100 p-2">
                <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('search')}
                  className="h-9 w-full rounded-lg border border-stone-200 bg-surface ps-8 pe-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none"
                />
              </div>
            )}
            <ul ref={listRef} id={listId} role="listbox" className="flex-1 overflow-y-auto py-1">
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-stone-500">{t('noData')}</li>}
              {shown.map((o, i) => {
                const selected = o.value === String(value) && !o.disabled
                return (
                  <li
                    key={o.value + i}
                    data-i={i}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={cx(
                      'mx-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
                      o.disabled ? 'cursor-default text-stone-400' : 'cursor-pointer text-stone-800',
                      i === active && !o.disabled && 'bg-stone-100',
                      selected && 'font-medium text-brand-800',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {selected && <Check className="size-4 shrink-0 text-brand-700" />}
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}
