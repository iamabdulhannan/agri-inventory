import { Download, MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useOrg } from '../lib/app'
import { cx } from '../lib/cx'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { downloadFile, nodesToPdf, nodeToPng, safeName, shareFile, type ShareResult } from '../lib/share'
import { Button, Loading, Modal, useFeedback } from './ui'

function useShareToast() {
  const { t } = useI18n()
  const { toast } = useFeedback()
  return (how: ShareResult) => {
    if (how === 'copied') toast(t('shareCopied'), 'info')
    else if (how === 'downloaded') toast(t('shareDownloaded'), 'info')
  }
}

/**
 * Share a rendered node as a PNG on WhatsApp (used by the receipt). `ready` changes whenever
 * the content changes (falsy = nothing yet). The image is made in advance so phones open the
 * share sheet right on the click.
 */
export function useImageShare(ready: unknown) {
  const { t, lang } = useI18n()
  const { toast } = useFeedback()
  const told = useShareToast()
  const ref = useRef<HTMLDivElement>(null)
  const image = useRef<Promise<Blob> | null>(null)
  const [busy, setBusy] = useState(false)

  const make = () => {
    const node = ref.current
    const p = node ? nodeToPng(node) : Promise.reject(new Error('NO_IMAGE'))
    p.catch(() => {
      if (image.current === p) image.current = null
    })
    image.current = p
    return p
  }
  useEffect(() => {
    image.current = null
    if (!ready) return
    const id = setTimeout(make, 400)
    return () => clearTimeout(id)
  }, [ready, lang])

  const share = async (o: { fileName: string; text: string; phone?: string | null }) => {
    setBusy(true)
    try {
      const file = (image.current ?? make()).then((b) => new File([b], `${safeName(o.fileName)}.png`, { type: 'image/png' }))
      told(await shareFile(file, o))
    } catch {
      toast(t('shareFailed'), 'err')
    } finally {
      setBusy(false)
    }
  }
  return { ref, share, busy }
}

/** off-screen copy of what is shared (never printed) */
export function ShotArea({ shotRef, children }: { shotRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] print:hidden">
      <div ref={shotRef} className="inline-block bg-white p-5">{children}</div>
    </div>,
    document.body,
  )
}

export function WhatsAppButton({ onClick, busy, disabled, size, label }: { onClick: () => void; busy?: boolean; disabled?: boolean; size?: 'sm' | 'md'; label?: string }) {
  const { t } = useI18n()
  return (
    <Button variant="secondary" size={size} className="no-print" onClick={onClick} disabled={disabled} loading={busy}>
      {!busy && <MessageCircle className="size-4 text-[#25D366]" />} {label ?? t('shareWhatsApp')}
    </Button>
  )
}

// ===================================================================== statements
export interface StatementRow { label: string; value: string; strong?: boolean }
export interface StatementLine { cells: string[]; sub?: string; strong?: boolean }
export interface StatementSection {
  title?: string
  /** first column on the start side, the rest are numbers */
  head: string[]
  rows: StatementLine[]
  foot?: string[]
  /** where the newest rows are: an image keeps only the newest ones */
  newest?: 'start' | 'end'
}
export interface Statement {
  title: string
  name: string
  phone?: string | null
  /** short lines under the name, e.g. "40% of profit" */
  meta?: string[]
  rows: StatementRow[]
  sections?: StatementSection[]
  /** small line at the end, e.g. why some entries are left out */
  note?: string
}

type Page = { s: Statement; first: boolean; n: number; of: number }

/** rows per table in an image (a PDF has them all) */
export const IMAGE_ROWS = 40

/** An image stays readable: only the newest rows of each table */
function forImage(s: Statement): { s: Statement; cut: boolean } {
  let cut = false
  const sections = s.sections?.map((x) => {
    if (x.rows.length <= IMAGE_ROWS) return x
    cut = true
    return { ...x, rows: x.newest === 'end' ? x.rows.slice(-IMAGE_ROWS) : x.rows.slice(0, IMAGE_ROWS) }
  })
  return { s: { ...s, sections }, cut }
}

/** Split over A4 pages without cutting a row: shop, name and figures on page 1, tables continue */
function paginate(s: Statement): Page[] {
  // room per page in row heights (a row with a second line = 1.5); measured on A4 at 13px
  const FIRST = 33 - s.rows.length - (s.meta?.length ?? 0) * 0.8
  const NEXT = 33
  const pages: Statement[] = []
  let cur: Statement = { ...s, sections: [] }
  let room = FIRST
  for (const sec of s.sections ?? []) {
    if (!sec.rows.length) continue
    let part: StatementSection | null = null
    for (const row of sec.rows) {
      const need = (row.sub ? 1.5 : 1) + (part ? 0 : 2.5)
      if (need > room) {
        pages.push(cur)
        cur = { ...s, rows: [], meta: [], sections: [] }
        room = NEXT
        part = null
      }
      if (!part) {
        part = { ...sec, rows: [], foot: undefined }
        cur.sections!.push(part)
        room -= 2.5
      }
      part.rows.push(row)
      room -= row.sub ? 1.5 : 1
    }
    if (part) part.foot = sec.foot
  }
  pages.push(cur)
  return pages.map((p, i) => ({ s: p, first: i === 0, n: i + 1, of: pages.length }))
}

