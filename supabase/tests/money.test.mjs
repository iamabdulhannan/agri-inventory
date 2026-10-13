// Tests 013: bank accounts, cheques, bank facilities, credit sales and crop advances.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'node:fs'

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(`
  create schema extensions; create extension pgcrypto schema extensions;
  create role anon nologin; create role authenticated nologin; create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text,
                           raw_user_meta_data jsonb default '{}', updated_at timestamptz);
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade);
  create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255));
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
`)
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '010_loose_sale', '011_precise_qty', '012_audit', '013_money', '014_sale_due_date', '013_money', '014_sale_due_date'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-013 applied (013 twice)')

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const err = async (uid, sql, params) => { try { await as(uid, sql, params); return null } catch (e) { return e.message } }
const J = JSON.stringify, N = Number
const user = async (email, meta) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id
const owner = await user('o@shop.pk', { org_name: 'Shop', full_name: 'Umair' })
const [org] = await as(owner, `select id from organizations`)
const [inv] = await as(owner, `insert into invites (org_id, role) values ($1, 'staff') returning code`, [org.id])
const staff = await user('s@shop.pk', { invite_code: inv.code })
const [inv2] = await as(owner, `insert into invites (org_id, role) values ($1, 'admin') returning code`, [org.id])
const admin = await user('a@shop.pk', { invite_code: inv2.code, full_name: 'Ali' })
const [cat] = await as(owner, `select id from categories where org_id=$1 limit 1`, [org.id])
const [p] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Bectal',$2,200,'ml') returning id`, [org.id, cat.id])
const [p2] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Karant',$2,500,'ml') returning id`, [org.id, cat.id])
const [sup] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'supplier','Starco') returning id`, [org.id])
const today = (await db.query(`select org_today($1) d`, [org.id])).rows[0].d.toISOString().slice(0, 10)
const stock = async (id) => N((await as(owner, `select qty from product_stock where id=$1`, [id]))[0].qty)
const bal = async (id) => N((await as(owner, `select balance from party_balances where id=$1`, [id]))[0].balance)
const cash = async () => N((await as(owner, `select coalesce(sum(amount),0) s from cash_entries`))[0].s)



const pos = async () => (await as(owner, `select money_position($1) p`, [org.id]))[0].p
const acct = async (id) => (await pos()).accounts.find((a) => a.id === id)?.balance
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p.id, batch_no: 'B1', expiry_date: '2029-01-01', qty: 500, unit_price: 100 }])])
const [cus] = await as(owner, `insert into parties (org_id, kind, name, due_rule) values ($1,'customer','Farmer Ali','date:12-31') returning id`, [org.id])

// ---- accounts ----
let e = await err(staff, `insert into money_accounts (org_id, kind, name) values ($1,'bank','X')`, [org.id])
ok(!!e, 'staff cannot add a bank account')
const [hbl] = await as(owner, `insert into money_accounts (org_id, kind, name, bank_name, opening_balance) values ($1,'bank','HBL Current','HBL',10000) returning id`, [org.id])
const [ep] = await as(admin, `insert into money_accounts (org_id, kind, name) values ($1,'wallet','Easypaisa') returning id`, [org.id])
ok(N(await acct(hbl.id)) === 10000, 'HBL opening balance 10,000')

// sale paid into HBL: bank goes up, cash in hand does not
await as(staff, `select record_sale($1,$2,$3,null,null,0,null,null,0,null,$4)`, [org.id, today, J([{ product_id: p.id, qty: 2, unit_price: 150 }]), hbl.id])
ok(N(await acct(hbl.id)) === 10300 && N((await pos()).cash) === 0, 'sale paid by bank transfer: HBL 10,300, cash 0')
const [ms] = await as(owner, `select cash_in_hand from money_summary($1,$2)`, [org.id, today])
ok(N(ms.cash_in_hand) === 0, 'dashboard cash in hand counts cash only')

// transfer cash -> bank
await as(owner, `insert into cash_entries (org_id, entry_date, kind, amount, note) values ($1,$2,'cash_in',5000,'Opening cash')`, [org.id, today])
await as(staff, `select record_transfer($1,$2,null,$3,2000,'Deposit')`, [org.id, today, hbl.id])
ok(N((await pos()).cash) === 3000 && N(await acct(hbl.id)) === 12300, 'deposit 2,000 cash to HBL: cash 3,000, HBL 12,300')
const cd = await as(owner, `select * from cash_days($1,$2,$2,$3)`, [org.id, today, hbl.id])
ok(N(cd[0].opening) === 10000 && N(cd[0].closing) === 12300, 'HBL cash book: opening 10,000 (account opening), closing 12,300')
const [tr] = await as(owner, `select transfer_id from cash_entries where transfer_id is not null limit 1`)
await as(owner, `delete from cash_entries where transfer_id = $1 and amount < 0`, [tr.transfer_id])
ok(N((await pos()).cash) === 5000 && N(await acct(hbl.id)) === 10300, 'deleting one side of a transfer removes both')

// ---- credit sale with due date, credit markup ----
// 10 x 150 = 1500, markup 150 (10%), nothing received -> khata 1650, due 31 Dec
const s1 = (await as(owner, `select record_sale($1,$2,$3,$4,null,0,0,null,150,'2026-12-31') id`, [org.id, today, J([{ product_id: p.id, qty: 10, unit_price: 150 }]), cus.id]))[0].id
const [s1r] = await as(owner, `select total, markup, due_date from sales where id=$1`, [s1])
ok(N(s1r.total) === 1650 && N(s1r.markup) === 150 && s1r.due_date.toISOString().startsWith('2026-12-31'), 'credit sale: total 1,650 incl. 150 markup, due 31 Dec')
ok(await bal(cus.id) === 1650, 'khata 1,650')
const s2 = (await as(owner, `select record_sale($1,$2,$3,$4,null,0,0,null,0,'2026-11-15') id`, [org.id, today, J([{ product_id: p.id, qty: 2, unit_price: 200 }]), cus.id]))[0].id
const s3 = (await as(owner, `select record_sale($1,$2,$3,$4,null,0,null,null,0,'2026-11-01') id`, [org.id, today, J([{ product_id: p.id, qty: 1, unit_price: 200 }]), cus.id]))[0].id
ok((await as(owner, `select due_date from sales where id=$1`, [s3]))[0].due_date === null, 'fully paid sale gets no due date')
let dues = await as(owner, `select sale_id, outstanding from customer_dues($1) where party_id=$2 order by sale_date, invoice_no`, [org.id, cus.id])
ok(dues.length === 2 && N(dues[0].outstanding) === 1650 && N(dues[1].outstanding) === 400, 'dues: 1,650 + 400 outstanding')
await as(owner, `select record_party_payment($1,$2,$3,1000,'part',$4)`, [org.id, cus.id, today, ep.id])
dues = await as(owner, `select sale_id, outstanding from customer_dues($1) where party_id=$2 order by sale_date, invoice_no`, [org.id, cus.id])
ok(N(dues[0].outstanding) === 650 && N(dues[1].outstanding) === 400 && N(await acct(ep.id)) === 1000, 'payment of 1,000 via Easypaisa clears the oldest bill first (650 + 400 left)')

// ---- cheques ----
const chq = (await as(staff, `select record_cheque($1,'received',$2,600,'2026-12-20','445566','MCB') id`, [org.id, cus.id]))[0].id
ok(await bal(cus.id) === 1050 && N((await pos()).cheques_in_hand) === 600, 'post-dated cheque 600: khata unchanged until it clears')
e = await err(staff, `select set_cheque_status($1,$2,'cleared',$3)`, [org.id, chq, today])
ok(e?.includes('INVALID_ACCOUNT'), 'clearing needs the bank account it went into')
await as(staff, `select set_cheque_status($1,$2,'cleared',$3,$4)`, [org.id, chq, today, hbl.id])
ok(await bal(cus.id) === 450 && N(await acct(hbl.id)) === 10900, 'cheque cleared into HBL: khata 450, HBL 10,900')
e = await err(staff, `select set_cheque_status($1,$2,'pending')`, [org.id, chq])
ok(e?.includes('NOT_ALLOWED'), 'only owner/admin can undo a cleared cheque')
await as(owner, `select set_cheque_status($1,$2,'pending')`, [org.id, chq])
ok(await bal(cus.id) === 1050 && N(await acct(hbl.id)) === 10300, 'undo: khata 1,050 again, HBL 10,300')
await as(owner, `select set_cheque_status($1,$2,'bounced',$3)`, [org.id, chq, today])
ok(await bal(cus.id) === 1050 && N((await pos()).cheques_in_hand) === 0, 'bounced cheque: khata stays 1,050')

// ---- bank finance: bank pays the company, we repay at year end ----
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,'B-77',null,$4,0)`, [org.id, today, J([{ product_id: p2.id, batch_no: 'F1', expiry_date: '2029-01-01', qty: 100, unit_price: 500 }]), sup.id])
ok(await bal(sup.id) === 50000, 'company bill 50,000 on credit')
const [fin] = await as(owner, `insert into bank_facilities (org_id, kind, bank_name, title, limit_amount, expiry_date, account_id) values ($1,'finance','HBL','Running finance',500000,'2026-12-31',$2) returning id`, [org.id, hbl.id])
e = await err(staff, `select facility_drawdown($1,$2,$3,50000,$4)`, [org.id, fin.id, today, sup.id])
ok(e?.includes('NOT_ALLOWED'), 'staff cannot record bank finance')
await as(owner, `select facility_drawdown($1,$2,$3,50000,$4,'Bank paid Starco')`, [org.id, fin.id, today, sup.id])
ok(await bal(sup.id) === 0 && N((await pos()).bank_owed) === 50000, 'bank paid the company: company dues 0, we owe HBL 50,000')
const led = await as(owner, `select kind, paid from party_ledger($1) where kind = 'bank_paid'`, [sup.id])
ok(led.length === 1 && N(led[0].paid) === 50000, 'company khata shows "paid by bank"')
e = await err(owner, `select facility_repay($1,$2,$3,60000,0,$4)`, [org.id, fin.id, today, hbl.id])
ok(e?.includes('REPAY_TOO_MUCH'), 'cannot repay more than owed')
await as(owner, `select facility_repay($1,$2,$3,30000,2500,$4,'Dec')`, [org.id, fin.id, today, hbl.id])
const fsum = (await as(owner, `select * from facility_summary($1) where facility_id = $2`, [org.id, fin.id]))[0]
ok(N(fsum.owed) === 20000 && N(fsum.markup_paid) === 2500, 'repaid 30,000 + markup 2,500: still owe 20,000')
ok(N(await acct(hbl.id)) === 10300 - 32500, 'HBL down by 32,500')
const yr = (await as(owner, `select year_report($1,'2026-07-01','2027-06-30') r`, [org.id]))[0].r
ok(N(yr.expenses) === 2500 && N(yr.bank_owed) === 20000, 'markup is an expense in the year report; bank owed 20,000')

