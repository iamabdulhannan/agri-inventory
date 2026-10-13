/* Translations for the sale screens (merged into src/lib/i18n.tsx). Keep keys unique across parts. */
export const saleEn = {
  // rate mode (khata customers)
  saleRateLabel: 'Rate',
  saleRateCash: 'Cash rate',
  saleRateCredit: 'Credit rate',
  saleNoCreditRate: '{n} item(s) have no credit rate yet, so the cash rate is used.',
  // markup on a credit bill
  saleMarkupPct: 'Markup %',
  saleMarkup: 'Markup',
  saleMarkupHint: 'Optional: % added to a credit bill',
  // crop advance
  saleCropAdvance: 'Crop advance',
  saleLeft: '{amount} left',
  salePayFromAdvance: 'Pay from advance',
  saleAdvanceAmount: 'From advance',
  salePaidFromAdvance: 'Paid from crop advance',
  // money in / out
  saleReceivedInto: 'Received into',
  salePaidFrom: 'Paid from',
  // promised payment date
  salePayBy: 'Pay by',
  saleDueOn: 'Due {date}',
  saleOverdueDays: '{n} days late',
  // product form
  saleCreditRateHint: 'Optional udhaar price per pack',
}

export const saleUr: Record<keyof typeof saleEn, string> = {
  saleRateLabel: 'ریٹ',
  saleRateCash: 'نقد ریٹ',
  saleRateCredit: 'ادھار ریٹ',
  saleNoCreditRate: '{n} آئٹمز کا ادھار ریٹ درج نہیں، اس لیے نقد ریٹ لگا ہے۔',
  saleMarkupPct: 'اضافہ %',
  saleMarkup: 'ادھار اضافہ',
  saleMarkupHint: 'اختیاری: ادھار بل پر اضافی فیصد',
  saleCropAdvance: 'فصل ایڈوانس',
  saleLeft: '{amount} باقی',
  salePayFromAdvance: 'ایڈوانس سے ادائیگی',
  saleAdvanceAmount: 'ایڈوانس سے رقم',
  salePaidFromAdvance: 'فصل ایڈوانس سے ادا',
  saleReceivedInto: 'رقم کہاں آئی',
  salePaidFrom: 'رقم کہاں سے دی',
  salePayBy: 'ادائیگی کی تاریخ',
  saleDueOn: 'ادائیگی {date}',
  saleOverdueDays: '{n} دن لیٹ',
  saleCreditRateHint: 'فی پیک ادھار قیمت (اختیاری)',
}
