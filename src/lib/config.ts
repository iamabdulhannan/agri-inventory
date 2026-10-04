/**
 * The app sends no emails unless this is turned on (VITE_EMAILS_ENABLED=true in .env).
 * Turn it on only after custom SMTP is set up in Supabase, otherwise the
 * built-in sender's hourly limit makes sign-up / reset emails fail.
 */
export const EMAILS_ENABLED = import.meta.env.VITE_EMAILS_ENABLED === 'true'