// guarantee: covers what we owe the company
const [gt] = await as(owner, `insert into bank_facilities (org_id, kind, bank_name, limit_amount, expiry_date, party_id) values ($1,'guarantee','Meezan',100000,'2027-03-31',$2) returning id`, [org.id, sup.id])
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,'B-78',null,$4,0)`, [org.id, today, J([{ product_id: p2.id, batch_no: 'F2', expiry_date: '2029-01-01', qty: 50, unit_price: 500 }]), sup.id])
const g = (await as(owner, `select guarantee_used from facility_summary($1) where facility_id = $2`, [org.id, gt.id]))[0]
ok(N(g.guarantee_used) === 25000, 'guarantee in use: 25,000 owed to the company')

// ---- crop advance (separate from khata) ----
const [far] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'customer','Potato farmer') returning id`, [org.id])
const adv = (await as(staff, `select open_crop_advance($1,$2,'Potato','2026',$3,20000) id`, [org.id, far.id, today]))[0].id
ok(await bal(far.id) === 0 && N((await pos()).crop_advances) === 20000 && N((await pos()).cash) === 25200, 'advance 20,000 in cash: khata untouched, cash 5,200 -> 25,200')
const a1 = (await as(staff, `select record_sale($1,$2,$3,$4,null,0,0,null,0,null,null,$5,15000) id`, [org.id, today, J([{ product_id: p.id, qty: 100, unit_price: 150 }]), far.id, adv]))[0].id
ok(await bal(far.id) === 0 && N((await as(owner, `select advance_balance($1) b`, [adv]))[0].b) === 5000, 'sale 15,000 from advance: khata 0, advance 5,000 left')
e = await err(staff, `select record_sale($1,$2,$3,$4,null,0,0,null,0,null,null,$5,6000)`, [org.id, today, J([{ product_id: p.id, qty: 100, unit_price: 150 }]), far.id, adv])
ok(e?.includes('ADVANCE_TOO_MUCH'), 'cannot use more than is left in the advance')
await as(staff, `select record_sale($1,$2,$3,$4,null,0,0,null,0,'2026-12-31',null,$5,5000)`, [org.id, today, J([{ product_id: p.id, qty: 50, unit_price: 160 }]), far.id, adv])
ok(await bal(far.id) === 3000 && N((await as(owner, `select advance_balance($1) b`, [adv]))[0].b) === 0, 'sale 8,000: 5,000 from advance + 3,000 on khata')
await as(owner, `select advance_move($1,$2,'deposit',$3,10000,$4)`, [org.id, adv, today, hbl.id])
await as(owner, `select advance_move($1,$2,'to_khata',$3,4000)`, [org.id, adv, today])
ok(await bal(far.id) === -1000, 'moved 4,000 of the advance to khata: khata -1,000 (advance there)')
await as(owner, `select advance_move($1,$2,'refund',$3,1000)`, [org.id, adv, today])
const [ab] = await as(owner, `select deposited, used, refunded, moved_to_khata, balance from crop_advance_balances where id = $1`, [adv])
ok(N(ab.deposited) === 30000 && N(ab.used) === 20000 && N(ab.refunded) === 1000 && N(ab.moved_to_khata) === 4000 && N(ab.balance) === 5000, 'advance: 30,000 in, 20,000 used, 1,000 refunded, 4,000 to khata, 5,000 left')
e = await err(owner, `select advance_move($1,$2,'refund',$3,9000)`, [org.id, adv, today])
ok(e?.includes('ADVANCE_TOO_MUCH'), 'cannot refund more than is left')
await as(owner, `delete from sales where id = $1`, [a1])
ok(N((await as(owner, `select advance_balance($1) b`, [adv]))[0].b) === 20000, 'voiding the invoice puts 15,000 back in the advance')
const led2 = await as(owner, `select kind from party_ledger($1)`, [far.id])
ok(led2.some((r) => r.kind === 'advance_moved'), 'khata shows the advance moved in')

