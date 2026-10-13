import { CalendarClock, Check, MessageCircle, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useOrg } from '../../lib/app'
import { errText } from '../../lib/errors'
import { fmtDate } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { DUE_TONE, dueGroupOf, dueText, reminderText, waLink, type CustomerDue, type PartyWithRule } from '../../lib/khataMoney'
import { fmtMoney } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Card, Input, useFeedback } from '../ui'
import { DueRuleChips, useDueRuleLabel } from './DueRuleChips'

/** A customer's unpaid bills with their due dates, and the default "usually pays by" rule */
export function DuesCard({
  party, dues, onOpenInvoice, onChanged,
}: {
  party: PartyWithRule
  dues: CustomerDue[]
  onOpenInvoice: (saleId: string) => void
  onChanged: () => void
}) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const { toast } = useFeedback()
  const ruleLabel = useDueRuleLabel()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dueEdit, setDueEdit] = useState<{ sale: string; date: string } | null>(null)
  const rule = party.due_rule ?? ''
  const total = dues.reduce((s, d) => s + d.outstanding, 0)
  const overdue = dues.filter((d) => d.due_date && d.due_date < today).reduce((s, d) => s + d.outstanding, 0)
  const earliest = dues.map((d) => d.due_date).filter((d): d is string => !!d).sort()[0] ?? null

  const saveRule = async (r: string) => {
    if (r === rule) return setEditing(false)
    setBusy(true)
    const { error } = await supabase.from('parties').update({ due_rule: r || null }).eq('id', party.id)
    setBusy(false)
    if (error) return toast(errText(error, t), 'err')
    setEditing(false)
    toast(t('saved'))
    onChanged()
  }

  const saveDue = async (sale: string, date: string | null) => {
    setBusy(true)
    const { error } = await supabase.rpc('set_sale_due_date', { p_org: org.id, p_sale: sale, p_due: date })
    setBusy(false)
    if (error) {
      const msg = String(error.message ?? '')
      return toast(/set_sale_due_date|schema cache|PGRST20/.test(msg) ? t('errRunMigration', { n: '014' }) : errText(error, t), 'err')
    }
    setDueEdit(null)
    toast(t('saved'))
    onChanged()
  }

  const wa = total > 0
    ? waLink(party.phone, reminderText(t, {
        name: party.name, shop: org.name, shopPhone: org.phone, amount: fmtMoney(total, lang),
        due: earliest, dueLabel: earliest ? fmtDate(earliest, lang) : null, today,
      }))
    : null

  return (
    <Card
      className="print-plain"
      title={<span className="flex items-center gap-2"><CalendarClock className="size-4 text-stone-500" /> {t('khDues')}</span>}
      action={wa && (
        <a href={wa} target="_blank" rel="noreferrer" className="no-print inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover">
          <MessageCircle className="size-4" /> {t('khRemind')}
        </a>
      )}
    >
      <div className="border-b border-stone-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-500">{t('khUsuallyPays')}:</span>
          <b>{ruleLabel(rule) ?? t('khNoDefault')}</b>
          {!editing && (
            <button onClick={() => setEditing(true)} className="no-print text-sm font-medium text-brand-700 hover:underline cursor-pointer">
              {t('khChange')}
            </button>
          )}
        </div>
        {editing && (
          <div className="no-print mt-2">
            <DueRuleChips value={rule} onChange={saveRule} disabled={busy} />
            <div className="mt-1 text-xs text-stone-500">{t('khUsuallyPaysHint')}</div>
          </div>
        )}
      </div>

      {dues.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-stone-500">{t('khNothingDue')}</div>
      ) : (
        <>
          {overdue > 0 && (
            <div className="num border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
              {t('khOverdueAmount', { amount: fmtMoney(overdue, lang) })}
            </div>
          )}
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('khBill')}</th>
                  <th>{t('khDueDate')}</th>
                  <th className="r">{t('khOutstanding')}</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => {
                  const g = dueGroupOf(d.due_date, today)
                  return (
                    <tr key={d.sale_id ?? 'opening'} className={d.sale_id ? 'cursor-pointer' : undefined} onClick={() => d.sale_id && onOpenInvoice(d.sale_id)}>
                      <td>
                        <div className="num font-medium">{d.sale_id ? t('khInvNo', { n: d.invoice_no ?? '' }) : t('lk_opening')}</div>
                        <div className="num text-xs text-stone-500">{fmtDate(d.sale_date, lang)}</div>
                      </td>
                      <td onClick={(e) => d.sale_id && e.stopPropagation()}>
                        {d.sale_id && dueEdit?.sale === d.sale_id ? (
                          <div className="no-print flex flex-wrap items-center gap-1.5">
                            <Input type="date" className="h-8 w-40" min={d.sale_date} value={dueEdit.date}
                              onChange={(e) => setDueEdit({ sale: d.sale_id!, date: e.target.value })} aria-label={t('khDueDate')} />
                            <Button size="sm" disabled={!dueEdit.date} loading={busy} onClick={() => saveDue(d.sale_id!, dueEdit.date)} aria-label={t('save')}>
                              <Check className="size-4" />
                            </Button>
                            {d.due_date && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => saveDue(d.sale_id!, null)} title={t('khClearDue')}>
                                {t('khClearDue')}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setDueEdit(null)} aria-label={t('cancel')}><X className="size-4" /></Button>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            {d.due_date ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="num text-sm">{fmtDate(d.due_date, lang)}</span>
                                {g !== 'later' && <Badge tone={DUE_TONE[g]}>{dueText(d.due_date, today, t)}</Badge>}
                              </div>
                            ) : (
                              <span className="text-sm text-stone-400">{t('khNoDate')}</span>
                            )}
                            {d.sale_id && (
                              <button type="button" className="no-print -mt-0.5 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
                                onClick={() => setDueEdit({ sale: d.sale_id!, date: d.due_date ?? '' })} title={t('khSetDue')} aria-label={t('khSetDue')}>
                                <Pencil className="size-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="r">
                        <div className="num font-semibold">{fmtMoney(d.outstanding, lang)}</div>
                        {d.outstanding < d.amount - 0.005 && (
                          <div className="num text-xs text-stone-500">{t('khOfAmount', { amount: fmtMoney(d.amount, lang) })}</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>{t('total')}</td>
                  <td className="r num">{fmtMoney(total, lang)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
