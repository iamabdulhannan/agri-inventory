import { createClient } from '@supabase/supabase-js'
import { makeOfflineFetch } from './offline/cacheFetch'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'))

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  // data reads are kept on the device and used when there is no internet
  global: { fetch: makeOfflineFetch((...a) => fetch(...a)) },
})
