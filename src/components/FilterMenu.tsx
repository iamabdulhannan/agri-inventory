import { ListFilter, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

/** One "Filters" button that opens a panel with all filters of a page */
export function FilterMenu({ active, onClear, footer, children }: { active: number; onClear: () => void; footer?: ReactNode; children: ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Element
      // dropdown lists inside the panel are portaled: clicks there stay inside
      if (box.current?.contains(tgt) || tgt.closest?.('[data-popover]')) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cx(active > 0 && 'ring-2 ring-brand-600/30')}>
        <ListFilter className="size-4" /> {t('filters')}
        {active > 0 && <span className="num ms-0.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white">{active}</span>}
      </Button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 flex max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-stone-200 bg-surface shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <span className="font-semibold">{t('filters')}</span>
            <div className="flex items-center gap-1">
              {active > 0 && <Button size="sm" variant="ghost" onClick={onClear}>{t('clearFilters')}</Button>}
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} aria-label={t('close')}><X className="size-4" /></Button>
            </div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">{children}</div>
          <div className="border-t border-stone-100 px-4 py-3">
            <Button className="w-full" onClick={() => setOpen(false)}>{footer ?? t('done')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</div>
      {children}
    </div>
  )
}

/** Single-choice list (radio rows) with optional counts */
export function FilterOptions<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="-mx-2 flex flex-col" role="radiogroup">
      {items.map((it) => {
        const on = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(it.value)}
            className={cx('flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-start text-sm transition-colors', on ? 'bg-brand-50 font-medium text-brand-800' : 'text-stone-700 hover:bg-stone-50')}
          >
            <span className={cx('grid size-4 shrink-0 place-items-center rounded-full border', on ? 'border-brand-600' : 'border-stone-300')}>
              {on && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.count != null && <span className="num text-xs text-stone-500">{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Removable chip showing one applied filter */
export function FilterChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  const { t } = useI18n()
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-50 ps-3 pe-1 text-sm font-medium text-brand-800 ring-1 ring-brand-600/20">
      {children}
      <button type="button" onClick={onRemove} aria-label={t('remove')} className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-brand-100">
        <X className="size-3.5" />
      </button>
    </span>
  )
}
