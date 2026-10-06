/**
 * The app sends no emails unless this is turned on (VITE_EMAILS_ENABLED=true in .env).
 * Turn it on only after custom SMTP is set up in Supabase, otherwise the
 * built-in sender's hourly limit makes sign-up / reset emails fail.
 */
export const EMAILS_ENABLED = import.meta.env.VITE_EMAILS_ENABLED === 'true'

/**
 * WhatsApp number for the landing page contact buttons (VITE_CONTACT_WHATSAPP in .env),
 * digits only with country code, e.g. 923001234567. Empty = WhatsApp buttons are hidden.
 */
export const CONTACT_WHATSAPP = String(import.meta.env.VITE_CONTACT_WHATSAPP ?? '').replace(/\D/g, '')

/** Display form of the WhatsApp number, e.g. 92XXXXXXXXXX -> +92 XXX XXXXXXX */
export const CONTACT_WHATSAPP_DISPLAY =
  CONTACT_WHATSAPP.startsWith('92') && CONTACT_WHATSAPP.length === 12
    ? `+92 ${CONTACT_WHATSAPP.slice(2, 5)} ${CONTACT_WHATSAPP.slice(5)}`
    : CONTACT_WHATSAPP && `+${CONTACT_WHATSAPP}`
