/** Standard note at the bottom of every receipt (always Urdu). A shop can change it in Settings. */
export const DEFAULT_RECEIPT_NOTE =
  'چونکہ زرعی ادویات اور بیج کا کھیت میں استعمال ہماری نگرانی اور دسترس سے باہر ہے اس لیے ہم کسی بھی نقصان کے ذمہ دار نہ ہوں گے۔ ' +
  'نیز بیج اور زرعی ادویات خریدتے وقت تسلی کر لیں کہ مال صحیح اور تازہ سیل بند ہے کیونکہ ہم آپ کی بہتر خدمت کرتے ہیں۔'

/** the note to print: the shop's own, or the standard one */
export const receiptNoteOf = (org: { receipt_note?: string | null }) => org.receipt_note?.trim() || DEFAULT_RECEIPT_NOTE
