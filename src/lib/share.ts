import { getFontEmbedCSS, toCanvas } from 'html-to-image'

// the web fonts (Inter + Urdu) are read once and reused for every image
let fontCss: Promise<string> | null = null

async function canvasOf(node: HTMLElement, pixelRatio: number): Promise<HTMLCanvasElement> {
  await document.fonts.ready
  if (!fontCss) {
    fontCss = getFontEmbedCSS(node).catch(() => {
      fontCss = null
      return ''
    })
  }
  const css = await fontCss
  return toCanvas(node, { pixelRatio, backgroundColor: '#ffffff', fontEmbedCSS: css || undefined })
}

const blobOf = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('NO_IMAGE'))), type, quality))

/** PNG of a rendered receipt / statement, sharp enough to read on a phone */
export async function nodeToPng(node: HTMLElement): Promise<Blob> {
  return blobOf(await canvasOf(node, 3), 'image/png')
}

/** A4 PDF, one rendered node per page (Urdu stays exactly as on screen). Also gives page previews. */
export async function nodesToPdf(nodes: HTMLElement[]): Promise<{ pdf: Blob; pages: string[] }> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = 210, H = 297, M = 10
  const pages: string[] = []
  for (let i = 0; i < nodes.length; i++) {
    const c = await canvasOf(nodes[i], 2)
    const jpg = c.toDataURL('image/jpeg', 0.85)
    pages.push(jpg)
    let w = W - 2 * M
    let h = (c.height * w) / c.width
    if (h > H - 2 * M) {
      w = (w * (H - 2 * M)) / h
      h = H - 2 * M
    }
    if (i) doc.addPage()
    doc.addImage(jpg, 'JPEG', (W - w) / 2, M, w, h)
  }
  return { pdf: doc.output('blob'), pages }
}

/** Pakistani numbers to WhatsApp's form: 0300-1234567 / +92 300 1234567 -> 923001234567 */
export function waNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  // a field may hold two numbers: use the first
  const candidates = [phone, ...phone.split(/[,;/]|\s+(?=\+|0)/)]
  for (const c of candidates) {
    let d = c.replace(/\D/g, '')
    if (d.startsWith('00')) d = d.slice(2)
    if (d.startsWith('0')) d = '92' + d.slice(1)
    else if (d.length === 10 && d.startsWith('3')) d = '92' + d
    if (d.length >= 11 && d.length <= 15) return d
  }
  return ''
}

export function downloadFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** a file name that works on every phone and computer */
export const safeName = (s: string) => s.replace(/[\s/\\:*?"<>|]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

export type ShareResult = 'shared' | 'copied' | 'downloaded' | 'cancelled'

/**
 * Phones: the share sheet with the file (pick WhatsApp and the contact there).
 * Computers: an image goes to the clipboard, a PDF is downloaded, and the WhatsApp chat
 * opens with a short text, ready to paste or attach it.
 */
export async function shareFile(file: File | Promise<File>, o: { text: string; phone?: string | null }): Promise<ShareResult> {
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && typeof navigator.canShare === 'function') {
    const f = await file
    if (navigator.canShare({ files: [f] })) {
      try {
        await navigator.share({ files: [f] })
        return 'shared'
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
        // not allowed here: fall back to the WhatsApp link below
      }
    }
  }
  let how: ShareResult = 'downloaded'
  const f = await file
  if (f.type === 'image/png' && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': f })])
      how = 'copied'
    } catch {
      /* no clipboard access: download it instead */
    }
  }
  if (how === 'downloaded') downloadFile(f, f.name)
  window.open(`https://wa.me/${waNumber(o.phone)}?text=${encodeURIComponent(o.text)}`, '_blank', 'noopener')
  return how
}
