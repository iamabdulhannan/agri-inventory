import { ArrowRight, Banknote } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOrg } from '../../lib/app'
import { fmtDate } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import type { Cheque } from '../../lib/khataMoney'
import { fmtMoney } from '../../lib/money'
import { Badge } from '../ui'

/** Cheques of this party that have not cleared yet ("Cheque #445566 MCB · Rs 600 · dated 20 Dec") */
export function PendingCheques({ cheques, balance }: { cheques: Cheque[]; balance: number }) {
  const { t, lang } = useI18n()
  const { today } = useOrg()
  if (!cheques.length) return null
  const total = cheques.reduce((s, c) => s + c.amount, 0)
  return (
    <div className="rounded-xl border border-stone-200 bg-surface p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-stone-800">
          <Banknote className="size-4 text-stone-500" /> {t('khPendingCheques')}
        </div>
        <Link to="/bank" className="no-print inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          {t('khOpenBank')} <ArrowRight className="size-4 rtl:rotate-180" />
        </Link>
      </div>
      <ul className="divide-y divide-stone-100">
        {cheques.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
            <span className="min-w-0">
              {t('khCheque')}
              {c.cheque_no && <span className="num" dir="ltr"> #{c.cheque_no}</span>}
              {c.bank_name && <span> {c.bank_name}</span>}
              <span className="text-stone-500"> · {t('khDated', { date: fmtDate(c.cheque_date, lang) })}</span>
            </span>
            <span className="flex items-center gap-2">
              {c.cheque_date > today && <Badge tone="blue">{t('khPostDated')}</Badge>}
              <b className="num">{fmtMoney(c.amount, lang)}</b>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1 text-xs text-stone-500">
        {t('khChequesNote')}
        {cheques.length > 1 && <> · <span className="num">{t('total')}: {fmtMoney(total, lang)}</span></>}
        {balance > 0 && <> · <span className="num">{t('khAfterClear')}: {fmtMoney(balance - total, lang)}</span></>}
      </div>
    </div>
  )
}
