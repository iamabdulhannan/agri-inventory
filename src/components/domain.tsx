import { ChevronDown, Plus, Printer, FileSpreadsheet, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../lib/app'
import { daysBetween, fmtDate, fmtDateTime } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { PackType, PackUnit, ProductStock } from '../lib/types'
import { fmtNum, fmtPack, fmtTotal } from '../lib/units'
import { Badge, Button } from './ui'
import { cx } from '../lib/cx'
import { usePackLabel } from '../lib/packLabel'

type PLike = { name: string; name_ur?: string | null; pack_size: number; pack_unit: PackUnit; pack_type: PackType; company_name?: string | null }


export function ProductName({ p, sub = true }: { p: PLike; sub?: boolean }) {
  const { pick } = useI18n()
  const label = usePackLabel()
  return (
    <div className="min-w-0">
      <div className="font-medium text-stone-900">
        {pick(p.name, p.name_ur)} <span className="num font-semibold text-brand-800">· {label(p)}</span>
      </div>
      {sub && p.company_name && <div className="text-xs text-stone-500">{p.company_name}</div>}
    </div>
  )
}

/** "24 Bottle" + "12 L" */
export function QtyCell({ packs, p, strong }: { packs: number; p: Pick<PLike, 'pack_size' | 'pack_unit' | 'pack_type'>; strong?: boolean }) {
  const { t, lang } = useI18n()
  return (
    <div className="num whitespace-nowrap">
      <span className={cx(strong && 'font-semibold', Number(packs) < 0 && 'text-red-700')}>{fmtNum(packs, 3)}</span>{' '}
      <span className="text-xs text-stone-500">{t(`pt_${p.pack_type}`)}</span>
      {p.pack_unit !== 'pcs' && Number(packs) !== 0 && <div className="text-xs text-stone-500">{fmtTotal(packs, p.pack_size, p.pack_unit, lang)}</div>}
    </div>
  )
}

export function ExpiryBadge({ date, showDate = true }: { date: string | null; showDate?: boolean }) {
  const { t, lang } = useI18n()
  const { today, org } = useApp()
  if (!date) return <span className="text-stone-400">—</span>
  const left = daysBetween(today, date)
  const alert = org?.expiry_alert_days ?? 60
  const tone = left < 0 ? 'red' : left <= 30 ? 'orange' : left <= alert ? 'amber' : 'stone'
  const text = left < 0 ? t('expiredAgo', { n: -left }) : left === 0 ? t('expiresToday') : t('daysLeft', { n: left })
  return (
    <div className="flex flex-col items-start gap-0.5">
      {showDate && <span className="num text-sm">{fmtDate(date, lang)}</span>}
      {(left <= alert || !showDate) && <Badge tone={tone}>{text}</Badge>}
    </div>
  )
}

export function PrintHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  const { org } = useApp()
  const { t, lang } = useI18n()
  return (
    <div className="print-only mb-3 border-b border-stone-300 pb-2">
      <div className="text-lg font-bold">{org?.name}</div>
      {(org?.address || org?.phone) && <div className="text-xs">{[org?.address, org?.phone].filter(Boolean).join(' · ')}</div>}
      {(org?.ntn || org?.strn) && (
        <div className="num text-xs">{[org?.ntn && `${t('ntn')}: ${org.ntn}`, org?.strn && `${t('strn')}: ${org.strn}`].filter(Boolean).join(' · ')}</div>
      )}
      <div className="mt-1 text-base font-semibold">{title}</div>
      {subtitle && <div className="text-sm">{subtitle}</div>}
      <div className="text-xs text-stone-500">
        {t('printedOn')}: {fmtDateTime(new Date().toISOString(), lang)}
      </div>
    </div>
  )
}

export function ReportButtons({ onExcel }: { onExcel?: () => void }) {
  const { t } = useI18n()
  // kept together so layouts that spread their children apart don't separate Excel and Print
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onExcel && (
        <Button variant="secondary" onClick={onExcel}>
          <FileSpreadsheet className="size-4" /> {t('exportExcel')}
        </Button>
      )}
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer className="size-4" /> {t('print')}
      </Button>
    </div>
  )
}

/** Searchable product selector */
export function ProductPicker({
  products, value, onChange, onCreate, placeholder, autoFocus, showStock = true,
}: {
  products: ProductStock[]
  value: string
  onChange: (id: string) => void
  onCreate?: () => void
  placeholder?: string
  autoFocus?: boolean
  showStock?: boolean
}) {
  const { t, pick, lang } = useI18n()
  const label = usePackLabel()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const selected = products.find((p) => p.id === value)

  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const active = products.filter((p) => p.is_active || p.id === value)
    if (!terms.length) return active.slice(0, 200)
    return active
      .filter((p) => {
        const hay = `${p.name} ${p.name_ur ?? ''} ${p.company_name ?? ''} ${fmtPack(p.pack_size, p.pack_unit)} ${p.pack_size}${p.pack_unit} ${p.category_name} ${p.notes ?? ''}`.toLowerCase()
        return terms.every((x) => hay.includes(x))
      })
      .slice(0, 200)
  }, [products, q, value])

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => setHi(0), [q])
  useEffect(() => {
    listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  const choose = (id: string) => {
    onChange(id)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={box} className="relative">
      {!open && selected ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-auto min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-stone-300 bg-surface px-3 py-1.5 text-start text-sm hover:border-stone-400 cursor-pointer"
        >
          <ProductName p={selected} />
          <ChevronDown className="size-4 shrink-0 text-stone-400" />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input
            autoFocus={autoFocus || open}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) choose(list[hi].id) }
              else if (e.key === 'Escape') setOpen(false)
            }}
            placeholder={placeholder ?? t('chooseProduct')}
            className="h-10 w-full rounded-lg border border-stone-300 bg-surface ps-9 pe-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
        </div>
      )}
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-surface shadow-xl">
          <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
            {list.length === 0 && <li className="px-3 py-3 text-sm text-stone-500">{t('noData')}</li>}
            {list.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => choose(p.id)}
                  className={cx('flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm cursor-pointer', i === hi && 'bg-brand-50')}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{pick(p.name, p.name_ur)}</div>
                    <div className="truncate text-xs text-stone-500">
                      <span className="num">{label(p)}</span>
                      {p.company_name ? ` · ${p.company_name}` : ''}
                    </div>
                  </div>
                  {showStock && (
                    <span className={cx('num shrink-0 text-xs', p.qty > 0 ? 'text-stone-600' : 'text-red-600')}>
                      {fmtNum(p.qty)} {t(`pt_${p.pack_type}`)}
                      {p.pack_unit !== 'pcs' && p.qty > 0 && <span className="block text-end text-stone-400">{fmtTotal(p.qty, p.pack_size, p.pack_unit, lang)}</span>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {onCreate && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onCreate()
              }}
              className="flex w-full items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 cursor-pointer"
            >
              <Plus className="size-4" /> {t('newProduct')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
