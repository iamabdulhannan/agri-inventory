/* Translations for the sale screens (merged into src/lib/i18n.tsx). Keep keys unique across parts. */
export const saleEn = {
  crTitle: 'Correct rates · Invoice #{n}', crTitleShort: 'Correct rates', crAction: 'Correct rates', crWas: 'was',
  crOldTotal: 'Total before', crNewTotal: 'Corrected total',
  crCollect: 'Collect {amount} more from the customer (cash book updates).',
  crGiveBack: 'Give back {amount} to the customer (cash book updates).',
  crKhataUp: '{name}\'s khata goes up by {amount}.', crKhataDown: '{name}\'s khata goes down by {amount}.',
  crHint: 'Stock does not change. Totals, khata or cash, profit and reports update, and the change is kept in the audit trail.',
  crConfirm: 'Change invoice #{n} from {from} to {to}?', crSaved: 'Invoice #{n} corrected',
  errSaleHasReturns: 'Goods from this invoice were returned, so its rates can no longer be changed.',
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
  crTitle: 'ریٹ درست کریں · بل نمبر {n}', crTitleShort: 'ریٹ درست کریں', crAction: 'ریٹ درست کریں', crWas: 'پہلے',
  crOldTotal: 'پہلے کل', crNewTotal: 'درست کل',
  crCollect: 'گاہک سے {amount} مزید لیں (روزنامچہ اپ ڈیٹ ہو گا)۔',
  crGiveBack: 'گاہک کو {amount} واپس کریں (روزنامچہ اپ ڈیٹ ہو گا)۔',
  crKhataUp: '{name} کا کھاتہ {amount} بڑھ جائے گا۔', crKhataDown: '{name} کا کھاتہ {amount} کم ہو جائے گا۔',
  crHint: 'اسٹاک تبدیل نہیں ہو گا۔ کل رقم، کھاتہ یا نقد، منافع اور رپورٹس اپ ڈیٹ ہوں گی، اور تبدیلی آڈٹ ریکارڈ میں رہے گی۔',
  crConfirm: 'بل نمبر {n} کو {from} سے {to} کر دیں؟', crSaved: 'بل نمبر {n} درست ہو گیا',
  errSaleHasReturns: 'اس بل کا مال واپس ہو چکا ہے، اس لیے اب اس کے ریٹ تبدیل نہیں ہو سکتے۔',
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
