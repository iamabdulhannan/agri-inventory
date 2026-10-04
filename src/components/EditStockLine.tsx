import { useEffect, useState } from 'react'
import { useOrg } from '../lib/app'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n'
import { fmtMoney } from '../lib/money'
import { supabase } from '../lib/supabase'
import type { Movement, ProductStock } from '../lib/types'
import { fmtTotal } from '../lib/units'
import { ProductName } from './domain'
import { Button, ErrorBox, Field, Input, Modal } from './ui'

export interface EditableLine {
  movement: Movement & { batches?: { batch_no: string; expiry_date: string; product_id: string; mfg_date?: string | null } | null }
  product: ProductStock
}

/** Edit one opening-stock / manual stock-in line (owner / admin) */
export function EditStockLine({ line, onClose, onSaved }: { line: EditableLine | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const { org, today } = useOrg()
  const [date, setDate] = useState('')
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [expiry, setExpiry] = useState('')
  const [mfg, setMfg] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!line) return
    const m = line.movement
    setDate(m.movement_date)
    setQty(String(Number(m.qty)))
    setRate(m.unit_price == null ? '' : String(Number(m.unit_price)))
    const b = m.batches
    setBatchNo(b && !b.batch_no.startsWith('EXP-') ? b.batch_no : '')
    setExpiry(b?.expiry_date ?? '')
    setMfg(b?.mfg_date ?? '')
    setNote(m.note ?? '')
    setError('')
  }, [line])

  const save = async () => {
    if (!line) return
    setError('')
    if (!(Number(qty) > 0)) return setError(t('errQty'))
    if (!expiry) return setError(t('errExpiryRequired'))
    if (rate !== '' && !(Number(rate) >= 0)) return setError(t('errInvalidPrice'))
    setBusy(true)
    const { error } = await supabase.rpc('edit_stock_in_line', {
      p_org: org.id,
      p_movement: line.movement.id,
      p_date: date,
      p_qty: Number(qty),
      p_rate: rate === '' ? null : Number(rate),
      p_batch_no: batchNo.trim() || null,
      p_expiry: expiry,
      p_mfg: mfg || null,
      p_note: note || null,
    })
    setBusy(false)
    if (error) return setError(errText(error, t))
    onSaved()
  }

  const p = line?.product
  return (
    <Modal
      open={!!line}
      onClose={onClose}
      title={t('editEntry')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('save')}</Button>
        </>
      }
    >
      {p && (
        <div className="mb-4 rounded-lg bg-stone-50 px-3 py-2">
          <ProductName p={p} />
          <div className="num mt-0.5 text-xs text-stone-500">{t('was')}: {Number(line!.movement.qty)} {t(`pt_${p.pack_type}`)}{line!.movement.unit_price != null ? ` @ ${fmtMoney(line!.movement.unit_price, lang)}` : ''}</div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${t('qtyPacks')}${p ? ` (${t(`pt_${p.pack_type}`)})` : ''}`} required hint={p && Number(qty) > 0 && p.pack_unit !== 'pcs' ? `= ${fmtTotal(Number(qty), p.pack_size, p.pack_unit, lang)}` : undefined}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label={t('purchasePrice')} optional>
          <Input type="number" min="0" step="any" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label={t('batchNo')} optional>
          <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
        </Field>
        <Field label={t('date')}>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('mfgDate')} optional>
          <Input type="date" value={mfg} onChange={(e) => setMfg(e.target.value)} />
        </Field>
        <Field label={t('expiryDate')} required>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label={t('note')} optional className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-stone-500">{t('editEntryHint')}</p>
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
    </Modal>
  )
}
