import { X, Loader2, AlertTriangle, CheckCircle2, Info, Eye, EyeOff } from 'lucide-react'
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from 'react'
import { cx } from '../lib/cx'
import { useI18n } from '../lib/i18n'


type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning' | 'light' | 'outlineLight'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-stone-800 border border-stone-300 hover:bg-stone-50 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-500 shadow-sm',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm',
  ghost: 'text-stone-600 hover:bg-stone-100',
  // for dark / colored backgrounds
  light: 'bg-white text-[#166534] shadow-sm hover:bg-[#dcfce7] hover:text-[#14532d]',
  outlineLight: 'text-white ring-1 ring-inset ring-white/50 hover:bg-white hover:text-[#166534]',
}

export function Button({
  variant = 'primary', size = 'md', loading, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

const fieldCls =
  'w-full h-10 rounded-lg border border-stone-300 bg-surface px-3 text-sm text-stone-900 placeholder:text-stone-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 disabled:bg-stone-100 disabled:text-stone-500'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(fieldCls, rest.type === 'number' && 'num', className)} />
}

/** Password field with a show / hide (eye) toggle */
export function PasswordInput({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  return (
    // passwords are always Latin text, so keep the field LTR even in Urdu mode
    <div className="relative" dir="ltr">
      <input {...rest} type={show ? 'text' : 'password'} className={cx(fieldCls, 'pr-11', className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-e-lg text-stone-400 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-brand-600 cursor-pointer"
        aria-label={show ? t('hidePassword') : t('showPassword')}
        title={show ? t('hidePassword') : t('showPassword')}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(fieldCls, 'h-auto py-2 min-h-16', className)} />
}

export { Select } from './Select'

export function Field({
  label, hint, error, children, className, required,
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-stone-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-stone-200 bg-surface shadow-sm', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <h2 className="font-semibold text-stone-800">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

type Tone = 'red' | 'amber' | 'green' | 'stone' | 'blue' | 'orange'
const TONES: Record<Tone, string> = {
  red: 'bg-red-100 text-red-800 ring-red-200',
  amber: 'bg-amber-100 text-amber-900 ring-amber-200',
  green: 'bg-brand-100 text-brand-800 ring-brand-200',
  stone: 'bg-stone-100 text-stone-700 ring-stone-200',
  blue: 'bg-sky-100 text-sky-800 ring-sky-200',
  orange: 'bg-orange-100 text-orange-800 ring-orange-200',
}
export function Badge({ tone = 'stone', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-700', className)} />
}

export function Loading() {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-stone-500">
      <Spinner /> {t('loading')}
    </div>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-sm text-stone-500">
      {icon}
      {children}
    </div>
  )
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onRetry && (
        <button className="font-medium underline" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors cursor-pointer',
            value === it.value ? 'bg-primary text-white shadow-sm' : 'bg-surface text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-stone-700">
      <input type="checkbox" className="size-4 accent-brand-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

// ---------------------------------------------------------------- Modal
export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null)
  // keep the latest onClose without re-running the open effect (inline handlers change every render)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // focus the first field only when the modal opens, unless a field already has focus
    if (!ref.current?.contains(document.activeElement)) ref.current?.querySelector<HTMLElement>('input:not([disabled]),select,textarea')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 cursor-pointer" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Toasts & confirm
interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }
interface ConfirmReq { text: string; danger?: boolean; resolve: (v: boolean) => void }
interface Feedback {
  toast: (text: string, kind?: Toast['kind']) => void
  confirm: (text: string, danger?: boolean) => Promise<boolean>
}
const FeedbackCtx = createContext<Feedback | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [req, setReq] = useState<ConfirmReq | null>(null)

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { id, kind, text }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 3000)
  }, [])
  const confirm = useCallback((text: string, danger = true) => new Promise<boolean>((resolve) => setReq({ text, danger, resolve })), [])
  const answer = (v: boolean) => {
    req?.resolve(v)
    setReq(null)
  }

  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg',
              x.kind === 'ok' && 'bg-primary text-white',
              x.kind === 'err' && 'bg-red-600 text-white',
              x.kind === 'info' && 'bg-neutral-800 text-white',
            )}
          >
            {x.kind === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : x.kind === 'err' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
            {x.text}
          </div>
        ))}
      </div>
      <Modal
        open={!!req}
        onClose={() => answer(false)}
        title={t('confirm')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => answer(false)}>{t('cancel')}</Button>
            <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>{t('yes')}</Button>
          </>
        }
      >
        <p className="text-stone-700">{req?.text}</p>
      </Modal>
    </FeedbackCtx.Provider>
  )
}

export function useFeedback() {
  const v = useContext(FeedbackCtx)
  if (!v) throw new Error('useFeedback outside provider')
  return v
}
