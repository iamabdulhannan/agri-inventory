/* Translations for the khata screens (merged into src/lib/i18n.tsx). Keep keys unique across parts. */
export const khataEn = {
  khCustomDate: 'Custom date', khCustomDateHint: 'Repeats every year on this day.', khEveryDate: 'Every year on {date}', khSetDue: 'Set due date', khClearDue: 'No date',
  // ledger kinds (migration 013)
  lk_bank_paid: 'Paid by bank', lk_advance_moved: 'From crop advance',

  // tabs, summary
  khRecovery: 'Recovery', khCropAdvances: 'Crop advances', khCropHeld: 'Crop advances held',
  khOverdue: 'Overdue', khOverdueTotal: 'Overdue total', khDue30: 'Due in 30 days', khLater: 'Later', khNoDate: 'No date',
  khTotalOnKhata: 'Total on khata', khThisMonth: 'This month', khNoDues: 'Nobody owes you money right now.',
  khNoMatch: 'Nothing matches.', khBillsN: '{n} bills', khOverdueAmount: '{amount} overdue',

  // due dates
  khDaysLate: '{n} days late', khDueInDays: 'due in {n} days', khDueToday: 'due today', khDaysN: '{n} days',
  khDues: 'Unpaid bills', khDueDate: 'Due date', khOutstanding: 'Still to pay', khBill: 'Bill', khInvNo: 'Invoice #{n}',
  khOfAmount: 'of {amount}', khNothingDue: 'Nothing due. All bills are paid.',
  khUsuallyPays: 'Usually pays by', khUsuallyPaysHint: 'New credit sales get this due date automatically.',
  khDueNone: 'None', khNoDefault: 'Not set', khChange: 'Change',

  // WhatsApp reminder
  khRemind: 'WhatsApp reminder',
  khWaMsg: 'Assalam-o-Alaikum {name}. A kind reminder from {shop}: {amount} is due on your khata{due}. Please pay when convenient. Thank you.',
  khWaDue: ' (payment date {date})', khWaLate: ' (payment date was {date})',

  // payments and cheques
  khCashBank: 'Cash / Bank', khCheque: 'Cheque', khReceivedIn: 'Received in', khPaidFrom: 'Paid from',
  khChequeNo: 'Cheque no.', khChequeBank: 'Bank', khChequeDate: 'Cheque date', khPostDated: 'Post-dated',
  khReceivedOn: 'Received on', khGivenOn: 'Given on', khDepositInto: 'Will deposit in', khDecideLater: 'Decide when depositing',
  khDrawnOn: 'From our bank account', khChequeNeedsBank: 'To give a cheque, first add your bank account on the Bank page.',
  khOpenBank: 'Bank → Cheques', khChequeExplain: 'Khata changes when the cheque clears (Bank → Cheques).',
  khChequeSaved: 'Cheque saved. Khata changes when it clears.', khPendingCheques: 'Cheques not cleared yet',
  khDated: 'dated {date}', khChequesNote: 'Not in the khata yet', khAfterClear: 'Balance after they clear',

  // crop advances
  khNewAdvance: 'New crop advance', khAdvanceExplain: 'Money a farmer pays in advance for a crop. It is kept apart from his khata and sales can be paid from it.',
  khCrop: 'Crop', khSeason: 'Season', khRabi: 'Rabi', khKharif: 'Kharif', khAllCrops: 'All crops',
  khCropPotato: 'Potato', khCropWheat: 'Wheat', khCropCotton: 'Cotton', khCropRice: 'Rice', khCropMaize: 'Maize',
  khCropSugarcane: 'Sugarcane', khCropVegetables: 'Vegetables',
  khChooseCustomer: 'Choose customer', khEnterCrop: 'Enter the crop.',
  khDeposited: 'Deposited', khUsed: 'Used', khRefunded: 'Refunded', khMovedToKhata: 'Moved to khata', khLeft: 'Left', khLeftAfter: 'Left after this',
  khAddMoney: 'Add money', khRefund: 'Refund', khMoveToKhata: 'Move to khata', khClose: 'Close', khReopen: 'Reopen',
  khOpenBadge: 'Open', khClosedBadge: 'Closed', khHistory: 'History',
  khKindDeposit: 'Money in', khKindUse: 'Used in sale', khKindRefund: 'Refunded', khKindToKhata: 'Moved to khata',
  khMoveConfirm: 'Move {amount} to {name}\'s khata? It will lower what he owes.',
  khMoveExplain: 'The leftover advance is counted as a payment on his khata.',
  khRefundConfirm: 'Give {amount} back to {name}?', khRefundExplain: 'Money given back to the farmer from this advance.',
  khCloseWithMoney: '{amount} is still left in this advance. Close it anyway?',
  khDeleteAdvanceConfirm: 'Delete this crop advance?', khDeleteEntryConfirm: 'Delete this entry of {amount}? Its khata and cash book entries are corrected too.',
  khAdvanceSaved: 'Crop advance saved', khMovedToast: 'Moved to khata', khRefundToast: 'Refund saved',
  khReopened: 'Advance reopened', khClosed: 'Advance closed',
  khNoAdvances: 'No crop advances yet.', khNoAdvancesParty: 'No crop advance for this customer.',
}

