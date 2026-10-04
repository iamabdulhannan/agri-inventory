import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOrg } from '../lib/app'
import type { Catalog } from '../lib/catalog'
import { errText } from '../lib/errors'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { PackType, PackUnit, Product } from '../lib/types'
import { LIQUID_PRESETS, PACK_TYPES, SOLID_PRESETS, fmtPack, measureOf, suggestPackType, type Preset } from '../lib/units'
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea } from './ui'
import { cx } from '../lib/cx'

interface SizeRow extends Preset {
  type: PackType
}
const key = (s: Preset) => `${s.size}|${s.unit}`

/**
 * Create one product in several pack sizes at once (e.g. Confidor 200 ml, 500 ml, 1 L),
 * or edit a single existing product.
 */
export function ProductForm({
  open, onClose, catalog, product, onSaved, defaultName,
}: {
  open: boolean
  onClose: () => void
  catalog: Catalog
  product?: Product | null
  onSaved: (ids: string[]) => void
  defaultName?: string
}) {
  const { t, pick, lang } = useI18n()
  const { org } = useOrg()
  const editing = !!product

  const [name, setName] = useState('')
  const [nameUr, setNameUr] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [newCompany, setNewCompany] = useState<string | null>(null)
  const [kind, setKind] = useState<'liquid' | 'dry' | 'pcs'>('liquid')
  const [sizes, setSizes] = useState<SizeRow[]>([])
  const [customSize, setCustomSize] = useState('')
  const [customUnit, setCustomUnit] = useState<PackUnit>('ml')
  const [minStock, setMinStock] = useState('0')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setNewCompany(null)
    setCustomSize('')
    if (product) {
      setName(product.name)
      setNameUr(product.name_ur ?? '')
      setCategoryId(product.category_id)
      setCompanyId(product.company_id ?? '')
      const m = measureOf(product.pack_unit)
      setKind(m === 'volume' ? 'liquid' : m === 'weight' ? 'dry' : 'pcs')
      setSizes([{ size: Number(product.pack_size), unit: product.pack_unit, type: product.pack_type }])
      setMinStock(String(product.min_stock))
      setNotes(product.notes ?? '')
    } else {
      setName(defaultName ?? '')
      setNameUr('')
      setCategoryId(catalog.categories[0]?.id ?? '')
      setCompanyId('')
      setKind('liquid')
      setSizes([])
      setMinStock('0')
      setNotes('')
    }
  }, [open, product, catalog.categories, defaultName])

  useEffect(() => setCustomUnit(kind === 'liquid' ? 'ml' : kind === 'dry' ? 'kg' : 'pcs'), [kind])

  const presets = kind === 'liquid' ? LIQUID_PRESETS : kind === 'dry' ? SOLID_PRESETS : []
  const has = (p: Preset) => sizes.some((s) => key(s) === key(p))

  const toggle = (p: Preset) => {
    const row = { ...p, type: suggestPackType(p.size, p.unit) }
    if (editing) return setSizes([row])
    setSizes((list) => (has(p) ? list.filter((s) => key(s) !== key(p)) : [...list, row]))
  }
  const addCustom = () => {
    const n = Number(customSize)
    if (!(n > 0)) return
    const p = { size: n, unit: customUnit }
    if (!has(p)) toggle(p)
    setCustomSize('')
  }

  const save = async () => {
    setError('')
    if (!name.trim()) return setError(t('productName') + ' *')
    if (!categoryId) return setError(t('selectCategory'))
    if (sizes.length === 0) return setError(t('selectSizes') + ' *')
    setBusy(true)
    try {
      let company: string | null = companyId || null
      if (newCompany !== null && newCompany.trim()) {
        const nm = newCompany.trim()
        const existing = catalog.companies.find((c) => c.name.toLowerCase() === nm.toLowerCase())
        if (existing) company = existing.id
        else {
          const { data, error } = await supabase.from('companies').insert({ org_id: org.id, name: nm }).select('id').single()
          if (error) throw error
          company = data.id
        }
      }
      const base = {
        name: name.trim(),
        name_ur: nameUr.trim() || null,
        category_id: categoryId,
        company_id: company,
        min_stock: Math.max(0, Number(minStock) || 0),
        notes: notes.trim() || null,
      }
      if (editing && product) {
        const s = sizes[0]
        const { error } = await supabase
          .from('products')
          .update({ ...base, pack_size: s.size, pack_unit: s.unit, pack_type: s.type })
          .eq('id', product.id)
        if (error) throw error
        onSaved([product.id])
      } else {
        const rows = sizes.map((s) => ({ ...base, org_id: org.id, pack_size: s.size, pack_unit: s.unit, pack_type: s.type }))
        const { data, error } = await supabase.from('products').insert(rows).select('id')
        if (error) throw error
        onSaved((data ?? []).map((r) => r.id))
      }
    } catch (e) {
      setError(errText(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? t('editProduct') : t('addProduct')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={save} loading={busy}>
            <Check className="size-4" /> {t('save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('productName')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Confidor 200 SL" />
        </Field>
        <Field label={t('urduName')} hint={t('optional')}>
          <Input value={nameUr} onChange={(e) => setNameUr(e.target.value)} dir="rtl" placeholder="کونفیڈور" />
        </Field>
        <Field label={t('category')} required>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="" disabled>{t('selectCategory')}</option>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>{pick(c.name, c.name_ur)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('company')} hint={t('optional')}>
          {newCompany === null ? (
            <Select
              value={companyId}
              onChange={(e) => (e.target.value === '__new' ? setNewCompany('') : setCompanyId(e.target.value))}
            >
              <option value="">{t('selectCompany')}</option>
              {catalog.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="__new">+ {t('newCompany')}</option>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input autoFocus value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Bayer, Syngenta, FMC…" />
              <Button variant="ghost" onClick={() => setNewCompany(null)} aria-label={t('cancel')}>
                <X className="size-4" />
              </Button>
            </div>
          )}
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-stone-700">
            {t('selectSizes')} <span className="text-red-600">*</span>
          </span>
          <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-sm">
            {(['liquid', 'dry', 'pcs'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cx('rounded-md px-3 py-1 cursor-pointer', kind === k ? 'bg-surface font-medium shadow-sm' : 'text-stone-600')}
              >
                {k === 'liquid' ? t('liquid') : k === 'dry' ? t('dry') : t('pt_piece')}
              </button>
            ))}
          </div>
        </div>
        {!editing && <p className="mb-2 text-xs text-stone-500">{t('multiSizeHint')}</p>}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={key(p)}
              type="button"
              onClick={() => toggle(p)}
              className={cx(
                'num h-9 rounded-full px-3.5 text-sm font-medium ring-1 transition-colors cursor-pointer',
                has(p) ? 'bg-primary text-white ring-primary' : 'bg-surface text-stone-700 ring-stone-300 hover:ring-brand-600',
              )}
            >
              {fmtPack(p.size, p.unit, lang)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label={t('customSize')} className="w-32">
            <Input type="number" min="0" step="any" value={customSize} onChange={(e) => setCustomSize(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
          </Field>
          <Select className="w-28" value={customUnit} onChange={(e) => setCustomUnit(e.target.value as PackUnit)}>
            {(kind === 'liquid' ? (['ml', 'l'] as PackUnit[]) : kind === 'dry' ? (['g', 'kg'] as PackUnit[]) : (['pcs'] as PackUnit[])).map((u) => (
              <option key={u} value={u}>{fmtPack(1, u, lang).replace(/^1 /, '')}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={addCustom} disabled={!(Number(customSize) > 0)}>
            <Plus className="size-4" /> {t('addSize')}
          </Button>
        </div>

        {sizes.length > 0 && (
          <div className="mt-4 divide-y divide-stone-100 rounded-lg border border-stone-200">
            {sizes.map((s, i) => (
              <div key={key(s)} className="flex items-center gap-3 px-3 py-2">
                <span className="num w-24 font-semibold text-brand-800">{fmtPack(s.size, s.unit, lang)}</span>
                <Select
                  className="h-9 w-40"
                  value={s.type}
                  onChange={(e) => setSizes((list) => list.map((x, j) => (j === i ? { ...x, type: e.target.value as PackType } : x)))}
                >
                  {PACK_TYPES.map((pt) => (
                    <option key={pt} value={pt}>{t(`pt_${pt}`)}</option>
                  ))}
                </Select>
                {!editing && (
                  <button type="button" className="ms-auto rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600 cursor-pointer" onClick={() => toggle(s)} aria-label={t('remove')}>
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={t('minStock')} hint={t('minStockHint')}>
          <Input type="number" min="0" step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </Field>
        <Field label={t('note')} hint={t('optional')}>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      {error && <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>}
    </Modal>
  )
}
