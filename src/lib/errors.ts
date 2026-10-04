import type { TFn, TKey } from './i18n'

const MAP: [RegExp, TKey][] = [
  [/INSUFFICIENT_STOCK/, 'errInsufficient'],
  [/BATCH_EXPIRY_MISMATCH/, 'errBatchExpiry'],
  [/INVALID_DATE/, 'errInvalidDate'],
  [/NOT_ALLOWED|row-level security|permission denied/i, 'errNotAllowed'],
  [/INVALID_INVITE/, 'errInvalidInvite'],
  [/INVITE_EMAIL_MISMATCH/, 'errInviteEmail'],
  [/ALREADY_IN_ORG|memberships_one_org_per_user/, 'errAlreadyInOrg'],
  [/ALREADY_MEMBER/, 'errAlreadyMember'],
  [/EXPIRY_REQUIRED/, 'errExpiryRequired'],
  [/INVALID_QTY/, 'errQty'],
  [/CREDIT_NEEDS_PARTY/, 'errCreditNeedsParty'],
  [/INVALID_PAID/, 'errInvalidPaid'],
  [/INVALID_DISCOUNT/, 'errInvalidDiscount'],
  [/INVALID_PRICE/, 'errInvalidPrice'],
  [/INVALID_AMOUNT/, 'errInvalidAmount'],
  [/INVALID_PARTY/, 'errInvalidParty'],
  [/PASSWORD_TOO_SHORT|weak_password|Password should be at least/i, 'passwordMin'],
  [/USE_PROFILE/, 'errUseProfile'],
  [/CANNOT_REMOVE_SELF/, 'errCannotRemoveSelf'],
  [/same_password|should be different from the old/i, 'errSamePassword'],
  [/products_unique_variant/, 'errDuplicateProduct'],
  [/duplicate key|already exists/i, 'errDuplicate'],
  [/foreign key|violates.*constraint.*fkey|is still referenced/i, 'errInUse'],
  [/Email logins are disabled|Email signups are disabled|email_provider_disabled/i, 'errEmailLoginOff'],
  [/rate limit|over_email_send_rate_limit|security purposes/i, 'errEmailRateLimit'],
  [/Invalid login credentials/i, 'errInvalidLogin'],
  [/Email not confirmed/i, 'errEmailNotConfirmed'],
  [/User already registered|already been registered/i, 'errUserExists'],
]

/** Turn a Supabase / Postgres error into a friendly, translated message. */
export function errText(e: unknown, t: TFn): string {
  const msg =
    typeof e === 'string' ? e : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
  const details = e && typeof e === 'object' && 'details' in e ? String((e as { details: unknown }).details ?? '') : ''
  const all = `${msg} ${details}`
  for (const [re, key] of MAP) if (re.test(all)) return t(key)
  if (/Failed to fetch|NetworkError/i.test(all)) return 'Network error. Check your internet connection.'
  return msg || t('errGeneric')
}
