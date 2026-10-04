import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'ur'

const en = {
  appName: 'Agri Inventory',
  tagline: 'Stock & expiry control for pesticides, fertilizers and seeds',

  // common
  save: 'Save', cancel: 'Cancel', close: 'Close', edit: 'Edit', delete: 'Delete', add: 'Add', search: 'Search…',
  loading: 'Loading…', back: 'Back', confirm: 'Confirm', print: 'Print', exportExcel: 'Excel',
  all: 'All', actions: 'Actions', optional: 'optional', saved: 'Saved', deleted: 'Deleted', today: 'Today',
  date: 'Date', from: 'From', to: 'To', month: 'Month', total: 'Total', note: 'Note', name: 'Name',
  status: 'Status', viewAll: 'View all', retry: 'Retry', yes: 'Yes', no: 'No', copy: 'Copy', copied: 'Copied!',
  collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar',
  theme: 'Theme', themeLight: 'Light mode', themeDark: 'Dark mode', themeSystem: 'Same as device',
  remove: 'Remove', you: 'you', never: 'never', packs: 'packs', create: 'Create', go: 'Go',

  // nav
  navDashboard: 'Dashboard', navProducts: 'Products', navStockIn: 'Stock In', navStockOut: 'New Sale',
  navLedger: 'Stock History', navExpiry: 'Expiry', navReports: 'Reports', navSettings: 'Settings', more: 'More',

  // auth
  signIn: 'Sign in', signUp: 'Sign up', signOut: 'Sign out', getStarted: 'Get started',
  createOrg: 'New organization', joinOrg: 'Join organization', createOrgBtn: 'Create organization',
  createOrgHint: 'Register your shop or company. You will be the owner and can invite your staff.',
  joinOrgHint: 'Ask your shop owner for an invite code.',
  email: 'Email', password: 'Password', confirmPassword: 'Confirm password', fullName: 'Your name',
  orgName: 'Shop / organization name', orgNamePh: 'e.g. Kisan Agro Traders', inviteCode: 'Invite code',
  checkCode: 'Check code', joiningAs: 'You are joining {org} as {role}',
  forgotPassword: 'Forgot password?', sendResetLink: 'Send reset link', backToSignIn: 'Back to sign in',
  resetSent: 'If this email is registered, a reset link has been sent. Check your inbox.',
  showPassword: 'Show password', hidePassword: 'Hide password',
  resetPassword: 'Reset password', changePassword: 'Change password',
  passwordResetDone: 'Password changed. Tell {name} the new password.',
  resetPasswordHint: 'They will be signed out on all devices and must sign in with this new password.',
  forgotNoEmail: 'Ask your shop owner to set a new password for you in Settings → Members. Owners: see "Owner forgot password" in the README.',
  errUseProfile: 'Change your own password in Settings → My profile.',
  errSamePassword: 'New password must be different from the current one.',
  newPassword: 'New password', updatePassword: 'Update password', passwordUpdated: 'Password updated.',
  checkEmailTitle: 'Confirm your email',
  checkEmailText: 'We sent a confirmation link to {email}. Open it, then sign in.',
  noAccount: 'No account yet?', haveAccount: 'Already registered?',
  checkSpam: "Didn't get it? Check your Spam / Promotions folder, then resend.",
  resendEmail: 'Resend confirmation email', resendIn: 'Resend in {n}s', confirmResent: 'Confirmation email sent again to {email}.',
  errEmailRateLimit: 'Too many emails sent. Please wait a few minutes and try again.',
  confirmStillOn: 'Your account was created, but "Confirm email" is still turned on in Supabase. Turn it off (Authentication → Sign In / Providers), then sign in.',
  errEmailLoginOff: 'Email sign-in is turned off in Supabase. Turn on the Email provider (Authentication → Sign In / Providers → Email).',
  passwordsDontMatch: 'Passwords do not match', passwordMin: 'At least 6 characters',
  landingTitle: 'Never sell an expired bottle again',
  landingText: 'Track every bottle, gallon and bag by batch. Get warned 2 months before expiry. See daily and monthly stock reports.',
  feat1: 'Expiry alerts 60 days in advance', feat2: 'Day-by-day & monthly stock reports',
  feat3: 'ml, liter, gallon, gram, kg & bag units', feat4: 'Multiple users per shop, English & اردو',
  noOrgTitle: 'Set up your organization', noOrgText: 'Create a new organization or join one with an invite code.',

  // errors
  errInsufficient: 'Not enough stock. Stock can never go below zero (expired batches cannot be sold).',
  errBatchExpiry: 'This batch number already exists with a different expiry date.',
  errInvalidDate: 'Date cannot be in the future.',
  errNotAllowed: 'You do not have permission for this action.',
  errInvalidInvite: 'Invite code is invalid, used or expired.',
  errInviteEmail: 'This invite is for a different email address.',
  errAlreadyMember: 'You are already a member of this organization.',
  errAlreadyInOrg: 'This account already belongs to an organization. One account can only be in one organization.',
  errDuplicateProduct: 'This product with the same company and pack size already exists.',
  errDuplicate: 'This name already exists.',
  errInUse: 'Cannot delete: it is used by other records. Deactivate it instead.',
  errInvalidLogin: 'Wrong email or password.',
  errEmailNotConfirmed: 'Please confirm your email first (check your inbox).',
  errUserExists: 'An account with this email already exists. Please sign in.',
  errExpiryRequired: 'Expiry date is required.',
  errQty: 'Enter a quantity greater than zero.',
  errGeneric: 'Something went wrong. Please try again.',
  errNotConfigured: 'Supabase is not configured. Copy .env.example to .env and add your project URL and anon key.',
  errChooseProduct: 'Choose a product on every line.',

  // pack types
  pt_bottle: 'Bottle', pt_can: 'Can', pt_gallon: 'Gallon', pt_drum: 'Drum', pt_bag: 'Bag',
  pt_packet: 'Packet', pt_box: 'Box', pt_piece: 'Piece',

  // movement types
  mv_purchase: 'Purchase', mv_return_in: 'Customer return', mv_sale: 'Sale', mv_return_out: 'Return to supplier',
  mv_damaged: 'Damaged / leaked', mv_expired: 'Expired write-off', mv_adjustment: 'Count adjustment',

  // roles
  role_owner: 'Owner', role_admin: 'Admin', role_staff: 'Staff',

  // dashboard
  expiryAlerts: 'Expiry alerts', expiredCount: '{n} expired', expiringCount: '{n} expiring within {d} days',
  noExpiry: 'No item is expiring in the next {d} days.',
  daysLeft: '{n} days left', expiredAgo: 'Expired {n} days ago', expiresToday: 'Expires today',
  addProduct: 'Add product', totalProducts: 'Products', totalLiters: 'Liquid stock', totalKg: 'Dry stock',
  lowStock: 'Low stock', todayEntries: "Today's entries", recentActivity: 'Recent activity',
  noLowStock: 'All items are above minimum stock.', noActivity: 'No stock entries yet.',
  inLabel: 'in', outLabel: 'out', quickActions: 'Quick actions',

  // products
  products: 'Products', editProduct: 'Edit product', productName: 'Product name', urduName: 'Urdu name',
  category: 'Category', company: 'Company', packSize: 'Pack size', unit: 'Unit', packType: 'Pack type',
  minStock: 'Minimum stock (packs)', minStockHint: 'Shows "Low stock" when stock falls to this level.',
  active: 'Active', inactive: 'Inactive', showInactive: 'Show inactive', stock: 'Stock',
  nextExpiry: 'Next expiry', batches: 'Batches', noProducts: 'No products yet. Add your first product.',
  selectSizes: 'Pack sizes', multiSizeHint: 'Select one or more sizes. Each size is saved as its own item.',
  customSize: 'Other size', addSize: 'Add size', productSaved: 'Product saved', productsSaved: '{n} products saved',
  deactivate: 'Deactivate', activate: 'Activate', newCompany: 'New company…', selectCompany: 'Select company',
  selectCategory: 'Select category', liquid: 'Liquid', dry: 'Powder / granules / seed',
  history: 'History', adjust: 'Adjust', countedQty: 'Counted quantity (packs)',
  adjustHint: 'Enter the physical count. The difference will be recorded as an adjustment.',
  deleteProductConfirm: 'Delete this product permanently?',
  errProductHasHistory: 'This product has stock history, so it cannot be deleted. Use "Deactivate" to hide it instead.', noBatches: 'No batches yet.',

  // stock in/out
  stockInTitle: 'Stock In', stockOutTitle: 'Sale / Stock Out', entryType: 'Entry type', supplier: 'Supplier',
  customer: 'Customer / farmer', invoiceNo: 'Invoice / bill no.', batchNo: 'Batch no.',
  batchNoHint: 'Leave empty if not printed', mfgDate: 'Mfg date', expiryDate: 'Expiry date',
  qtyPacks: 'Quantity', addLine: 'Add another item', saveStock: 'Save entry', stockSaved: 'Saved {n} entries',
  existingBatches: 'Existing batches', chooseProduct: 'Choose product…', newProduct: 'New product',
  batch: 'Batch', batchAuto: 'Auto (earliest expiry first)', available: 'Available', exceeds: 'More than available',
  expiresSoonWarn: 'Expires soon', totalItems: '{n} items', item: 'Item',

  // ledger
  ledger: 'Stock History', type: 'Type', qty: 'Qty', party: 'Party', reference: 'Ref.', by: 'By',
  deleteEntryConfirm: 'Delete this entry? Stock will be recalculated.', noEntries: 'No entries for this filter.',
  allTypes: 'All types', allProducts: 'All products', entries: 'Entries',

  // expiry
  expiry: 'Expiry', expired: 'Expired', within30: 'Within 30 days', withinN: 'Within {n} days',
  allBatches: 'All stock by expiry', writeOff: 'Write off', daysLeftCol: 'Days left', expiryReport: 'Expiry report',

  // reports
  reports: 'Reports', daily: 'Daily', monthly: 'Monthly', dayByDay: 'Day by day', stockOnDate: 'Stock on date',
  opening: 'Opening', in: 'In', out: 'Out', closing: 'Closing', purchased: 'Purchased', returnIn: 'Return in',
  sold: 'Sold', returnOut: 'Return out', damaged: 'Damaged', expiredCol: 'Expired', adjusted: 'Adjust',
  onlyMoved: 'Only items with movement', detailed: 'Detailed columns', closingTotal: 'Closing total',
  liquidTotal: 'Liquid (L)', dryTotal: 'Dry (kg)', dailyTotals: 'Daily totals', product: 'Product',
  printedOn: 'Printed on', dailyReport: 'Daily stock report', monthlyReport: 'Monthly stock report',
  registerReport: 'Day-by-day stock register', stockReport: 'Stock report', onlyMoveDays: 'Only days with movement',
  pickProduct: 'Pick a product to see its day-by-day register.', liquidIn: 'Liquid in', liquidOut: 'Liquid out',
  dryIn: 'Dry in', dryOut: 'Dry out', packsIn: 'Packs in', packsOut: 'Packs out', noData: 'No data.',
  openDay: 'Open day', hideZero: 'Hide zero stock', itemsCol: 'Items',

  // sales, khata, roznamcha
  navSales: 'Invoices', navKhata: 'Khata', navRoznamcha: 'Roznamcha',
  purchasePrice: 'Purchase rate', salePrice: 'Sale price (MRP)', mrp: 'MRP', rate: 'Rate', amount: 'Amount',
  stockValue: 'Stock value', walkIn: 'Walk-in customer', customerName: 'Customer name',
  khataAccount: 'Khata account', noKhata: 'No khata (cash only)', newCustomer: 'New customer', newSupplier: 'New supplier',
  subtotal: 'Subtotal', discount: 'Discount', grandTotal: 'Total', received: 'Received', paidNow: 'Paid now',
  balanceDue: 'Balance (to khata)', previousBalance: 'Previous balance', newBalance: 'New balance',
  saleSaved: 'Sale saved · Invoice #{n}', purchaseSaved: 'Purchase #{n} saved', stockInSaved: 'Stock saved',
  receipt: 'Receipt', printReceipt: 'Print receipt', invoiceNum: 'Invoice #', thankYou: 'Thank you! Please come again.',
  paper: 'Paper', thermal: '80 mm thermal', a4: 'A4', newSale: 'New sale', servedBy: 'Served by', cashSale: 'Cash sale',
  invoices: 'Invoices', purchases: 'Purchases', voidDoc: 'Void',
  voidInvoiceConfirm: 'Void invoice #{n}? Its stock comes back and its khata / roznamcha entries are removed.',
  voidPurchaseConfirm: 'Void purchase #{n}? Its stock and payment are removed.', voided: 'Voided',
  customers: 'Customers', suppliers: 'Suppliers', addCustomer: 'Add customer', addSupplier: 'Add supplier',
  openingBalance: 'Opening balance', openingHintCustomer: 'Amount this customer already owes you',
  openingHintSupplier: 'Amount you already owe this supplier',
  theyOwe: 'Owes you', youOwe: 'You owe', settled: 'Settled', advance: 'Advance',
  totalReceivable: 'Customers owe you', totalPayable: 'You owe suppliers',
  receivePayment: 'Receive payment', paySupplier: 'Pay supplier', paymentSaved: 'Payment saved',
  ledger_: 'Ledger', bill: 'Bill', paidCol: 'Paid', balance: 'Balance', lastActivity: 'Last activity',
  lk_opening: 'Opening balance', lk_sale: 'Sale', lk_purchase: 'Purchase', lk_receipt: 'Payment received', lk_payment: 'Payment made',
  noCustomers: 'No customers yet.', noSuppliers: 'No suppliers yet.', deletePartyConfirm: 'Delete this account? Only possible if it has no entries.',
  partySaved: 'Saved', viewKhata: 'Open khata',
  roznamchaTitle: 'Roznamcha (daily cash book)', openingCash: 'Opening cash', cashIn: 'Cash in', cashOut: 'Cash out',
  closingCash: 'Closing cash', cashInHand: 'Cash in hand', addExpense: 'Expense', addCashIn: 'Cash in', addCashOut: 'Cash out',
  ck_sale: 'Sale', ck_purchase: 'Purchase', ck_receipt: 'Received from customer', ck_payment: 'Paid to supplier',
  ck_expense: 'Expense', ck_cash_in: 'Cash in', ck_cash_out: 'Cash out',
  noCashEntries: 'No cash entries on this day.', dayView: 'Day', monthView: 'Month', detail: 'Detail',
  expenseHint: 'Shop rent, electricity, tea, transport, salaries…', cashInHint: 'Opening cash, money added by owner…',
  cashOutHint: 'Money taken out by owner, bank deposit…',
  sales_: 'Sales', profit: 'Profit', cost: 'Cost', margin: 'Margin',
  todaySales: "Today's sales", todayProfit: "Today's profit", monthSales: 'This month', salesProfit: 'Sales & profit',
  productsByProfit: 'Products by profit', unpricedNote: 'Sales recorded before prices were added are not included.',
  errCreditNeedsParty: 'To leave an amount unpaid, choose a khata account (customer / supplier).',
  errInvalidPaid: 'Paid amount cannot be more than the bill.', errInvalidDiscount: 'Discount cannot be more than the bill.',
  errInvalidPrice: 'Enter a valid rate.', errInvalidAmount: 'Enter an amount greater than zero.',
  errInvalidParty: 'Choose a valid khata account.',

  // settings
  settings: 'Settings', organization: 'Organization', address: 'Address', phone: 'Phone',
  alertDays: 'Expiry alert (days before)', alertDaysHint: 'Items are flagged this many days before expiry. Default 60 (2 months).',
  members: 'Members', role: 'Role', invites: 'Invite codes', createInvite: 'Create invite code',
  inviteEmail: 'Only for this email', inviteCreated: 'Invite code created',
  shareInvite: 'Join {org} on Agri Inventory.\nOpen {url}, choose "Join organization" and enter code: {code}',
  expires: 'Expires', categories: 'Categories', companies: 'Companies', addCategory: 'Add category',
  addCompany: 'Add company', profile: 'My profile', language: 'Language',
 
  removeMemberConfirm: 'Remove {name}? Their account will be deleted and they will be signed out on all devices. Their past stock entries stay in the history.',
  removeMember: 'Remove member', memberRemoved: '{name} was removed.', errCannotRemoveSelf: 'You cannot remove yourself.', signedOutRemoved: 'Your account was removed from the organization.',
  noInvites: 'No active invite codes. Create one above to add staff.',
  inviteHint: 'Create a code and send it to your staff. They open the app, choose "Join organization" and enter the code. Each code works once and expires in 7 days.',
  roleStaffHint: 'Staff can add products, record stock in/out and view reports.',
  roleAdminHint: 'Admin can also delete entries, adjust stock counts, manage members and change settings.',
}

