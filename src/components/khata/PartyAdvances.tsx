import { ArrowDownToLine, ArrowRightLeft, Lock, LockOpen, Plus, Sprout, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useOrg } from '../../lib/app'
import { cx } from '../../lib/cx'
import { errText } from '../../lib/errors'
import { fmtDate } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { advanceTitle, type AdvanceEntry, type AdvanceKind, type CropAdvance } from '../../lib/khataMoney'
import { fmtMoney } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Card, Empty, useFeedback } from '../ui'
import { AdvanceMoveModal, NewAdvanceModal, type MoveKind } from './AdvanceModals'

const KIND_TONE: Record<AdvanceKind, 'green' | 'amber' | 'red' | 'blue'> = { deposit: 'green', use: 'amber', refund: 'red', to_khata: 'blue' }

/** A customer's crop advances (kept apart from the khata), anchor #advances */
export function PartyAdvances({
  party, advances, entries, onOpenInvoice, onChanged,
}: {
  party: { id: string; name: string }
  advances: CropAdvance[]
  entries: AdvanceEntry[]
  onOpenInvoice: (saleId: string) => void
  onChanged: () => void
}) {
  const { t, lang } = useI18n()
  const { isAdmin } = useOrg()
  const { toast, confirm } = useFeedback()
  const { hash } = useLocation()
  const ref = useRef<HTMLElement>(null)
  const [adding, setAdding] = useState(false)
  const [move, setMove] = useState<{ advance: CropAdvance; kind: MoveKind } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // opened from the crop advances list: scroll here once
  useEffect(() => {
    if (hash === '#advances') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const kindLabel = (k: AdvanceKind) => t(k === 'deposit' ? 'khKindDeposit' : k === 'use' ? 'khKindUse' : k === 'refund' ? 'khKindRefund' : 'khKindToKhata')
  const done = (msg: string) => {
    toast(msg)
    onChanged()
  }

  const toggleClosed = async (a: CropAdvance) => {
    if (!a.is_closed && a.balance > 0.005 && !(await confirm(t('khCloseWithMoney', { amount: fmtMoney(a.balance, lang) }), false))) return
    setBusy(a.id)
    const { error } = await supabase.from('crop_advances').update({ is_closed: !a.is_closed }).eq('id', a.id)
    setBusy(null)
    if (error) return toast(errText(error, t), 'err')
    done(a.is_closed ? t('khReopened') : t('khClosed'))
  }

  const removeAdvance = async (a: CropAdvance) => {
    if (!(await confirm(t('khDeleteAdvanceConfirm')))) return
    const { error } = await supabase.from('crop_advances').delete().eq('id', a.id)
    if (error) return toast(errText(error, t), 'err')
    done(t('deleted'))
  }

  const removeEntry = async (e: AdvanceEntry) => {
    if (!(await confirm(t('khDeleteEntryConfirm', { amount: fmtMoney(e.amount, lang) })))) return
    const res = e.kind === 'to_khata' || !e.cash_entry_id
      ? await supabase.from('advance_entries').delete().eq('id', e.id)
      : await supabase.from('cash_entries').delete().eq('id', e.cash_entry_id)
    if (res.error) return toast(errText(res.error, t), 'err')
    done(t('deleted'))
  }

  return (
    <section id="advances" ref={ref} className="scroll-mt-20">
      <Card
        className="print-plain"
        title={<span className="flex items-center gap-2"><Sprout className="size-4 text-brand-700" /> {t('khCropAdvances')}</span>}
        action={
          <Button size="sm" variant="secondary" className="no-print" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t('khNewAdvance')}
          </Button>
        }
      >
        {advances.length === 0 ? (
          <Empty>{t('khNoAdvancesParty')}</Empty>
        ) : (
          <div className="divide-y divide-stone-100">
            {advances.map((a) => {
              const list = entries.filter((e) => e.advance_id === a.id)
              const hasMoney = a.balance > 0.005
              return (
                <div key={a.id} className={cx('p-4', a.is_closed && 'opacity-80')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-stone-900">{advanceTitle(a, t)}</h3>
                        {a.is_closed ? <Badge>{t('khClosedBadge')}</Badge> : <Badge tone="green">{t('khOpenBadge')}</Badge>}
                      </div>
                      {a.note && <div className="text-sm text-stone-500">{a.note}</div>}
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-stone-500">{t('khLeft')}</div>
                      <div className={cx('num text-2xl font-bold', hasMoney ? 'text-sky-800' : 'text-stone-500')}>{fmtMoney(a.balance, lang)}</div>
                    </div>
                  </div>

                  <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                    <span>{t('khDeposited')}: <b>{fmtMoney(a.deposited, lang)}</b></span>
                    <span>{t('khUsed')}: <b>{fmtMoney(a.used, lang)}</b></span>
                    {a.refunded > 0 && <span>{t('khRefunded')}: <b>{fmtMoney(a.refunded, lang)}</b></span>}
                    {a.moved_to_khata > 0 && <span>{t('khMovedToKhata')}: <b>{fmtMoney(a.moved_to_khata, lang)}</b></span>}
                  </div>

                  <div className="no-print mt-3 flex flex-wrap gap-2">
                    {!a.is_closed && (
                      <Button size="sm" onClick={() => setMove({ advance: a, kind: 'deposit' })}>
                        <ArrowDownToLine className="size-4" /> {t('khAddMoney')}
                      </Button>
                    )}
                    {hasMoney && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setMove({ advance: a, kind: 'refund' })}>
                          <Undo2 className="size-4" /> {t('khRefund')}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setMove({ advance: a, kind: 'to_khata' })}>
                          <ArrowRightLeft className="size-4" /> {t('khMoveToKhata')}
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" loading={busy === a.id} onClick={() => toggleClosed(a)}>
                      {a.is_closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />} {a.is_closed ? t('khReopen') : t('khClose')}
                    </Button>
                    {isAdmin && list.length === 0 && (
                      <Button size="sm" variant="ghost" className="text-red-700" onClick={() => removeAdvance(a)} aria-label={t('delete')}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>

                  {list.length > 0 && (
                    <details className="mt-3 rounded-lg border border-stone-200" open={!a.is_closed}>
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-stone-700">
                        {t('khHistory')} ({list.length})
                      </summary>
                      <ul className="divide-y divide-stone-100 border-t border-stone-100">
                        {list.map((e) => (
                          <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="num text-stone-500">{fmtDate(e.entry_date, lang)}</span>
                                <Badge tone={KIND_TONE[e.kind]}>{kindLabel(e.kind)}</Badge>
                                {e.kind === 'use' && e.sale_id && (
                                  <button className="num font-medium text-brand-700 hover:underline cursor-pointer" onClick={() => onOpenInvoice(e.sale_id!)}>
                                    {t('khInvNo', { n: e.sales?.invoice_no ?? '' })}
                                  </button>
                                )}
                              </div>
                              {(e.note || e.created_by_name) && (
                                <div className="mt-0.5 text-xs text-stone-500">
                                  {[e.note, e.created_by_name && `${t('by')} ${e.created_by_name}`].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <b className={cx('num', e.kind === 'deposit' ? 'text-brand-700' : 'text-stone-800')}>
                                {e.kind === 'deposit' ? '+' : '-'}{fmtMoney(e.amount, lang)}
                              </b>
                              {isAdmin && e.kind !== 'use' && (
                                <button
                                  className="no-print rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                                  onClick={() => removeEntry(e)}
                                  aria-label={t('delete')}
                                  title={t('delete')}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <NewAdvanceModal open={adding} onClose={() => setAdding(false)} party={party} onSaved={() => { setAdding(false); done(t('khAdvanceSaved')) }} />
      <AdvanceMoveModal
        advance={move?.advance ?? null}
        kind={move?.kind ?? 'deposit'}
        partyName={party.name}
        onClose={() => setMove(null)}
        onSaved={() => {
          const k = move?.kind
          setMove(null)
          done(k === 'to_khata' ? t('khMovedToast') : k === 'refund' ? t('khRefundToast') : t('khAdvanceSaved'))
        }}
      />
    </section>
  )
}
