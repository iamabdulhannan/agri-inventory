/**
 * Public legal pages (no login): /privacy and /delete-account.
 * Linked from the landing footer, the mobile app (ZaraiBook) and the Google Play listing.
 */
import { ArrowLeft } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo, ThemeToggle } from '../components/Layout'

const CONTACT_EMAIL = 'iamabdalhannan@gmail.com'
const UPDATED = '9 November 2026'

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    // after the language provider, which sets the app name as the title on mount
    const id = setTimeout(() => { document.title = `${title} · ZaraiBook` })
    window.scrollTo(0, 0)
    return () => clearTimeout(id)
  }, [title])
  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="border-b border-stone-200 bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> Home
        </Link>
        <article className="rounded-2xl border border-stone-200 bg-surface p-6 shadow-sm sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">{title}</h1>
          <p className="mt-2 text-sm text-stone-500">Last updated: {UPDATED}</p>
          <div className="mt-8 space-y-8 text-[15px] leading-7 text-stone-700">{children}</div>
        </article>
        <nav className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-500">
          <Link to="/privacy" className="hover:text-stone-800">Privacy policy</Link>
          <Link to="/delete-account" className="hover:text-stone-800">Delete your account</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-stone-800">{CONTACT_EMAIL}</a>
        </nav>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-stone-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 ps-6">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-700 hover:underline">{CONTACT_EMAIL}</a>

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        ZaraiBook (also available on the web as Agri Inventory) helps agricultural input shops — seeds, fertilizers and
        pesticides — keep their stock, sales invoices, customer and supplier accounts (khata), cash book (roznamcha),
        bank records and reports. This policy explains what data the app handles and how. It covers the Android and iOS
        apps and this website.
      </p>

      <Section title="Data we collect">
        <List items={[
          <><b>Account data.</b> When you create an account we store your name, email address and password. The password is stored only as a secure hash by our sign-in provider.</>,
          <><b>Business data you enter.</b> Everything you type in is stored so that you and your team can use it: shop name, address, phone, NTN/STRN, products, stock, purchases, sales invoices, customer and supplier names and phone numbers, payments, cheques, bank account names and numbers you choose to record, crop advances, investors and notes.</>,
          <><b>Data kept on your device.</b> Your sign-in session, language and theme, and a copy of recent data so the app opens quickly and keeps working when the internet is slow.</>,
        ]} />
        <p>
          We do <b>not</b> collect your location, contacts, photos, microphone, camera or advertising ID. The app has no
          ads and no third-party analytics or tracking.
        </p>
      </Section>

      <Section title="How we use the data">
        <p>
          Only to run the service for you: showing your shop's records to you and the team members you invite, printing
          and sharing the invoices you choose to share, and keeping your account secure. We do not sell, rent or share
          your data with anyone for advertising or marketing.
        </p>
      </Section>

      <Section title="Who can see your data">
        <List items={[
          <><b>You and your team.</b> Data belongs to a shop. Only members of that shop can see it, with the role you give them (owner, admin or staff).</>,
          <><b>Our service provider.</b> Data is stored with <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">Supabase</a> (database and sign-in), which processes it on our behalf under its own security and privacy terms.</>,
          <><b>People you share with.</b> When you share an invoice or statement (PDF, WhatsApp or text), it goes to the person and app you choose.</>,
          <><b>Legal reasons.</b> We may disclose data if the law requires it.</>,
        ]} />
      </Section>

      <Section title="Security">
        <p>
          Data travels over encrypted connections (HTTPS). Access in the database is limited by shop membership and role.
          No method of storage is completely secure, but we take reasonable steps to protect your data.
        </p>
      </Section>

      <Section title="Keeping and deleting data">
        <p>Your data is kept while your account is active. You can delete your account at any time:</p>
        <List items={[
          <><b>In the mobile app:</b> More → Settings → Delete account.</>,
          <><b>Without the app:</b> see <Link to="/delete-account" className="font-medium text-brand-700 hover:underline">how to delete your account</Link>.</>,
        ]} />
        <p>
          When you delete your account, your login and profile are removed. If you are the only member of a shop, that
          shop and all its records are deleted too. Shops that have other members keep their business records; entries you
          made stay, without your name. Copies in backups are erased within 30 days.
        </p>
      </Section>

      <Section title="Children">
        <p>The service is a business tool and is not intended for children under 13.</p>
      </Section>

      <Section title="Changes">
        <p>We may update this policy. The date at the top shows the latest version.</p>
      </Section>

      <Section title="Contact">
        <p>Questions or requests about your data: <Mail /></p>
      </Section>

      <section dir="rtl" lang="ur" className="rounded-xl bg-stone-50 p-5 text-stone-700" style={{ fontFamily: '"Noto Nastaliq Urdu", serif', lineHeight: 2.2 }}>
        <h2 className="mb-2 text-lg font-semibold text-stone-900">خلاصہ (اردو)</h2>
        <p>
          ہم صرف وہی معلومات رکھتے ہیں جو آپ ایپ میں درج کرتے ہیں (اکاؤنٹ، اسٹاک، بل، کھاتہ، روزنامچہ)۔ آپ کا ڈیٹا صرف آپ کی
          دکان کے ارکان دیکھ سکتے ہیں۔ ہم کوئی اشتہار یا ٹریکنگ استعمال نہیں کرتے اور ڈیٹا کسی کو فروخت نہیں کرتے۔ آپ کسی بھی
          وقت سیٹنگز میں جا کر اپنا اکاؤنٹ ختم کر سکتے ہیں۔
        </p>
      </section>
    </LegalShell>
  )
}

export function DeleteAccountPage() {
  return (
    <LegalShell title="Delete your account">
      <p>You can delete your ZaraiBook account and its data at any time.</p>

      <Section title="In the app (fastest)">
        <ol className="list-decimal space-y-2 ps-6">
          <li>Open <b>ZaraiBook</b> and sign in.</li>
          <li>Go to <b>More → Settings</b>.</li>
          <li>Scroll to <b>Delete account</b>, tap <b>Delete my account</b>, type <b>DELETE</b> and confirm.</li>
        </ol>
        <p>If you own a shop that has other team members, remove them first under <b>More → Team</b>, then delete your account.</p>
      </Section>

      <Section title="Without the app">
        <p>
          Email <Mail /> from the address you signed up with, with the subject <b>“Delete my ZaraiBook account”</b>.
          We delete it within 7 days and reply to confirm.
        </p>
      </Section>

      <Section title="What is deleted">
        <List items={[
          'Your login, name and email.',
          'If you are the only member of a shop: the shop and all of its records (products, stock, purchases, sales, khata, roznamcha, bank, investors and reports).',
        ]} />
      </Section>

      <Section title="What is kept">
        <List items={[
          'Shops that have other members keep their business records. Entries you made remain, without your name.',
          'Removed data may stay in encrypted backups for up to 30 days before it is erased.',
        ]} />
      </Section>
    </LegalShell>
  )
}