/** A statement in the same look as the receipt: shop on top, figures, tables */
export function StatementSheet({ s, wide, page, cut }: { s: Statement; wide?: boolean; page?: Page; cut?: boolean }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const first = !page || page.first
  const line = <div className="my-2 border-t border-dashed border-black" />
  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className={cx('bg-white leading-snug text-black', wide ? 'w-[186mm] text-[13px]' : 'w-[88mm] text-[12px]')}
      style={{ fontFamily: lang === 'ur' ? 'Inter, "Noto Nastaliq Urdu", sans-serif' : 'Inter, sans-serif' }}
    >
      <div className="text-center">
        <div className={cx('font-bold', wide ? 'text-lg' : 'text-base')}>{org.name}</div>
        {first && org.address && <div>{org.address}</div>}
        {first && org.phone && <div dir="ltr">{org.phone}</div>}
      </div>
      {line}
      <div className="flex justify-between gap-3">
        <b>{s.title}</b>
        <span className="num shrink-0">{fmtDate(today, lang)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span>
          <b>{s.name}</b>
          {s.phone && <span className="num" dir="ltr"> · {s.phone}</span>}
        </span>
        {page && page.of > 1 && <span className="num shrink-0">{t('sharePage', { n: page.n, of: page.of })}</span>}
      </div>
      {s.meta?.filter(Boolean).map((m) => <div key={m}>{m}</div>)}
      {s.rows.length > 0 && (
        <>
          {line}
          <div className="num space-y-0.5">
            {s.rows.map((r) => (
              <div key={r.label} className={cx('flex justify-between gap-3', r.strong && 'text-[1.1em] font-bold')}>
                <span className="min-w-0">{r.label}</span>
                <span className="shrink-0">{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {s.sections?.map((sec, k) => (
        <div key={k}>
          {line}
          {sec.title && <div className="mb-1 font-bold">{sec.title}</div>}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black">
                {sec.head.map((h, i) => (
                  <th key={i} className={cx('py-0.5 font-semibold', i === 0 ? 'text-start' : 'whitespace-nowrap ps-2 text-end')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sec.rows.map((r, j) => (
                <tr key={j} className={cx('align-top', wide && 'border-b border-stone-200', r.strong && 'font-semibold')}>
                  {r.cells.map((c, i) => (
                    <td key={i} className={cx(wide ? 'py-1' : 'py-0.5', i === 0 ? 'pe-1' : 'num whitespace-nowrap ps-2 text-end')}>
                      {c}
                      {i === 0 && r.sub && <div className="num text-[0.85em]">{r.sub}</div>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {sec.foot && (
              <tfoot>
                <tr className="border-t border-black font-semibold">
                  {sec.foot.map((c, i) => (
                    <td key={i} className={cx('py-0.5', i === 0 ? '' : 'num whitespace-nowrap ps-2 text-end')}>{c}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ))}
      {(cut || s.note) && <div className="mt-1 text-[0.9em]">{cut ? t('shareLatest', { n: IMAGE_ROWS }) : s.note}</div>}
      {(!page || page.n === page.of) && (
        <>
          {line}
          <div className="text-center font-semibold">{t('thankYou')}</div>
        </>
      )}
    </div>
  )
}

export type ShareFormat = 'image' | 'pdf'
type Format = ShareFormat
const FORMAT_KEY = 'agri.shareFormat'

/** Preview, then send on WhatsApp as an image or a PDF (or save the file) */
function ShareDialog({ open, onClose, s: make, fileName, text, controls }: {
  open: boolean; onClose: () => void; s: Statement | ((f: Format) => Statement); fileName: string; text: string; controls?: ReactNode
}) {
  const { t, lang } = useI18n()
  const { toast } = useFeedback()
  const told = useShareToast()
  const [format, setFormat] = useState<Format>(() => {
    try {
      return localStorage.getItem(FORMAT_KEY) === 'image' ? 'image' : 'pdf'
    } catch {
      return 'pdf'
    }
  })
  const s = typeof make === 'function' ? make(format) : make
  const shotRef = useRef<HTMLDivElement>(null)
  const [out, setOut] = useState<{ key: string; file: File; previews: string[] } | null>(null)
  const [failed, setFailed] = useState('')
  const [sending, setSending] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify([s, format, lang, fileName, attempt])
  const img = forImage(s)

  // make the file whenever the dialog opens or what is shared changes
  useEffect(() => {
    if (!open) return
    let dead = false
    const id = setTimeout(async () => {
      const nodes = [...(shotRef.current?.children ?? [])] as HTMLElement[]
      try {
        if (!nodes.length) throw new Error('NO_IMAGE')
        const make = async (): Promise<{ file: File; previews: string[] }> => {
          if (format === 'image') {
            const png = await nodeToPng(nodes[0])
            return { file: new File([png], `${safeName(fileName)}.png`, { type: 'image/png' }), previews: [URL.createObjectURL(png)] }
          }
          const { pdf, pages } = await nodesToPdf(nodes)
          return { file: new File([pdf], `${safeName(fileName)}.pdf`, { type: 'application/pdf' }), previews: pages }
        }
        // never leave the shop waiting on a spinner: give up after a while and offer a retry
        const { file, previews } = await Promise.race([
          make(),
          new Promise<never>((_, fail) => setTimeout(() => fail(new Error('TIMEOUT')), 60_000)),
        ])
        if (dead) return
        setOut((old) => {
          old?.previews.forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u))
          return { key, file, previews }
        })
      } catch {
        if (!dead) setFailed(key)
      }
    }, 250)
    return () => {
      dead = true
      clearTimeout(id)
    }
  }, [open, key])

  const ready = out?.key === key ? out : null
  const choose = (f: Format) => {
    setFormat(f)
    try {
      localStorage.setItem(FORMAT_KEY, f)
    } catch {
      /* ignore */
    }
  }
  const send = async () => {
    if (!ready) return
    setSending(true)
    try {
      told(await shareFile(ready.file, { text, phone: s.phone }))
    } catch {
      toast(t('shareFailed'), 'err')
    } finally {
      setSending(false)
    }
  }

  const pages = format === 'pdf' ? paginate(s) : []
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('shareTitle')}
      footer={
        <>
          <div className="me-auto inline-flex rounded-lg bg-stone-100 p-0.5 text-sm">
            {(['pdf', 'image'] as const).map((f) => (
              <button key={f} type="button" onClick={() => choose(f)} className={cx('rounded-md px-3 py-1 cursor-pointer', format === f ? 'bg-surface font-medium shadow-sm' : 'text-stone-600')}>
                {f === 'pdf' ? t('sharePdf') : t('shareImage')}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => ready && downloadFile(ready.file, ready.file.name)} disabled={!ready} aria-label={t('shareSave')} title={t('shareSave')}>
            <Download className="size-4" />
          </Button>
          <Button className="w-full sm:w-auto" onClick={send} disabled={!ready} loading={sending || (!ready && failed !== key)}>
            {ready && !sending && <MessageCircle className="size-4" />} {t('shareSend')}
          </Button>
        </>
      }
    >
      {controls && <div className="mb-3">{controls}</div>}
      <div className="max-h-[60vh] overflow-y-auto rounded-lg bg-stone-100 p-3">
        {failed === key ? (
          <div className="space-y-3 p-4 text-center">
            <p className="text-sm text-red-700">{t('shareFailed')}</p>
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>{t('retry')}</Button>
          </div>
        ) : !ready ? (
          <Loading />
        ) : (
          <div className="space-y-3">
            {ready.previews.map((u, i) => (
              <div key={i}>
                {ready.previews.length > 1 && <div className="num mb-1 text-center text-xs text-stone-500">{t('sharePage', { n: i + 1, of: ready.previews.length })}</div>}
                <img src={u} alt="" className={cx('mx-auto w-full rounded bg-white shadow-sm', format === 'image' && 'max-w-sm')} />
              </div>
            ))}
          </div>
        )}
      </div>
      {/* what is turned into the file: off-screen, never printed */}
      {open && createPortal(
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] print:hidden">
          <div ref={shotRef} className="flex flex-col items-start">
            {format === 'image' ? (
              <div className="bg-white p-5"><StatementSheet s={img.s} cut={img.cut} /></div>
            ) : (
              pages.map((p) => <div key={p.n} className="bg-white p-1"><StatementSheet s={p.s} wide page={p} /></div>)
            )}
          </div>
        </div>,
        document.body,
      )}
    </Modal>
  )
}

/** WhatsApp button that opens the preview / share dialog for a statement */
export function ShareStatement({ s, fileName, text, controls, size = 'sm', label }: {
  /** a function is only run while the dialog is open (and gets the chosen format) */
  s: Statement | ((f: ShareFormat) => Statement); fileName: string; text: string; controls?: ReactNode; size?: 'sm' | 'md'; label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <WhatsAppButton size={size} label={label} onClick={() => setOpen(true)} />
      {open && <ShareDialog open onClose={() => setOpen(false)} s={s} fileName={fileName} text={text} controls={controls} />}
    </>
  )
}
