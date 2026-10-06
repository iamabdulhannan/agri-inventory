/**
 * Public landing page (logged-out visitors). Rendered by AuthPage, which owns the auth modal.
 *
 * Screenshots live in public/landing/ (swap a file and keep its name, or change SHOTS below):
 *   hero.jpg         1600x524   dark-mode dashboard: header, expiry card, quick buttons
 *   stock-in.jpg     1600x904   Stock In form (batch, mfg, expiry)
 *   sale.jpg         1600x912   New Sale form (discount, received, balance to khata)
 *   roznamcha.jpg    1600x533   Roznamcha table rows only
 *   reports.jpg      1600x1000  Daily stock report
 *   filters.jpg       830x900   Products list with the Filters panel
 *   bulk-import.jpg  1400x700   Bulk stock in (template + upload)
 *   urdu.jpg         1600x1000  Daily report in Urdu (RTL)
 *   mobile.jpg        573x1100  Reports on a phone
 *
 * Text: src/lib/landingText.ts (English + Urdu). WhatsApp number: VITE_CONTACT_WHATSAPP.
 */
import {
  ArrowRight, BarChart3, Building2, CalendarClock, CheckCircle2, ChevronDown, FileSpreadsheet, History, Languages,
  ListFilter, MessageCircle, MonitorSmartphone, Moon, NotebookPen, Package, PencilLine, ReceiptText, Scale,
  UserPlus, Users, type LucideIcon,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { LangToggle, Logo, ThemeToggle } from '../components/Layout'
import { Button } from '../components/ui'
import { CONTACT_WHATSAPP, CONTACT_WHATSAPP_DISPLAY } from '../lib/config'
import { cx } from '../lib/cx'
import { useI18n } from '../lib/i18n'
import { landingEn, landingUr, type LandingKey } from '../lib/landingText'
import { supabaseConfigured } from '../lib/supabase'

export type LandingAction = 'create' | 'join' | 'signin'

type Shot = { src: string; w: number; h: number }
const SHOTS = {
  hero: { src: '/landing/hero.jpg', w: 1600, h: 524 },
  stockIn: { src: '/landing/stock-in.jpg', w: 1600, h: 904 },
  sale: { src: '/landing/sale.jpg', w: 1600, h: 912 },
  roznamcha: { src: '/landing/roznamcha.jpg', w: 1600, h: 533 },
  reports: { src: '/landing/reports.jpg', w: 1600, h: 1000 },
  filters: { src: '/landing/filters.jpg', w: 830, h: 900 },
  bulkImport: { src: '/landing/bulk-import.jpg', w: 1400, h: 700 },
  urdu: { src: '/landing/urdu.jpg', w: 1600, h: 1000 },
  mobile: { src: '/landing/mobile.jpg', w: 573, h: 1100 },
} satisfies Record<string, Shot>

const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600'
// fixed colours for the deep green bands (brand-* tokens are remapped in dark mode)
const GREEN_BG = 'bg-gradient-to-br from-[#14532d] via-[#166534] to-emerald-700'

function useLandingText() {
  const { lang } = useI18n()
  const dict = lang === 'ur' ? landingUr : landingEn
  return (k: LandingKey) => dict[k]
}

export function Landing({ onAction }: { onAction: (mode: LandingAction) => void }) {
  const { t } = useI18n()
  const L = useLandingText()
  const waHref = CONTACT_WHATSAPP ? `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(L('waGreeting'))}` : ''

  // smooth anchor scrolling while the landing page is shown (skipped for reduced motion)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const html = document.documentElement
    html.style.scrollBehavior = 'smooth'
    return () => {
      html.style.scrollBehavior = ''
    }
  }, [])

  const nav = [
    { href: '#features', label: L('navFeatures') },
    { href: '#how', label: L('navHow') },
    { href: '#faq', label: L('navFaq') },
  ]

  return (
    // Nastaliq needs more line height than the text-* utilities give (h1/h2 are handled in index.css)
    <div className="min-h-screen bg-page text-stone-900 rtl:[&_:is(p,h3,li,summary)]:leading-[1.95]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-medium focus:shadow-lg"
      >
        {L('skip')}
      </a>

      {/* 1. Sticky header */}
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
        <div className={cx(CONTAINER, 'flex h-16 items-center justify-between gap-3')}>
          <a href="#top" className={cx('shrink-0 rounded-lg', FOCUS)}>
            <Logo />
          </a>
          <nav aria-label={L('menuLabel')} className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className={cx('rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900', FOCUS)}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            <LangToggle />
            <Button size="sm" variant="primary" className="sm:h-9 sm:px-4 sm:text-sm" onClick={() => onAction('signin')}>
              {t('signIn')}
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* 2. Hero */}
        <section id="top" className="relative isolate overflow-hidden">
          <div className={cx('absolute inset-x-0 top-0 -z-10 h-[calc(100%-3rem)] sm:h-[calc(100%-7rem)] lg:h-[calc(100%-10rem)]', GREEN_BG)}>
            <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
            <div aria-hidden className="absolute -top-40 start-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-emerald-300/20 blur-3xl rtl:translate-x-1/2" />
          </div>

          <div className={cx(CONTAINER, 'pt-14 pb-0 text-center sm:pt-20')}>
            <div className="mx-auto max-w-3xl text-white motion-safe:animate-rise">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-sm font-medium text-[#dcfce7] ring-1 ring-white/20">
                <span className="size-1.5 rounded-full bg-[#86efac]" aria-hidden />
                {L('heroEyebrow')}
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
                {t('landingTitle')}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-white/85">{t('landingText')}</p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" variant="light" onClick={() => onAction('create')}>
                  <Building2 className="size-5" /> {t('createOrgBtn')}
                </Button>
                <Button size="lg" variant="outlineLight" onClick={() => onAction('join')}>
                  <UserPlus className="size-5" /> {t('joinOrg')}
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/85">
                {(['trust1', 'trust2', 'trust3', 'trust4'] as const).map((k) => (
                  <li key={k} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-[#86efac]" aria-hidden />
                    {L(k)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mx-auto mt-12 max-w-5xl motion-safe:animate-rise sm:mt-16 [animation-delay:120ms]">
              <BrowserFrame shot={SHOTS.hero} alt={L('heroAlt')} tone="dark" eager className="shadow-2xl shadow-black/30" />
            </div>
          </div>
        </section>

        {/* 3. Feature rows */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="features-title">
          <div className={CONTAINER}>
            <SectionHead id="features-title" kicker={L('featuresKicker')} title={L('featuresTitle')} text={L('featuresText')} />

            <div className="mt-16 space-y-20 sm:mt-20 lg:space-y-28">
              <FeatureRow
                icon={CalendarClock}
                eyebrow={L('f1Eyebrow')}
                title={L('f1Title')}
                text={L('f1Text')}
                bullets={[L('f1b1'), L('f1b2'), L('f1b3')]}
                shot={SHOTS.stockIn}
                alt={L('f1Alt')}
              />
              <FeatureRow
                reverse
                icon={ReceiptText}
                eyebrow={L('f2Eyebrow')}
                title={L('f2Title')}
                text={L('f2Text')}
                bullets={[L('f2b1'), L('f2b2'), L('f2b3')]}
                shot={SHOTS.sale}
                alt={L('f2Alt')}
              />
              <FeatureRow
                icon={NotebookPen}
                eyebrow={L('f3Eyebrow')}
                title={L('f3Title')}
                text={L('f3Text')}
                bullets={[L('f3b1'), L('f3b2'), L('f3b3')]}
                shot={SHOTS.roznamcha}
                alt={L('f3Alt')}
              />
              <FeatureRow
                reverse
                icon={BarChart3}
                eyebrow={L('f4Eyebrow')}
                title={L('f4Title')}
                text={L('f4Text')}
                bullets={[L('f4b1'), L('f4b2'), L('f4b3')]}
                shot={SHOTS.reports}
                alt={L('f4Alt')}
              />
            </div>
          </div>
        </section>

        {/* 3b. More features */}
        <section className="border-y border-stone-200 bg-surface py-20 sm:py-28" aria-labelledby="more-title">
          <div className={CONTAINER}>
            <SectionHead id="more-title" kicker={L('moreKicker')} title={L('moreTitle')} />

            <div className="mt-14 grid gap-6 md:grid-cols-2">
              <ImageCard icon={ListFilter} title={L('filtersTitle')} text={L('filtersText')} shot={SHOTS.filters} alt={L('filtersAlt')} position="object-[100%_0%]" />
              <ImageCard icon={FileSpreadsheet} title={L('importTitle')} text={L('importText')} shot={SHOTS.bulkImport} alt={L('importAlt')} position="object-top" />
            </div>

            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  [Package, 'g1Title', 'g1Text'],
                  [Scale, 'g2Title', 'g2Text'],
                  [Languages, 'g3Title', 'g3Text'],
                  [MonitorSmartphone, 'g4Title', 'g4Text'],
                  [Moon, 'g5Title', 'g5Text'],
                  [Users, 'g6Title', 'g6Text'],
                  [PencilLine, 'g7Title', 'g7Text'],
                  [History, 'g8Title', 'g8Text'],
                ] as const
              ).map(([Icon, title, text]) => (
                <li key={title} className="rounded-2xl border border-stone-200 bg-page/60 p-5 transition-colors hover:border-brand-200 hover:bg-brand-50/50">
                  <IconBadge icon={Icon} />
                  <h3 className="mt-4 font-semibold text-stone-900">{L(title)}</h3>
                  <p className="mt-1 text-sm text-stone-600">{L(text)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Urdu + mobile band */}
        <section className="py-20 sm:py-28" aria-labelledby="urdu-title">
          <div className={CONTAINER}>
            <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-brand-50 to-surface p-6 ring-1 ring-brand-100 sm:p-10 lg:p-14">
              <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end">
                <div>
                  <Kicker>{L('urduKicker')}</Kicker>
                  <h2 id="urdu-title" className="mt-3 text-3xl font-bold tracking-tight text-balance text-stone-900 sm:text-4xl">
                    {L('urduTitle')}
                  </h2>
                  <p className="mt-4 text-lg text-stone-600">{L('urduText')}</p>
                </div>
                <CheckList items={[L('urduB1'), L('urduB2'), L('urduB3')]} />
              </div>

              <div className="mt-10 grid items-end gap-6 sm:mt-14 md:grid-cols-[1fr_auto] md:gap-8">
                <BrowserFrame shot={SHOTS.urdu} alt={L('urduAlt')} className="shadow-xl shadow-black/10" />
                <PhoneFrame shot={SHOTS.mobile} alt={L('mobileAlt')} />
              </div>
            </div>
          </div>
        </section>

        {/* 5. How it works */}
        <section id="how" className="scroll-mt-20 border-y border-stone-200 bg-surface py-20 sm:py-28" aria-labelledby="how-title">
          <div className={CONTAINER}>
            <SectionHead id="how-title" kicker={L('howKicker')} title={L('howTitle')} />
            <div className="relative mt-14">
              <div aria-hidden className="absolute inset-x-[16%] top-7 hidden border-t-2 border-dashed border-stone-200 md:block" />
              <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
              {(
                [
                  ['s1Title', 's1Text'],
                  ['s2Title', 's2Text'],
                  ['s3Title', 's3Text'],
                ] as const
              ).map(([title, text], i) => (
                <li key={title} className="relative text-center">
                  <span className="relative mx-auto grid size-14 place-items-center rounded-full bg-primary text-xl font-bold text-white shadow-md ring-8 ring-surface num">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-stone-900">{L(title)}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-stone-600">{L(text)}</p>
                </li>
              ))}
            </ol>
            </div>
            <div className="mt-12 flex justify-center">
              <Button size="lg" onClick={() => onAction('create')}>
                {t('createOrgBtn')} <ArrowRight className="size-5 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </section>

        {/* 6. FAQ */}
        <section id="faq" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="faq-title">
          <div className={cx(CONTAINER, 'grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16')}>
            <div>
              <Kicker>{L('faqKicker')}</Kicker>
              <h2 id="faq-title" className="mt-3 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
                {L('faqTitle')}
              </h2>
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cx('mt-6 inline-flex items-center gap-2 rounded-lg font-medium text-brand-700 hover:underline', FOCUS)}
                >
                  <MessageCircle className="size-5" /> {L('whatsapp')}
                </a>
              )}
            </div>
            <div className="space-y-3">
              {(['1', '2', '3', '4', '5', '6', '7'] as const).map((n) => (
                <details key={n} className="group rounded-xl border border-stone-200 bg-surface shadow-sm open:shadow-md">
                  <summary
                    className={cx(
                      'flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 font-semibold text-stone-900 [&::-webkit-details-marker]:hidden',
                      FOCUS,
                    )}
                  >
                    {L(`q${n}`)}
                    <ChevronDown className="size-5 shrink-0 text-stone-500 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-5 pb-5 text-stone-600">{L(`a${n}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Final CTA */}
        <section className="pb-20 sm:pb-28" aria-labelledby="cta-title">
          <div className={CONTAINER}>
            <div className={cx('relative isolate overflow-hidden rounded-3xl px-6 py-14 text-center text-white sm:px-12 sm:py-20', GREEN_BG)}>
              <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
              <div aria-hidden className="absolute -bottom-32 -end-24 -z-10 size-96 rounded-full bg-emerald-300/20 blur-3xl" />
              <h2 id="cta-title" className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {L('ctaTitle')}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">{L('ctaText')}</p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" variant="light" onClick={() => onAction('create')}>
                  <Building2 className="size-5" /> {t('createOrgBtn')}
                </Button>
                {waHref ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-semibold whitespace-nowrap text-white ring-1 ring-inset ring-white/50 transition-colors hover:bg-white hover:text-[#166534] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <MessageCircle className="size-5" /> {L('whatsapp')}
                  </a>
                ) : (
                  <Button size="lg" variant="outlineLight" onClick={() => onAction('join')}>
                    <UserPlus className="size-5" /> {t('joinOrg')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 8. Footer */}
      <footer className="border-t border-stone-200 bg-surface">
        <div className={cx(CONTAINER, 'flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between')}>
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm text-stone-600">{L('footerText')}</p>
            {waHref && (
              <p className="mt-4 text-sm text-stone-600">
                <span className="font-medium text-stone-800">{L('contact')}:</span>{' '}
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cx('inline-flex items-center gap-1.5 rounded font-medium text-brand-700 hover:underline', FOCUS)}
                >
                  <MessageCircle className="size-4" aria-hidden />
                  <span dir="ltr" className="num">{CONTACT_WHATSAPP_DISPLAY}</span>
                </a>
              </p>
            )}
          </div>
          <nav aria-label={L('menuLabel')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className={cx('rounded font-medium text-stone-600 hover:text-stone-900', FOCUS)}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>
        <div className="border-t border-stone-200">
          <p className={cx(CONTAINER, 'py-6 pe-20 text-sm text-stone-500 sm:pe-6')}>
            © <span className="num">{new Date().getFullYear()}</span> Agri Inventory. {L('rights')}
          </p>
        </div>
      </footer>

      {/* 9. Floating WhatsApp */}
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={L('whatsappFloat')}
          title={L('whatsappFloat')}
          className={cx(
            'fixed end-4 z-30 grid size-12 place-items-center sm:end-5 sm:size-14 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#128C7E] motion-reduce:transition-none',
            supabaseConfigured ? 'bottom-4 sm:bottom-5' : 'bottom-16',
          )}
        >
          <MessageCircle className="size-6 sm:size-7" aria-hidden />
        </a>
      )}
    </div>
  )
}

/* ---------- building blocks ---------- */

function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold tracking-wide text-brand-700">{children}</p>
}

function SectionHead({ id, kicker, title, text }: { id: string; kicker: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Kicker>{kicker}</Kicker>
      <h2 id={id} className="mt-3 text-3xl font-bold tracking-tight text-balance text-stone-900 sm:text-4xl">
        {title}
      </h2>
      {text && <p className="mt-4 text-lg text-pretty text-stone-600">{text}</p>}
    </div>
  )
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
      <Icon className="size-5" aria-hidden />
    </span>
  )
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b} className="flex items-start gap-3 text-stone-700">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  )
}

function BrowserFrame({
  shot, alt, tone = 'light', eager, className,
}: { shot: Shot; alt: string; tone?: 'light' | 'dark'; eager?: boolean; className?: string }) {
  const dark = tone === 'dark'
  return (
    <figure
      className={cx(
        'overflow-hidden rounded-xl ring-1',
        dark ? 'bg-[#1a1d1a] ring-white/15' : 'bg-surface ring-stone-200',
        className,
      )}
    >
      <div
        dir="ltr"
        className={cx('flex items-center gap-1.5 border-b px-3.5 py-2.5', dark ? 'border-white/10 bg-[#222622]' : 'border-stone-200 bg-stone-50')}
        aria-hidden
      >
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
      </div>
      <img
        src={shot.src}
        width={shot.w}
        height={shot.h}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        className="block h-auto w-full"
      />
    </figure>
  )
}

function PhoneFrame({ shot, alt }: { shot: Shot; alt: string }) {
  return (
    <div className="mx-auto w-52 shrink-0 rounded-[2.25rem] bg-[#141614] p-2 shadow-xl shadow-black/20 ring-1 ring-black/10 sm:w-60 dark:ring-white/10">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-white">
        <span aria-hidden className="absolute top-2 left-1/2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-[#141614]" />
        <img src={shot.src} width={shot.w} height={shot.h} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full pt-5" />
      </div>
    </div>
  )
}

function FeatureRow({
  icon, eyebrow, title, text, bullets, shot, alt, reverse,
}: { icon: LucideIcon; eyebrow: string; title: string; text: string; bullets: string[]; shot: Shot; alt: string; reverse?: boolean }) {
  const Icon = icon
  return (
    <article className={cx('grid items-center gap-10 lg:gap-16', reverse ? 'lg:grid-cols-[7fr_5fr]' : 'lg:grid-cols-[5fr_7fr]')}>
      <div className={cx(reverse && 'lg:order-last')}>
        <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 ring-1 ring-brand-100">
          <Icon className="size-4" aria-hidden />
          {eyebrow}
        </p>
        <h3 className="mt-4 text-2xl font-bold tracking-tight text-balance text-stone-900 sm:text-3xl">{title}</h3>
        <p className="mt-4 text-lg text-stone-600">{text}</p>
        <div className="mt-6">
          <CheckList items={bullets} />
        </div>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 p-3 ring-1 ring-brand-100 sm:p-6">
        <BrowserFrame shot={shot} alt={alt} className="shadow-lg shadow-black/10" />
      </div>
    </article>
  )
}

function ImageCard({
  icon, title, text, shot, alt, position,
}: { icon: LucideIcon; title: string; text: string; shot: Shot; alt: string; position: string }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-page/60">
      <div className="p-6 sm:p-8">
        <IconBadge icon={icon} />
        <h3 className="mt-4 text-xl font-semibold text-stone-900">{title}</h3>
        <p className="mt-2 text-stone-600">{text}</p>
      </div>
      <div className="mt-auto ps-6 sm:ps-8">
        <div className="h-56 overflow-hidden rounded-ss-xl border-s border-t border-stone-200 bg-surface shadow-sm sm:h-64">
          <img src={shot.src} width={shot.w} height={shot.h} alt={alt} loading="lazy" decoding="async" className={cx('h-full w-full object-cover', position)} />
        </div>
      </div>
    </article>
  )
}