export const khataUr: Record<keyof typeof khataEn, string> = {
  khCustomDate: 'اپنی تاریخ', khCustomDateHint: 'ہر سال اسی دن۔', khEveryDate: 'ہر سال {date}', khSetDue: 'ادائیگی کی تاریخ لگائیں', khClearDue: 'تاریخ ہٹائیں',
  lk_bank_paid: 'بینک نے ادا کیا', lk_advance_moved: 'فصل ایڈوانس سے',

  khRecovery: 'وصولی', khCropAdvances: 'فصل ایڈوانس', khCropHeld: 'فصل ایڈوانس (امانت)',
  khOverdue: 'تاریخ گزر گئی', khOverdueTotal: 'تاریخ گزر چکی رقم', khDue30: '30 دن میں واجب', khLater: 'بعد میں', khNoDate: 'کوئی تاریخ نہیں',
  khTotalOnKhata: 'کل کھاتہ', khThisMonth: 'اس مہینے', khNoDues: 'اس وقت کسی کے ذمے رقم نہیں۔',
  khNoMatch: 'کچھ نہیں ملا۔', khBillsN: '{n} بل', khOverdueAmount: '{amount} کی تاریخ گزر گئی',

  khDaysLate: '{n} دن دیر', khDueInDays: '{n} دن باقی', khDueToday: 'آج واجب', khDaysN: '{n} دن',
  khDues: 'بقایا بل', khDueDate: 'ادائیگی کی تاریخ', khOutstanding: 'باقی رقم', khBill: 'بل', khInvNo: 'بل نمبر {n}',
  khOfAmount: '{amount} میں سے', khNothingDue: 'کوئی رقم واجب الادا نہیں۔ سب بل ادا ہو چکے۔',
  khUsuallyPays: 'عموماً ادائیگی', khUsuallyPaysHint: 'نئی ادھار فروخت پر یہ تاریخ خود لگ جائے گی۔',
  khDueNone: 'کوئی نہیں', khNoDefault: 'مقرر نہیں', khChange: 'تبدیل کریں',

  khRemind: 'واٹس ایپ یاد دہانی',
  khWaMsg: 'السلام علیکم {name}۔ {shop} کی طرف سے یاد دہانی: آپ کے کھاتے میں {amount} واجب الادا ہیں{due}۔ مہربانی فرما کر سہولت سے ادا کر دیں۔ شکریہ',
  khWaDue: ' (ادائیگی کی تاریخ {date})', khWaLate: ' (ادائیگی کی تاریخ {date} گزر چکی ہے)',

  khCashBank: 'نقد / بینک', khCheque: 'چیک', khReceivedIn: 'کہاں وصول ہوئی', khPaidFrom: 'کہاں سے ادا کی',
  khChequeNo: 'چیک نمبر', khChequeBank: 'بینک', khChequeDate: 'چیک کی تاریخ', khPostDated: 'آگے کی تاریخ کا',
  khReceivedOn: 'وصولی کی تاریخ', khGivenOn: 'دینے کی تاریخ', khDepositInto: 'کس اکاؤنٹ میں جمع ہوگا', khDecideLater: 'جمع کرواتے وقت طے کریں',
  khDrawnOn: 'ہمارا بینک اکاؤنٹ', khChequeNeedsBank: 'چیک دینے کے لیے پہلے بینک صفحے پر اپنا بینک اکاؤنٹ شامل کریں۔',
  khOpenBank: 'بینک ← چیک', khChequeExplain: 'چیک کلیئر ہونے پر کھاتہ تبدیل ہوگا (بینک ← چیک)۔',
  khChequeSaved: 'چیک محفوظ ہو گیا۔ کلیئر ہونے پر کھاتہ تبدیل ہوگا۔', khPendingCheques: 'چیک جو ابھی کلیئر نہیں ہوئے',
  khDated: 'تاریخ {date}', khChequesNote: 'ابھی کھاتے میں شامل نہیں', khAfterClear: 'کلیئر ہونے کے بعد بقایا',

  khNewAdvance: 'نیا فصل ایڈوانس', khAdvanceExplain: 'کسان کسی فصل کے لیے جو رقم پہلے سے جمع کرواتا ہے۔ یہ کھاتے سے الگ رہتی ہے اور فروخت اس میں سے ادا ہو سکتی ہے۔',
  khCrop: 'فصل', khSeason: 'سیزن', khRabi: 'ربیع', khKharif: 'خریف', khAllCrops: 'تمام فصلیں',
  khCropPotato: 'آلو', khCropWheat: 'گندم', khCropCotton: 'کپاس', khCropRice: 'چاول', khCropMaize: 'مکئی',
  khCropSugarcane: 'گنا', khCropVegetables: 'سبزیاں',
  khChooseCustomer: 'گاہک چنیں', khEnterCrop: 'فصل لکھیں۔',
  khDeposited: 'جمع', khUsed: 'استعمال', khRefunded: 'واپس کیا', khMovedToKhata: 'کھاتے میں منتقل', khLeft: 'باقی', khLeftAfter: 'اس کے بعد باقی',
  khAddMoney: 'رقم جمع کریں', khRefund: 'واپس کریں', khMoveToKhata: 'کھاتے میں منتقل کریں', khClose: 'بند کریں', khReopen: 'دوبارہ کھولیں',
  khOpenBadge: 'کھلا', khClosedBadge: 'بند', khHistory: 'تفصیل',
  khKindDeposit: 'رقم جمع', khKindUse: 'فروخت میں استعمال', khKindRefund: 'واپس کیا', khKindToKhata: 'کھاتے میں منتقل',
  khMoveConfirm: '{amount} {name} کے کھاتے میں منتقل کریں؟ اس سے ان کے ذمے رقم کم ہو جائے گی۔',
  khMoveExplain: 'باقی ایڈوانس کھاتے میں ادائیگی شمار ہوگا۔',
  khRefundConfirm: '{amount} {name} کو واپس کریں؟', khRefundExplain: 'اس ایڈوانس میں سے کسان کو واپس دی گئی رقم۔',
  khCloseWithMoney: 'اس ایڈوانس میں ابھی {amount} باقی ہیں۔ پھر بھی بند کریں؟',
  khDeleteAdvanceConfirm: 'یہ فصل ایڈوانس حذف کریں؟', khDeleteEntryConfirm: '{amount} کا یہ اندراج حذف کریں؟ کھاتہ اور روزنامچہ بھی درست ہو جائیں گے۔',
  khAdvanceSaved: 'فصل ایڈوانس محفوظ ہو گیا', khMovedToast: 'کھاتے میں منتقل ہو گیا', khRefundToast: 'واپسی محفوظ ہو گئی',
  khReopened: 'ایڈوانس دوبارہ کھل گیا', khClosed: 'ایڈوانس بند ہو گیا',
  khNoAdvances: 'ابھی کوئی فصل ایڈوانس نہیں۔', khNoAdvancesParty: 'اس گاہک کا کوئی فصل ایڈوانس نہیں۔',
}