// ---- 014: set / change the due date of a credit invoice ----
await as(staff, `select set_sale_due_date($1,$2,'2027-01-15')`, [org.id, s2])
ok((await as(owner, `select due_date from customer_dues($1) where sale_id = $2`, [org.id, s2]))[0].due_date.toISOString().startsWith('2027-01-15'), 'due date of an invoice changed to 15 Jan')
await as(staff, `select set_sale_due_date($1,$2,null)`, [org.id, s2])
ok((await as(owner, `select due_date from sales where id = $1`, [s2]))[0].due_date === null, 'due date removed')
ok((await as(owner, `select count(*)::int c from audit_log where table_name = 'sales' and old_data->>'due_date' is not null`))[0].c >= 1, 'due date changes are in the audit trail')

// ---- lock + audit cover the new records ----
const pos2 = await pos()
ok(N(pos2.dues_overdue) === 0 && N(pos2.dues_next_30) >= 0, 'money position: dues figures present')
await as(owner, `select set_locked_until($1, $2)`, [org.id, '2026-01-01'])
e = await err(owner, `select open_crop_advance($1,$2,'Wheat','2025','2025-12-01',100)`, [org.id, far.id])
ok(e?.includes('PERIOD_LOCKED'), 'no advance entries in a locked year')
ok((await as(owner, `select count(*)::int c from audit_log where table_name in ('cheques', 'money_accounts', 'advance_entries', 'facility_entries')`))[0].c > 0, 'audit trail records cheque and advance changes')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
