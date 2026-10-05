import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PartyPicker } from '../components/PartyPicker'
import { Badge, Button, Card, Checkbox, ErrorBox, Field, Input, Loading, PageHeader, Select, useFeedback, Segmented } from '../components/ui'
import { useOrg } from '../lib/app'
import { loadCatalog } from '../lib/catalog'
import { downloadCsv } from '../lib/csv'
import { cx } from '../lib/cx'
import { fetchAll, useLoad } from '../lib/data'
import { errText } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { fmtMoney, r2 } from '../lib/money'
import { usePackLabel } from '../lib/packLabel'
import { loadParties } from '../lib/parties'
import { buildImport, EXAMPLE_ROWS, nameKey, readFileRows, TEMPLATE_HEADER, templateRows, type Cell, type ImportRow } from '../lib/stockImport'
import { supabase } from '../lib/supabase'
import type { BatchStock } from '../lib/types'
import { fmtNum, fmtPack, suggestPackType } from '../lib/units'

type Mode = 'opening' | 'purchase'
const createKey = (c: NonNullable<ImportRow['create']>) => `${nameKey(c.name)}|${nameKey(c.company)}|${c.size}${c.unit}`

export function BulkStockIn() {
  const { t, lang, pick } = useI18n()
  const { org, today, refresh, version } = useOrg()
  const { toast, confirm } = useFeedback()
  const nav = useNavigate()
  const label = usePackLabel()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, error, loading, reload } = useLoad(async () => {
    const [catalog, batches, suppliers] = await Promise.all([
      loadCatalog(org.id),
      fetchAll<BatchStock>((a, b) => supabase.from('batch_stock').select('*').eq('org_id', org.id).range(a, b)),
      loadParties(org.id, 'supplier'),
    ])
    return { catalog, batches, suppliers }
  }, [org.id, version])

  const [fileName, setFileName] = useState('')
  const [cells, setCells] = useState<Cell[][] | null>(null)
  const [readError, setReadError] = useState('')
  const [createMissing, setCreateMissing] = useState(true)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [mode, setMode] = useState<Mode>('opening')
  const [date, setDate] = useState(today)
  const [partyId, setPartyId] = useState('')
  const [pendingParty, setPendingParty] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [paid, setPaid] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [done, setDone] = useState<{ lines: number; created: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const result = useMemo(
    () => (cells && data ? buildImport(cells, data.catalog.products, data.batches, today, createMissing) : null),
    [cells, data, today, createMissing],
  )

  if (pendingParty && data?.suppliers.some((p) => p.id === pendingParty)) {
    setPartyId(pendingParty)
    setPendingParty(null)
  }

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox onRetry={reload}>{errText(error, t)}</ErrorBox>
  if (!data) return null

  const rows = result?.rows ?? []
  const ok = rows.filter((r) => r.errors.length === 0)
  const bad = rows.filter((r) => r.errors.length > 0)
  const newProducts = new Set(ok.filter((r) => r.create).map((r) => createKey(r.create!))).size
  const total = r2(ok.reduce((s, r) => s + (r.qty ?? 0) * (r.rate ?? 0), 0))
  const isPurchase = mode === 'purchase'
  const paidNum = paid === '' ? (partyId ? 0 : total) : Number(paid) || 0
  const due = r2(total - paidNum)
  const shown = onlyProblems ? rows.filter((r) => r.errors.length || r.warnings.length) : rows

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setReadError('')
    setDone(null)
    setSaveError('')
    setFileName(file.name)
    try {
      setCells(await readFileRows(file))
    } catch (e) {
      setCells(null)
      setReadError(e instanceof Error && e.message === 'OLD_XLS' ? t('impOldXls') : t('impReadError'))
    }
  }

  const downloadTemplate = (withProducts: boolean) =>
    downloadCsv(withProducts ? 'stock-template-my-products' : 'stock-template', TEMPLATE_HEADER, withProducts ? templateRows(data.catalog.products, today) : EXAMPLE_ROWS)

  /** create the products that are not in the list yet; returns create-key -> product id */
  const createProducts = async () => {
    const want = new Map<string, NonNullable<ImportRow['create']> & { rate: number | null }>()
    for (const r of ok) if (r.create && !want.has(createKey(r.create))) want.set(createKey(r.create), { ...r.create, rate: r.rate })
    const ids = new Map<string, string>()
    if (!want.size) return ids

    // companies
    const companies = new Map(data.catalog.companies.map((c) => [nameKey(c.name), c.id]))
    const newCompanies = [...new Set([...want.values()].map((c) => c.company).filter((c) => c && !companies.has(nameKey(c))))]
    if (newCompanies.length) {
      const { data: inserted, error } = await supabase.from('companies').insert(newCompanies.map((name) => ({ org_id: org.id, name }))).select('id, name')
      if (error) throw error
      for (const c of inserted ?? []) companies.set(nameKey(c.name), c.id)
    }
    // categories: by name (English or Urdu), otherwise "Other"
    const cats = data.catalog.categories
    const other = cats.find((c) => c.name === 'Other') ?? cats[0]
    const catOf = (name: string) => cats.find((c) => nameKey(c.name) === nameKey(name) || (c.name_ur && c.name_ur.trim() === name.trim()))?.id ?? other.id

    for (const [k, c] of want) {
      const row = {
        org_id: org.id,
        name: c.name,
        company_id: c.company ? companies.get(nameKey(c.company)) ?? null : null,
        category_id: catOf(c.category),
        pack_size: c.size,
        pack_unit: c.unit,
        pack_type: suggestPackType(c.size, c.unit),
        purchase_price: c.rate && c.rate > 0 ? c.rate : 0,
      }
      const ins = await supabase.from('products').insert(row).select('id').single()
      if (!ins.error) { ids.set(k, ins.data.id); continue }
      // already there under a slightly different spelling: use the existing product
      let q = supabase.from('products').select('id').eq('org_id', org.id).ilike('name', c.name).eq('pack_size', c.size).eq('pack_unit', c.unit)
      q = row.company_id ? q.eq('company_id', row.company_id) : q.is('company_id', null)
      const found = await q.limit(1).maybeSingle()
      if (found.data) ids.set(k, found.data.id)
      else throw ins.error
    }
    return ids
  }

  const save = async () => {
    setSaveError('')
    if (!ok.length) return
    if (isPurchase && (paidNum < 0 || paidNum > total)) return setSaveError(t('errInvalidPaid'))
    if (isPurchase && due > 0 && !partyId) return setSaveError(t('errCreditNeedsParty'))
    if (bad.length && !(await confirm(t('impSkipConfirm', { n: bad.length }), false))) return
    setBusy(true)
    try {
      const created = await createProducts()
      const lines = ok.map((r) => ({
        product_id: r.product?.id ?? created.get(createKey(r.create!)),
        batch_no: r.batch_no,
        mfg_date: r.mfg_date,
        expiry_date: r.expiry_date,
        qty: r.qty,
        unit_price: r.rate && r.rate > 0 ? r.rate : null, // 0 = rate not known
      }))
      const { error } = await supabase.rpc('record_stock_in', {
        p_org: org.id,
        p_date: date,
        p_type: 'purchase',
        p_lines: lines,
        // no supplier chosen: use the companies of the items as the supplier name
        p_party: isPurchase && !partyId
          ? [...new Set(ok.map((r) => r.product?.company_name ?? r.create?.company).filter(Boolean) as string[])].slice(0, 3).join(', ') || null
          : null,
        p_reference: reference || null,
        p_note: note || null,
        p_party_id: isPurchase && partyId ? partyId : null,
        p_paid: isPurchase ? paidNum : null,
        p_opening: !isPurchase,
      })
      if (error) throw error
      setDone({ lines: lines.length, created: created.size })
      toast(t('impSaved', { n: lines.length }))
      setCells(null)
      setFileName('')
      refresh()
    } catch (e) {
      setSaveError(errText(e, t))
    } finally {
      setBusy(false)
    }
  }

  const issueText = (r: ImportRow) => [...r.errors, ...r.warnings].map((i) => t(i.key, i.vars)).join(' · ')

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link to="/stock-in" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t('stockInTitle')}
      </Link>
      <PageHeader title={<span className="flex items-center gap-2"><FileSpreadsheet className="size-6 text-brand-700" /> {t('impTitle')}</span>} subtitle={t('impSubtitle')} />

      {done && (
        <Card className="border-brand-200 bg-brand-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <CheckCircle2 className="size-6 text-brand-700" />
            <div className="flex-1">
              <div className="font-semibold">{t('impSaved', { n: done.lines })}</div>
              {done.created > 0 && <div className="text-sm text-stone-600">{t('impCreatedProducts', { n: done.created })}</div>}
            </div>
            <Button variant="secondary" onClick={() => nav('/products')}>{t('products')}</Button>
            <Button variant="secondary" onClick={() => nav('/history')}>{t('navLedger')}</Button>
          </div>
        </Card>
      )}

      {/* Step 1: template */}
      <Card className="p-4">
        <div className="mb-2 font-semibold">1. {t('impStep1')}</div>
        <p className="mb-3 text-sm text-stone-600">{t('impStep1Hint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadTemplate(true)}><Download className="size-4" /> {t('impTemplateMine', { n: data.catalog.products.filter((p) => p.is_active).length })}</Button>
          <Button variant="ghost" onClick={() => downloadTemplate(false)}><Download className="size-4" /> {t('impTemplateBlank')}</Button>
        </div>
        <ul className="mt-3 list-disc space-y-0.5 ps-5 text-xs text-stone-500">
          <li>{t('impRuleColumns')}</li>
          <li>{t('impRuleDates')}</li>
          <li>{t('impRuleSkip')}</li>
        </ul>
      </Card>

      {/* Step 2: upload */}
      <Card className="p-4">
        <div className="mb-2 font-semibold">2. {t('impStep2')}</div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]) }}
          className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragging ? 'border-brand-600 bg-brand-50' : 'border-stone-300 hover:border-brand-600')}
        >
          <Upload className="size-8 text-stone-400" />
          <span className="font-medium">{fileName || t('impDrop')}</span>
          <span className="text-xs text-stone-500">.xlsx · .csv</span>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {readError && <div className="mt-3"><ErrorBox>{readError}</ErrorBox></div>}
        {result && result.rows.length === 0 && (
          <div className="mt-3"><ErrorBox>{result.missingColumns.length ? t('impNoColumns') : result.skipped > 0 ? t('impAllEmpty', { n: result.skipped }) : t('impEmpty')}</ErrorBox></div>
        )}
      </Card>

      {result && result.rows.length > 0 && (
        <>
          {/* Step 3: check & save */}
          <Card className="p-4">
            <div className="mb-3 font-semibold">3. {t('impStep3')}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('entryType')}>
                <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  <option value="opening">{t('openingStock')}</option>
                  <option value="purchase">{t('mv_purchase')}</option>
                </Select>
              </Field>
              <Field label={t('date')}>
                <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </Field>
              {isPurchase ? (
                <>
                  <Field label={t('supplier')}>
                    <PartyPicker kind="supplier" parties={data.suppliers} value={partyId} onChange={(id) => { setPartyId(id); setPaid('') }}
                      onCreated={(id) => { setPendingParty(id); reload() }} noneLabel={t('noKhata')} />
                  </Field>
                  <Field label={t('invoiceNo')} optional>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                </>
              ) : (
                <p className="self-end pb-2 text-xs text-stone-500 sm:col-span-2">{t('openingStockHint')}</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Checkbox checked={createMissing} onChange={setCreateMissing} label={t('impCreateMissing')} />
              <Checkbox checked={onlyProblems} onChange={setOnlyProblems} label={t('impOnlyProblems')} />
            </div>
          </Card>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="green" className="px-3 py-1 text-sm">✓ {t('impReady', { n: ok.length })}</Badge>
            {newProducts > 0 && <Badge tone="blue" className="px-3 py-1 text-sm">+ {t('impNewProducts', { n: newProducts })}</Badge>}
            {bad.length > 0 && <Badge tone="red" className="px-3 py-1 text-sm">✗ {t('impProblems', { n: bad.length })}</Badge>}
            {result.skipped > 0 && <Badge className="px-3 py-1 text-sm">{t('impSkipped', { n: result.skipped })}</Badge>}
          </div>

          <Card>
            <div className="table-wrap max-h-[60vh] overflow-y-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="r">#</th>
                    <th>{t('product')}</th>
                    <th>{t('batchNo')}</th>
                    <th>{t('mfgDate')}</th>
                    <th>{t('expiryDate')}</th>
                    <th className="r">{t('qty')}</th>
                    <th className="r">{t('purchasePrice')}</th>
                    <th className="r">{t('amount')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.row} className={cx(r.errors.length ? 'bg-red-50/70' : r.warnings.length > 0 && 'bg-amber-50/60')}>
                      <td className="r num text-stone-400">{r.row}</td>
                      <td>
                        {r.product ? (
                          <div><span className="font-medium">{pick(r.product.name, r.product.name_ur)}</span> <span className="num text-brand-800">· {label(r.product)}</span>
                            {r.product.company_name && <div className="text-xs text-stone-500">{r.product.company_name}</div>}</div>
                        ) : r.create ? (
                          <div><span className="font-medium">{r.create.name}</span> <span className="num text-brand-800">· {fmtPack(r.create.size, r.create.unit, lang)}</span>{' '}
                            <Badge tone="blue">{t('impNew')}</Badge>
                            {r.create.company && <div className="text-xs text-stone-500">{r.create.company}</div>}</div>
                        ) : (
                          <div className="text-red-700">{r.productText || '—'} {r.sizeText && <span className="num">· {r.sizeText}</span>}</div>
                        )}
                      </td>
                      <td className="num">{r.batch_no}</td>
                      <td className="num whitespace-nowrap">{fmtDate(r.mfg_date, lang)}</td>
                      <td className="num whitespace-nowrap">{fmtDate(r.expiry_date, lang)}</td>
                      <td className="r num font-medium">{r.qty != null ? fmtNum(r.qty, 3) : ''}</td>
                      <td className="r num">{r.rate != null ? fmtMoney(r.rate, lang) : ''}</td>
                      <td className="r num">{r.qty && r.rate ? fmtMoney(r2(r.qty * r.rate), lang) : ''}</td>
                      <td className="min-w-48 text-xs">
                        {r.errors.length ? <span className="text-red-700">{issueText(r)}</span>
                          : r.warnings.length ? <span className="text-amber-800">{issueText(r)}</span>
                          : <span className="text-brand-700">✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            {isPurchase && total > 0 && (
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-stone-50 p-3">
                  <div className="text-sm text-stone-500">{t('grandTotal')}</div>
                  <div className="num text-xl font-bold">{fmtMoney(total, lang)}</div>
                </div>
                <div>
                  <Field label={t('paidNow')} hint={partyId ? t('paidHintKhata') : undefined}>
                    <Input type="number" min="0" step="any" inputMode="decimal" placeholder={partyId ? '0' : String(total)} value={paid} onChange={(e) => setPaid(e.target.value)} />
                  </Field>
                  {partyId && (
                <Segmented
                  className="mt-2"
                  value={paidNum === total ? 'full' : paidNum === 0 ? 'credit' : ''}
                  onChange={(v) => setPaid(v === 'full' ? String(total) : '0')}
                  items={[{ value: 'full', label: t('fullPayment') }, { value: 'credit', label: t('onCredit'), tone: 'amber' }]}
                />
              )}
                </div>
                <div className={cx('rounded-lg p-3', due > 0 ? 'bg-amber-50' : 'bg-stone-50')}>
                  <div className="text-sm text-stone-500">{t('balanceDue')}</div>
                  <div className={cx('num text-xl font-bold', due > 0 && 'text-amber-800')}>{fmtMoney(due, lang)}</div>
                  {due > 0 && !partyId && <div className="text-xs text-red-600">{t('errCreditNeedsParty')}</div>}
                </div>
              </div>
            )}
            {!isPurchase && total > 0 && (
              <p className="mb-3 text-sm text-stone-600">{t('stockValue')}: <b className="num">{fmtMoney(total, lang)}</b></p>
            )}
            <Field label={t('note')} optional>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {saveError && <div className="mt-3"><ErrorBox>{saveError}</ErrorBox></div>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="lg" onClick={save} loading={busy} disabled={!ok.length}>
                <CheckCircle2 className="size-5" /> {t('impSaveBtn', { n: ok.length })}
              </Button>
              <Button size="lg" variant="ghost" onClick={() => { setCells(null); setFileName('') }}><X className="size-4" /> {t('cancel')}</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
