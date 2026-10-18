import { CloudOff, Download, Loader2, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOrg } from '../lib/app'
import { cx } from '../lib/cx'
import { fetchAll } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { loadAccounts } from '../lib/accounts'
import { loadCatalog } from '../lib/catalog'
import { idbClear } from '../lib/offline/idb'
import { invoiceNumbersLeft, topUpInvoiceNumbers } from '../lib/offline/device'
import { isOnline, onNetwork } from '../lib/offline/net'
import { listOps, onQueue, type PendingOp } from '../lib/offline/queue'
import { discardOp, onSynced, retryOp, syncNow } from '../lib/offline/sync'
import { loadParties } from '../lib/parties'
import { applyUpdate, canInstall, onPwa, promptInstall, updateReady } from '../lib/pwa'
import { supabase } from '../lib/supabase'
import { Badge, Button, Empty, Modal, useFeedback } from './ui'

/** online state + this organization's waiting changes */
export function useSyncState() {
  const { org } = useOrg()
  const [online, setOnline] = useState(isOnline())
  const [ops, setOps] = useState<PendingOp[]>([])
  useEffect(() => onNetwork(setOnline), [])
  useEffect(() => {
    const load = () => { void listOps(org.id).then(setOps) }
    load()
    return onQueue(load)
  }, [org.id])
  return { online, ops, pending: ops.filter((o) => o.status === 'pending').length, failed: ops.filter((o) => o.status === 'failed').length }
}

/**
 * Runs in the background while the app is open: keeps invoice numbers and the most used
 * data saved on this device, and reloads the screens after offline changes reached the server.
 */
export function OfflineAgent() {
  const { org, session, today, refresh } = useOrg()
  const userId = session?.user.id
  // another person logged in on this device: forget the previous person's saved data
  useEffect(() => {
    if (!userId) return
    try {
      if (localStorage.getItem('agri.lastUser') !== userId) {
        void idbClear('reads')
        localStorage.setItem('agri.lastUser', userId)
      }
    } catch { /* ignore */ }
  }, [userId])
  useEffect(() => onSynced(() => refresh()), [refresh])
  useEffect(() => {
    let done = false
    const warm = async () => {
      if (done || !isOnline()) return
      done = true
      await topUpInvoiceNumbers(org.id).catch(() => {})
      // the data the sale / stock in / khata screens need, saved for offline use
      await Promise.allSettled([
        loadCatalog(org.id),
        loadParties(org.id, 'customer'),
        loadParties(org.id, 'supplier'),
        loadAccounts(org.id),
        fetchAll((a, b) => supabase.from('batch_stock').select('*').eq('org_id', org.id).gt('qty', 0).order('expiry_date').order('created_at').range(a, b)),
        fetchAll((a, b) => supabase.from('batch_stock').select('*').eq('org_id', org.id).order('expiry_date').range(a, b)),
        supabase.rpc('money_summary', { p_org: org.id, p_today: today }),
      ])
      void syncNow()
    }
    void warm()
    const off = onNetwork((on) => { if (on) { done = false; void warm() } })
    const id = setInterval(() => { if (isOnline()) void topUpInvoiceNumbers(org.id).catch(() => {}) }, 5 * 60 * 1000)
    return () => { off(); clearInterval(id) }
  }, [org.id, today])
  return null
}

