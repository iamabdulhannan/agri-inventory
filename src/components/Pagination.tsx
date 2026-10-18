import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '../lib/cx'
import { useI18n } from '../lib/i18n'
import { PAGE_SIZES, type Paged } from '../lib/paging'
import { fmtNum } from '../lib/units'
import { Select } from './ui'

/** page numbers with gaps: 1 … 4 5 6 … 20 */
function pageList(page: number, pages: number): (number | 'gap')[] {
  const out: (number | 'gap')[] = []
  const add = (n: number) => out.push(n)
  const from = Math.max(2, page - 1)
  const to = Math.min(pages - 1, page + 1)
  add(1)
  if (from > 2) out.push('gap')
  for (let n = from; n <= to; n++) add(n)
  if (to < pages - 1) out.push('gap')
  if (pages > 1) add(pages)
  return out
}

/** "Showing 1–20 of 1,234"  ‹ 1 2 3 … 62 ›  [20 per page]. Hidden when everything fits on one page. */
export function Pagination({ pg, className }: { pg: Paged<unknown>; className?: string }) {
  const { t } = useI18n()
  if (pg.total <= PAGE_SIZES[0]) return null
  const from = pg.offset + 1
  const to = Math.min(pg.offset + pg.size, pg.total)
  const btn = 'grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40'
  const go = (p: number, el: HTMLElement) => {
    pg.setPage(p)
    // new page: bring the top of the list back into view (below the sticky header)
    const box = el.closest('[data-paged]')?.parentElement
    requestAnimationFrame(() => {
      const top = box?.getBoundingClientRect().top ?? 0
      if (box && top < 120) window.scrollTo({ top: window.scrollY + top - 140, behavior: 'smooth' })
    })
  }
  return (
    <div data-paged className={cx('no-print flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-sm', className)}>
      <div className="num text-stone-600">
        {t('pgShowing', { from: fmtNum(from), to: fmtNum(to), total: fmtNum(pg.total) })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {pg.pages > 1 && (
          <nav className="flex items-center gap-1" aria-label={t('pgPages')}>
            <button type="button" className={cx(btn, 'hover:bg-stone-100')} disabled={pg.page <= 1} onClick={(e) => go(pg.page - 1, e.currentTarget)} aria-label={t('pgPrev')}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </button>
            {pageList(pg.page, pg.pages).map((n, i) =>
              n === 'gap' ? (
                <span key={`g${i}`} className="px-1 text-stone-400">…</span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={(e) => go(n, e.currentTarget)}
                  aria-current={n === pg.page ? 'page' : undefined}
                  className={cx(btn, 'num', n === pg.page ? 'bg-primary text-white shadow-sm' : 'text-stone-700 hover:bg-stone-100')}
                >
                  {fmtNum(n)}
                </button>
              ),
            )}
            <button type="button" className={cx(btn, 'hover:bg-stone-100')} disabled={pg.page >= pg.pages} onClick={(e) => go(pg.page + 1, e.currentTarget)} aria-label={t('pgNext')}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </button>
          </nav>
        )}
        <Select value={String(pg.size)} onChange={(e) => pg.setSize(Number(e.target.value))} className="w-32" aria-label={t('pgPerPage')}>
          {PAGE_SIZES.map((s) => <option key={s} value={String(s)}>{t('pgSize', { n: s })}</option>)}
        </Select>
      </div>
    </div>
  )
}