export type TKey = keyof typeof en

const ur: Record<TKey, string> = {
  appName: 'زرعی انوینٹری',
  tagline: 'زرعی ادویات، کھاد اور بیج کا اسٹاک اور ایکسپائری کنٹرول',

  save: 'محفوظ کریں', cancel: 'منسوخ', close: 'بند کریں', edit: 'ترمیم', delete: 'حذف کریں', add: 'شامل کریں',
  search: 'تلاش کریں…', loading: 'لوڈ ہو رہا ہے…', back: 'واپس', confirm: 'تصدیق', print: 'پرنٹ', exportExcel: 'ایکسل',
  all: 'سب', actions: 'عمل', optional: 'اختیاری', saved: 'محفوظ ہو گیا', deleted: 'حذف ہو گیا', today: 'آج',
  date: 'تاریخ', from: 'سے', to: 'تک', month: 'مہینہ', total: 'کل', note: 'نوٹ', name: 'نام',
  status: 'حالت', viewAll: 'سب دیکھیں', retry: 'دوبارہ کوشش', yes: 'ہاں', no: 'نہیں', copy: 'کاپی', copied: 'کاپی ہو گیا!',
  collapseSidebar: 'سائیڈ بار چھوٹی کریں', expandSidebar: 'سائیڈ بار کھولیں',
  theme: 'تھیم', themeLight: 'لائٹ موڈ', themeDark: 'ڈارک موڈ', themeSystem: 'ڈیوائس کے مطابق',
  remove: 'ہٹائیں', you: 'آپ', never: 'کبھی نہیں', packs: 'پیک', create: 'بنائیں', go: 'جائیں',

  navDashboard: 'ڈیش بورڈ', navProducts: 'اشیاء', navStockIn: 'اسٹاک آمد', navStockOut: 'نئی فروخت',
  navLedger: 'اسٹاک ریکارڈ', navExpiry: 'ایکسپائری', navReports: 'رپورٹس', navSettings: 'سیٹنگز', more: 'مزید',

  signIn: 'لاگ ان', signUp: 'رجسٹر کریں', signOut: 'لاگ آؤٹ', getStarted: 'شروع کریں',
  createOrg: 'نئی تنظیم', joinOrg: 'تنظیم میں شامل ہوں', createOrgBtn: 'تنظیم بنائیں',
  createOrgHint: 'اپنی دکان یا کمپنی رجسٹر کریں۔ آپ مالک ہوں گے اور اپنے عملے کو دعوت دے سکیں گے۔',
  joinOrgHint: 'اپنی دکان کے مالک سے دعوتی کوڈ لیں۔',
  email: 'ای میل', password: 'پاس ورڈ', confirmPassword: 'پاس ورڈ دوبارہ', fullName: 'آپ کا نام',
  orgName: 'دکان / تنظیم کا نام', orgNamePh: 'مثلاً کسان ایگرو ٹریڈرز', inviteCode: 'دعوتی کوڈ',
  checkCode: 'کوڈ چیک کریں', joiningAs: 'آپ {org} میں بطور {role} شامل ہو رہے ہیں',
  forgotPassword: 'پاس ورڈ بھول گئے؟', sendResetLink: 'ری سیٹ لنک بھیجیں', backToSignIn: 'لاگ ان پر واپس',
  resetSent: 'اگر یہ ای میل رجسٹرڈ ہے تو ری سیٹ لنک بھیج دیا گیا ہے۔ اپنا ان باکس دیکھیں۔',
  showPassword: 'پاس ورڈ دکھائیں', hidePassword: 'پاس ورڈ چھپائیں',
  resetPassword: 'پاس ورڈ ری سیٹ کریں', changePassword: 'پاس ورڈ تبدیل کریں',
  passwordResetDone: 'پاس ورڈ تبدیل ہو گیا۔ {name} کو نیا پاس ورڈ بتا دیں۔',
  resetPasswordHint: 'وہ تمام ڈیوائسز سے لاگ آؤٹ ہو جائیں گے اور نئے پاس ورڈ سے لاگ ان کریں گے۔',
  forgotNoEmail: 'اپنی دکان کے مالک سے کہیں کہ سیٹنگز → اراکین میں آپ کا نیا پاس ورڈ سیٹ کریں۔ مالکان: README میں "Owner forgot password" دیکھیں۔',
  errUseProfile: 'اپنا پاس ورڈ سیٹنگز → میری پروفائل میں تبدیل کریں۔',
  errSamePassword: 'نیا پاس ورڈ موجودہ پاس ورڈ سے مختلف ہونا چاہیے۔',
  newPassword: 'نیا پاس ورڈ', updatePassword: 'پاس ورڈ تبدیل کریں', passwordUpdated: 'پاس ورڈ تبدیل ہو گیا۔',
  checkEmailTitle: 'اپنی ای میل کی تصدیق کریں',
  checkEmailText: 'ہم نے {email} پر تصدیقی لنک بھیجا ہے۔ اسے کھولیں، پھر لاگ ان کریں۔',
  noAccount: 'اکاؤنٹ نہیں ہے؟', haveAccount: 'پہلے سے رجسٹرڈ ہیں؟',
  checkSpam: 'ای میل نہیں ملی؟ اسپام / پروموشنز فولڈر دیکھیں، پھر دوبارہ بھیجیں۔',
  resendEmail: 'تصدیقی ای میل دوبارہ بھیجیں', resendIn: '{n} سیکنڈ بعد دوبارہ بھیجیں', confirmResent: 'تصدیقی ای میل {email} پر دوبارہ بھیج دی گئی۔',
  errEmailRateLimit: 'بہت زیادہ ای میلز بھیجی گئیں۔ چند منٹ انتظار کر کے دوبارہ کوشش کریں۔',
  confirmStillOn: 'آپ کا اکاؤنٹ بن گیا ہے، لیکن Supabase میں "Confirm email" ابھی آن ہے۔ اسے بند کریں (Authentication → Sign In / Providers)، پھر لاگ ان کریں۔',
  errEmailLoginOff: 'Supabase میں ای میل لاگ ان بند ہے۔ Email provider آن کریں (Authentication → Sign In / Providers → Email)۔',
  passwordsDontMatch: 'پاس ورڈ ایک جیسے نہیں ہیں', passwordMin: 'کم از کم 6 حروف',
  landingTitle: 'اب کبھی ایکسپائر دوا فروخت نہ ہو',
  landingText: 'ہر بوتل، گیلن اور بیگ کا بیچ کے حساب سے ریکارڈ رکھیں۔ ایکسپائری سے 2 ماہ پہلے اطلاع پائیں۔ روزانہ اور ماہانہ اسٹاک رپورٹس دیکھیں۔',
  feat1: 'ایکسپائری سے 60 دن پہلے الرٹ', feat2: 'روزانہ اور ماہانہ اسٹاک رپورٹس',
  feat3: 'ملی لیٹر، لیٹر، گیلن، گرام، کلو اور بیگ', feat4: 'ایک دکان میں کئی صارفین، English اور اردو',
  noOrgTitle: 'اپنی تنظیم ترتیب دیں', noOrgText: 'نئی تنظیم بنائیں یا دعوتی کوڈ سے شامل ہوں۔',

  errInsufficient: 'اسٹاک ناکافی ہے۔ اسٹاک صفر سے کم نہیں ہو سکتا (ایکسپائر بیچ فروخت نہیں ہو سکتا)۔',
  errBatchExpiry: 'یہ بیچ نمبر پہلے سے کسی اور ایکسپائری تاریخ کے ساتھ موجود ہے۔',
  errInvalidDate: 'تاریخ مستقبل کی نہیں ہو سکتی۔',
  errNotAllowed: 'آپ کو اس کام کی اجازت نہیں ہے۔',
  errInvalidInvite: 'دعوتی کوڈ غلط، استعمال شدہ یا ختم ہو چکا ہے۔',
  errInviteEmail: 'یہ دعوت کسی اور ای میل کے لیے ہے۔',
  errAlreadyMember: 'آپ پہلے ہی اس تنظیم کے رکن ہیں۔',
  errAlreadyInOrg: 'یہ اکاؤنٹ پہلے ہی ایک تنظیم سے منسلک ہے۔ ایک اکاؤنٹ صرف ایک تنظیم میں ہو سکتا ہے۔',
  errDuplicateProduct: 'یہ چیز اسی کمپنی اور اسی پیک سائز کے ساتھ پہلے سے موجود ہے۔',
  errDuplicate: 'یہ نام پہلے سے موجود ہے۔',
  errInUse: 'حذف نہیں ہو سکتا: یہ دوسرے ریکارڈ میں استعمال ہو رہا ہے۔ اس کی بجائے غیر فعال کریں۔',
  errInvalidLogin: 'ای میل یا پاس ورڈ غلط ہے۔',
  errEmailNotConfirmed: 'پہلے اپنی ای میل کی تصدیق کریں (ان باکس دیکھیں)۔',
  errUserExists: 'اس ای میل سے اکاؤنٹ پہلے سے موجود ہے۔ لاگ ان کریں۔',
  errExpiryRequired: 'ایکسپائری تاریخ ضروری ہے۔',
  errQty: 'صفر سے زیادہ مقدار درج کریں۔',
  errGeneric: 'کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔',
  errNotConfigured: 'Supabase ترتیب نہیں دیا گیا۔ .env.example کو .env میں کاپی کر کے پروجیکٹ URL اور anon key درج کریں۔',
  errChooseProduct: 'ہر لائن میں چیز منتخب کریں۔',

  pt_bottle: 'بوتل', pt_can: 'کین', pt_gallon: 'گیلن', pt_drum: 'ڈرم', pt_bag: 'بیگ',
  pt_packet: 'پیکٹ', pt_box: 'ڈبہ', pt_piece: 'عدد',

  mv_purchase: 'خریداری', mv_return_in: 'گاہک کی واپسی', mv_sale: 'فروخت', mv_return_out: 'سپلائر کو واپسی',
  mv_damaged: 'خراب / لیک', mv_expired: 'ایکسپائر اخراج', mv_adjustment: 'گنتی کی درستگی',

  role_owner: 'مالک', role_admin: 'ایڈمن', role_staff: 'عملہ',

  expiryAlerts: 'ایکسپائری الرٹ', expiredCount: '{n} ایکسپائر ہو چکے', expiringCount: '{n} اگلے {d} دن میں ایکسپائر',
  noExpiry: 'اگلے {d} دن میں کوئی چیز ایکسپائر نہیں ہو رہی۔',
  daysLeft: '{n} دن باقی', expiredAgo: '{n} دن پہلے ایکسپائر', expiresToday: 'آج ایکسپائر',
  addProduct: 'نئی چیز', totalProducts: 'اشیاء', totalLiters: 'مائع اسٹاک', totalKg: 'خشک اسٹاک',
  lowStock: 'کم اسٹاک', todayEntries: 'آج کے اندراج', recentActivity: 'حالیہ سرگرمی',
  noLowStock: 'تمام اشیاء کم از کم اسٹاک سے زیادہ ہیں۔', noActivity: 'ابھی کوئی اندراج نہیں۔',
  inLabel: 'آمد', outLabel: 'روانگی', quickActions: 'فوری کام',

  products: 'اشیاء', editProduct: 'چیز میں ترمیم', productName: 'چیز کا نام', urduName: 'اردو نام',
  category: 'قسم', company: 'کمپنی', packSize: 'پیک سائز', unit: 'اکائی', packType: 'پیکنگ',
  minStock: 'کم از کم اسٹاک (پیک)', minStockHint: 'اسٹاک اس حد تک آنے پر "کم اسٹاک" دکھائے گا۔',
  active: 'فعال', inactive: 'غیر فعال', showInactive: 'غیر فعال بھی دکھائیں', stock: 'اسٹاک',
  nextExpiry: 'قریب ترین ایکسپائری', batches: 'بیچ', noProducts: 'ابھی کوئی چیز نہیں۔ پہلی چیز شامل کریں۔',
  selectSizes: 'پیک سائز', multiSizeHint: 'ایک یا زیادہ سائز منتخب کریں۔ ہر سائز الگ چیز کے طور پر محفوظ ہوگا۔',
  customSize: 'دوسرا سائز', addSize: 'سائز شامل کریں', productSaved: 'چیز محفوظ ہو گئی', productsSaved: '{n} اشیاء محفوظ ہو گئیں',
  deactivate: 'غیر فعال کریں', activate: 'فعال کریں', newCompany: 'نئی کمپنی…', selectCompany: 'کمپنی منتخب کریں',
  selectCategory: 'قسم منتخب کریں', liquid: 'مائع', dry: 'پاؤڈر / دانے / بیج',
  history: 'تاریخچہ', adjust: 'درستگی', countedQty: 'گنی گئی مقدار (پیک)',
  adjustHint: 'اصل گنتی درج کریں۔ فرق درستگی کے طور پر درج ہوگا۔',
  deleteProductConfirm: 'کیا یہ چیز مستقل حذف کر دیں؟',
  errProductHasHistory: 'اس چیز کا اسٹاک ریکارڈ موجود ہے اس لیے حذف نہیں ہو سکتی۔ چھپانے کے لیے "غیر فعال کریں" استعمال کریں۔', noBatches: 'ابھی کوئی بیچ نہیں۔',

  stockInTitle: 'اسٹاک آمد', stockOutTitle: 'فروخت / اسٹاک روانگی', entryType: 'اندراج کی قسم', supplier: 'سپلائر',
  customer: 'گاہک / کسان', invoiceNo: 'بل نمبر', batchNo: 'بیچ نمبر',
  batchNoHint: 'اگر چھپا نہ ہو تو خالی چھوڑ دیں', mfgDate: 'تیاری کی تاریخ', expiryDate: 'ایکسپائری تاریخ',
  qtyPacks: 'مقدار', addLine: 'ایک اور چیز', saveStock: 'محفوظ کریں', stockSaved: '{n} اندراج محفوظ ہو گئے',
  existingBatches: 'موجودہ بیچ', chooseProduct: 'چیز منتخب کریں…', newProduct: 'نئی چیز',
  batch: 'بیچ', batchAuto: 'خودکار (پہلے ایکسپائر ہونے والا پہلے)', available: 'دستیاب', exceeds: 'دستیاب سے زیادہ',
  expiresSoonWarn: 'جلد ایکسپائر', totalItems: '{n} اشیاء', item: 'چیز',

  ledger: 'اسٹاک ریکارڈ', type: 'قسم', qty: 'مقدار', party: 'فریق', reference: 'حوالہ', by: 'از',
  deleteEntryConfirm: 'کیا یہ اندراج حذف کر دیں؟ اسٹاک دوبارہ حساب ہوگا۔', noEntries: 'اس فلٹر کے لیے کوئی اندراج نہیں۔',
  allTypes: 'تمام اقسام', allProducts: 'تمام اشیاء', entries: 'اندراجات',

  expiry: 'ایکسپائری', expired: 'ایکسپائر شدہ', within30: '30 دن کے اندر', withinN: '{n} دن کے اندر',
  allBatches: 'تمام اسٹاک بلحاظ ایکسپائری', writeOff: 'اخراج کریں', daysLeftCol: 'باقی دن', expiryReport: 'ایکسپائری رپورٹ',

  reports: 'رپورٹس', daily: 'روزانہ', monthly: 'ماہانہ', dayByDay: 'دن بہ دن', stockOnDate: 'تاریخ پر اسٹاک',
  opening: 'ابتدائی', in: 'آمد', out: 'روانگی', closing: 'اختتامی', purchased: 'خریداری', returnIn: 'واپسی آمد',
  sold: 'فروخت', returnOut: 'واپسی روانگی', damaged: 'خراب', expiredCol: 'ایکسپائر', adjusted: 'درستگی',
  onlyMoved: 'صرف وہ اشیاء جن میں لین دین ہوا', detailed: 'تفصیلی کالم', closingTotal: 'کل اختتامی',
  liquidTotal: 'مائع (لیٹر)', dryTotal: 'خشک (کلو)', dailyTotals: 'روزانہ کا خلاصہ', product: 'چیز',
  printedOn: 'پرنٹ کی تاریخ', dailyReport: 'روزانہ اسٹاک رپورٹ', monthlyReport: 'ماہانہ اسٹاک رپورٹ',
  registerReport: 'دن بہ دن اسٹاک رجسٹر', stockReport: 'اسٹاک رپورٹ', onlyMoveDays: 'صرف لین دین والے دن',
  pickProduct: 'دن بہ دن رجسٹر دیکھنے کے لیے چیز منتخب کریں۔', liquidIn: 'مائع آمد', liquidOut: 'مائع روانگی',
  dryIn: 'خشک آمد', dryOut: 'خشک روانگی', packsIn: 'پیک آمد', packsOut: 'پیک روانگی', noData: 'کوئی ڈیٹا نہیں۔',
  openDay: 'دن کھولیں', hideZero: 'صفر اسٹاک چھپائیں', itemsCol: 'اشیاء',

  navSales: 'بل', navKhata: 'کھاتہ', navRoznamcha: 'روزنامچہ',
  purchasePrice: 'خرید ریٹ', salePrice: 'فروخت ریٹ (ایم آر پی)', mrp: 'ایم آر پی', rate: 'ریٹ', amount: 'رقم',
  stockValue: 'اسٹاک کی مالیت', walkIn: 'عام گاہک', customerName: 'گاہک کا نام',
  khataAccount: 'کھاتہ', noKhata: 'بغیر کھاتہ (صرف نقد)', newCustomer: 'نیا گاہک', newSupplier: 'نیا سپلائر',
  subtotal: 'میزان', discount: 'رعایت', grandTotal: 'کل رقم', received: 'وصول', paidNow: 'ابھی ادا',
  balanceDue: 'بقایا (کھاتے میں)', previousBalance: 'سابقہ بقایا', newBalance: 'نیا بقایا',
  saleSaved: 'فروخت محفوظ · بل نمبر {n}', purchaseSaved: 'خریداری نمبر {n} محفوظ', stockInSaved: 'اسٹاک محفوظ',
  receipt: 'رسید', printReceipt: 'رسید پرنٹ کریں', invoiceNum: 'بل نمبر', thankYou: 'شکریہ! دوبارہ تشریف لائیں۔',
  paper: 'کاغذ', thermal: '80 ملی میٹر تھرمل', a4: 'A4', newSale: 'نئی فروخت', servedBy: 'فروخت کنندہ', cashSale: 'نقد فروخت',
  invoices: 'بل', purchases: 'خریداری', voidDoc: 'منسوخ',
  voidInvoiceConfirm: 'کیا بل نمبر {n} منسوخ کر دیں؟ اسٹاک واپس آ جائے گا اور کھاتہ / روزنامچہ اندراج ختم ہو جائیں گے۔',
  voidPurchaseConfirm: 'کیا خریداری نمبر {n} منسوخ کر دیں؟ اس کا اسٹاک اور ادائیگی ختم ہو جائے گی۔', voided: 'منسوخ ہو گیا',
  customers: 'گاہک', suppliers: 'سپلائرز', addCustomer: 'گاہک شامل کریں', addSupplier: 'سپلائر شامل کریں',
  openingBalance: 'ابتدائی بقایا', openingHintCustomer: 'یہ گاہک پہلے سے آپ کا کتنا مقروض ہے',
  openingHintSupplier: 'آپ پہلے سے اس سپلائر کے کتنے مقروض ہیں',
  theyOwe: 'آپ کو دینے ہیں', youOwe: 'آپ نے دینے ہیں', settled: 'برابر', advance: 'ایڈوانس',
  totalReceivable: 'گاہکوں کے ذمہ', totalPayable: 'سپلائرز کے واجبات',
  receivePayment: 'رقم وصول کریں', paySupplier: 'سپلائر کو ادائیگی', paymentSaved: 'ادائیگی محفوظ',
  ledger_: 'کھاتہ', bill: 'بل', paidCol: 'ادا', balance: 'بقایا', lastActivity: 'آخری لین دین',
  lk_opening: 'ابتدائی بقایا', lk_sale: 'فروخت', lk_purchase: 'خریداری', lk_receipt: 'وصولی', lk_payment: 'ادائیگی',
  noCustomers: 'ابھی کوئی گاہک نہیں۔', noSuppliers: 'ابھی کوئی سپلائر نہیں۔', deletePartyConfirm: 'کیا یہ کھاتہ حذف کر دیں؟ صرف بغیر اندراج کے ممکن ہے۔',
  partySaved: 'محفوظ ہو گیا', viewKhata: 'کھاتہ کھولیں',
  roznamchaTitle: 'روزنامچہ (روزانہ نقدی)', openingCash: 'ابتدائی نقدی', cashIn: 'نقد آمد', cashOut: 'نقد خرچ',
  closingCash: 'اختتامی نقدی', cashInHand: 'ہاتھ میں نقدی', addExpense: 'خرچہ', addCashIn: 'نقد آمد', addCashOut: 'نقد نکالی',
  ck_sale: 'فروخت', ck_purchase: 'خریداری', ck_receipt: 'گاہک سے وصولی', ck_payment: 'سپلائر کو ادائیگی',
  ck_expense: 'خرچہ', ck_cash_in: 'نقد آمد', ck_cash_out: 'نقد نکالی',
  noCashEntries: 'اس دن کوئی نقد اندراج نہیں۔', dayView: 'دن', monthView: 'مہینہ', detail: 'تفصیل',
  expenseHint: 'دکان کا کرایہ، بجلی، چائے، کرایہ گاڑی، تنخواہیں…', cashInHint: 'ابتدائی نقدی، مالک کی طرف سے رقم…',
  cashOutHint: 'مالک نے رقم نکالی، بینک میں جمع…',
  sales_: 'فروخت', profit: 'منافع', cost: 'لاگت', margin: 'مارجن',
  todaySales: 'آج کی فروخت', todayProfit: 'آج کا منافع', monthSales: 'اس مہینے', salesProfit: 'فروخت و منافع',
  productsByProfit: 'اشیاء بلحاظ منافع', unpricedNote: 'قیمتیں شامل ہونے سے پہلے کی فروخت اس میں شامل نہیں۔',
  errCreditNeedsParty: 'رقم ادھار رکھنے کے لیے کھاتہ (گاہک / سپلائر) منتخب کریں۔',
  errInvalidPaid: 'ادا شدہ رقم بل سے زیادہ نہیں ہو سکتی۔', errInvalidDiscount: 'رعایت بل سے زیادہ نہیں ہو سکتی۔',
  errInvalidPrice: 'درست ریٹ درج کریں۔', errInvalidAmount: 'صفر سے زیادہ رقم درج کریں۔',
  errInvalidParty: 'درست کھاتہ منتخب کریں۔',

  settings: 'سیٹنگز', organization: 'تنظیم', address: 'پتہ', phone: 'فون',
  alertDays: 'ایکسپائری الرٹ (دن پہلے)', alertDaysHint: 'ایکسپائری سے اتنے دن پہلے اشیاء نمایاں ہوں گی۔ ڈیفالٹ 60 (2 ماہ)۔',
  members: 'اراکین', role: 'کردار', invites: 'دعوتی کوڈ', createInvite: 'دعوتی کوڈ بنائیں',
  inviteEmail: 'صرف اس ای میل کے لیے', inviteCreated: 'دعوتی کوڈ بن گیا',
  shareInvite: 'زرعی انوینٹری پر {org} میں شامل ہوں۔\n{url} کھولیں، "تنظیم میں شامل ہوں" منتخب کریں اور یہ کوڈ درج کریں: {code}',
  expires: 'میعاد', categories: 'اقسام', companies: 'کمپنیاں', addCategory: 'قسم شامل کریں',
  addCompany: 'کمپنی شامل کریں', profile: 'میری پروفائل', language: 'زبان',
 
  removeMemberConfirm: 'کیا {name} کو ہٹا دیں؟ ان کا اکاؤنٹ حذف ہو جائے گا اور وہ تمام ڈیوائسز سے لاگ آؤٹ ہو جائیں گے۔ ان کے پرانے اسٹاک اندراج ریکارڈ میں رہیں گے۔',
  removeMember: 'رکن کو ہٹائیں', memberRemoved: '{name} کو ہٹا دیا گیا۔', errCannotRemoveSelf: 'آپ خود کو نہیں ہٹا سکتے۔', signedOutRemoved: 'آپ کا اکاؤنٹ تنظیم سے ہٹا دیا گیا ہے۔',
  noInvites: 'کوئی فعال دعوتی کوڈ نہیں۔ عملہ شامل کرنے کے لیے اوپر کوڈ بنائیں۔',
  inviteHint: 'کوڈ بنا کر اپنے عملے کو بھیجیں۔ وہ ایپ کھول کر "تنظیم میں شامل ہوں" منتخب کریں اور کوڈ درج کریں۔ ہر کوڈ ایک بار چلتا ہے اور 7 دن میں ختم ہو جاتا ہے۔',
  roleStaffHint: 'عملہ اشیاء شامل کر سکتا ہے، اسٹاک آمد/روانگی درج کر سکتا ہے اور رپورٹس دیکھ سکتا ہے۔',
  roleAdminHint: 'ایڈمن اس کے علاوہ اندراج حذف، اسٹاک کی درستگی، اراکین کا انتظام اور سیٹنگز بھی تبدیل کر سکتا ہے۔',
}

const dict: Record<Lang, Record<TKey, string>> = { en, ur }

export type TFn = (key: TKey, vars?: Record<string, string | number>) => string

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: TFn
  /** pick Urdu text when available in Urdu mode */
  pick: (enText: string, urText?: string | null) => string
}

const Ctx = createContext<I18n | null>(null)
const KEY = 'agri.lang'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem(KEY) === 'ur' ? 'ur' : 'en'
    } catch {
      return 'en'
    }
  })

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
    document.title = dict[lang].appName
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const t: TFn = (key, vars) => {
      let s = dict[lang][key] ?? en[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
      return s
    }
    const pick = (e: string, u?: string | null) => (lang === 'ur' && u ? u : e)
    return { lang, setLang, t, pick }
  }, [lang, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside provider')
  return v
}