/** Small status in the header: Offline / n to sync / n need attention */
export function SyncStatus() {
  const { t } = useI18n()
  const { online, pending, failed } = useSyncState()
  const [open, setOpen] = useState(false)
  if (online && !pending && !failed) return null
  const tone = !online ? 'bg-stone-200 text-stone-700' : failed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold', tone)}>
        {!online ? <WifiOff className="size-3.5" /> : failed ? <TriangleAlert className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
        <span className="hidden sm:inline">
          {!online ? t('offOffline') : failed ? t('offAttention', { n: failed }) : t('offWaiting', { n: pending })}
        </span>
        {(!online && pending + failed > 0) && <span className="num rounded-full bg-white/70 px-1.5">{pending + failed}</span>}
      </button>
      <SyncPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}

const OP_KEY = {
  record_sale: 'offOpSale', record_stock_in: 'offOpStockIn', record_party_payment: 'offOpPayment', record_cheque: 'offOpCheque', add_cash_entry: 'offOpCash',
} as const

export function SyncPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { org } = useOrg()
  const { confirm, toast } = useFeedback()
  const { online, ops } = useSyncState()
  const [busy, setBusy] = useState(false)
  const sync = async () => {
    setBusy(true)
    const n = await syncNow()
    setBusy(false)
    if (n) toast(t('offSynced'))
  }
  return (
    <Modal open={open} onClose={onClose} title={t('offPanelTitle')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('close')}</Button>
        <Button onClick={sync} loading={busy} disabled={!online || !ops.length}><RefreshCw className="size-4" /> {t('offSyncNow')}</Button>
      </>}>
      {!online && <div className="mb-3 flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700"><CloudOff className="mt-0.5 size-4 shrink-0" /> {t('offBanner')}</div>}
      <p className="mb-3 text-sm text-stone-600">{t('offPanelIntro')}</p>
      {ops.length === 0 ? <Empty>{t('offNothing')}</Empty> : (
        <ul className="space-y-2">
          {ops.map((op) => (
            <li key={op.id} className={cx('rounded-lg border p-3', op.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-stone-200')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={op.status === 'failed' ? 'red' : 'amber'}>{op.status === 'failed' ? t('offFailed') : t('offPending')}</Badge>
                    <span className="text-xs text-stone-500">{t(OP_KEY[op.fn])}</span>
                  </div>
                  <div className="mt-1 font-medium">{op.label}</div>
                  <div className="num text-xs text-stone-500">{t('offAt', { time: fmtDateTime(op.created_at, lang) })}</div>
                </div>
                {op.status === 'failed' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={!online} onClick={() => void retryOp(op.id)}><RefreshCw className="size-4" /> {t('offRetry')}</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { if (await confirm(t('offDiscardConfirm'), true)) await discardOp(op) }}>{t('offDiscard')}</Button>
                  </div>
                )}
              </div>
              {op.error && (
                <div className="mt-2 text-sm text-red-700">
                  {errText({ message: op.error }, t)}
                  <div className="text-xs text-stone-500">{t('offFixHint')}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="num mt-3 text-xs text-stone-500">{t('offNumbersLeft', { n: invoiceNumbersLeft(org.id) })}</p>
    </Modal>
  )
}

/** grey strip under the header while offline */
export function OfflineBanner() {
  const { t } = useI18n()
  const [online, setOnline] = useState(isOnline())
  useEffect(() => onNetwork(setOnline), [])
  if (online) return null
  return (
    <div className="no-print flex items-center gap-2 border-b border-stone-300 bg-stone-200 px-4 py-1.5 text-sm text-stone-700 lg:px-6">
      <WifiOff className="size-4 shrink-0" /> <span className="hidden sm:inline">{t('offBanner')}</span><span className="sm:hidden">{t('offBannerShort')}</span>
    </div>
  )
}

/** "Install app" (when the browser offers it) and "New version ready" */
export function usePwa() {
  const [, force] = useState(0)
  useEffect(() => onPwa(() => force((n) => n + 1)), [])
  return { canInstall: canInstall(), updateReady: updateReady(), install: promptInstall, update: applyUpdate }
}

export function InstallButton({ className }: { className?: string }) {
  const { t } = useI18n()
  const pwa = usePwa()
  if (!pwa.canInstall) return null
  return (
    <button type="button" onClick={() => void pwa.install()} title={t('offInstallHint')}
      className={cx('flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-brand-800 hover:bg-brand-50', className)}>
      <Download className="size-4" /> {t('offInstall')}
    </button>
  )
}

export function UpdateToast() {
  const { t } = useI18n()
  const pwa = usePwa()
  if (!pwa.updateReady) return null
  return (
    <div className="no-print fixed inset-x-0 bottom-20 z-50 mx-auto flex w-fit items-center gap-3 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-xl lg:bottom-6">
      {t('offUpdate')}
      <Button size="sm" variant="light" onClick={pwa.update}>{t('offReload')}</Button>
    </div>
  )
}
