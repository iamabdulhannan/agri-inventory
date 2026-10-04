// Tests 005: prices, sales invoices, purchases, khata ledgers, roznamcha and profit.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '005_sales_khata'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-005 applied (005 twice)')

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const err = async (uid, sql, params) => { try { await as(uid, sql, params); return null } catch (e) { return e.message } }
const user = async (email, meta) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id
const J = JSON.stringify

const owner = await user('owner@shop.pk', { org_name: 'Abu Bakar Spray Center', full_name: 'Umair' })
const [org] = await as(owner, `select id from organizations`)
const [inv] = await as(owner, `insert into invites (org_id, role) values ($1, 'staff') returning code`, [org.id])
const staff = await user('staff@shop.pk', { invite_code: inv.code, full_name: 'Saad' })
const other = await user('b@other.pk', { org_name: 'Other Shop' })
const today = (await db.query(`select org_today($1) d`, [org.id])).rows[0].d.toISOString().slice(0, 10)
const d = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

// product with prices
const [cat] = await as(owner, `select id from categories where org_id=$1 and name='Insecticide'`, [org.id])
const [ema] = await as(staff, `insert into products (org_id, name, category_id, pack_size, pack_unit, purchase_price, sale_price)
                               values ($1, 'Emamectin 1.9 EC', $2, 400, 'ml', 345, 500) returning *`, [org.id, cat.id])
ok(+ema.purchase_price === 345 && +ema.sale_price === 500, 'product stores purchase rate 345 and MRP 500')

// parties
const [sup] = await as(staff, `insert into parties (org_id, kind, name, phone) values ($1, 'supplier', 'Ali Akbar Group', '0300-1111111') returning *`, [org.id])
const [cust] = await as(staff, `insert into parties (org_id, kind, name, phone, opening_balance) values ($1, 'customer', 'Muhammad Aslam', '0301-2222222', 1000) returning *`, [org.id])

// ---- purchase on partial credit: 20 x 345 = 6900, paid 4000
const pid = (await as(staff, `select record_stock_in($1,$2,'purchase',$3,null,'BILL-77',null,$4,4000) id`,
  [org.id, d(-10), J([{ product_id: ema.id, batch_no: 'E1', expiry_date: d(300), qty: 20, unit_price: 345 }]), sup.id]))[0].id
const [pur] = await as(staff, `select * from purchases where id=$1`, [pid])
ok(+pur.total === 6900 && +pur.paid === 4000 && pur.purchase_no === 1, 'purchase #1 total 6900, paid 4000')
ok(+(await as(staff, `select balance from party_balances where id=$1`, [sup.id]))[0].balance === 2900, 'supplier khata: we owe 2900')
ok(+(await as(staff, `select avg_cost from batch_stock where product_id=$1`, [ema.id]))[0].avg_cost === 345, 'batch cost = 345')
// second purchase at a higher rate into the same batch -> average cost
await as(staff, `select record_stock_in($1,$2,'purchase',$3)`, [org.id, d(-9), J([{ product_id: ema.id, batch_no: 'E1', expiry_date: d(300), qty: 10, unit_price: 360 }])])
ok(+(await as(staff, `select avg_cost from batch_stock where product_id=$1`, [ema.id]))[0].avg_cost === 350, 'average batch cost (20x345 + 10x360)/30 = 350')
ok(+(await as(staff, `select purchase_price from products where id=$1`, [ema.id]))[0].purchase_price === 360, 'product keeps latest purchase rate 360')
e = await err(staff, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,0)`, [org.id, d(-9), J([{ product_id: ema.id, batch_no: 'E1', expiry_date: d(300), qty: 1, unit_price: 360 }])])
var e
ok(e?.includes('CREDIT_NEEDS_PARTY'), 'unpaid purchase requires a supplier')

// ---- walk-in cash sale: 3 x 500 = 1500
const s1 = (await as(staff, `select record_sale($1,$2,$3,null,'Walk-in farmer') id`, [org.id, d(-5), J([{ product_id: ema.id, qty: 3, unit_price: 500 }])]))[0].id
const [sale1] = await as(staff, `select * from sales where id=$1`, [s1])
ok(sale1.invoice_no === 1 && +sale1.total === 1500 && +sale1.paid === 1500, 'invoice #1: 3 x 500 = 1500 fully paid')
const [m1] = await as(staff, `select qty, unit_price, unit_cost, reference from stock_movements where sale_id=$1`, [s1])
ok(+m1.qty === -3 && +m1.unit_price === 500 && +m1.unit_cost === 350 && m1.reference === 'INV-1', 'sale line stores rate 500 and cost 350')

// ---- credit sale to customer with discount: 4 x 500 = 2000 - 100 = 1900, paid 500
const s2 = (await as(staff, `select record_sale($1,$2,$3,$4,null,100,500) id`, [org.id, d(-2), J([{ product_id: ema.id, qty: 4, unit_price: 500 }]), cust.id]))[0].id
const [sale2] = await as(staff, `select * from sales where id=$1`, [s2])
ok(sale2.invoice_no === 2 && +sale2.subtotal === 2000 && +sale2.discount === 100 && +sale2.total === 1900 && +sale2.paid === 500, 'invoice #2: 2000 - 100 discount = 1900, received 500')
ok(+(await as(staff, `select balance from party_balances where id=$1`, [cust.id]))[0].balance === 2400, 'customer khata: 1000 opening + 1400 unpaid = 2400')

// rules
e = await err(staff, `select record_sale($1,$2,$3,null,null,0,100)`, [org.id, d(0), J([{ product_id: ema.id, qty: 1, unit_price: 500 }])])
ok(e?.includes('CREDIT_NEEDS_PARTY'), 'walk-in sale must be fully paid (credit needs a customer)')
e = await err(staff, `select record_sale($1,$2,$3,null,null,600)`, [org.id, d(0), J([{ product_id: ema.id, qty: 1, unit_price: 500 }])])
ok(e?.includes('INVALID_DISCOUNT'), 'discount larger than the bill rejected')
e = await err(staff, `select record_sale($1,$2,$3,$4,null,0,900)`, [org.id, d(0), J([{ product_id: ema.id, qty: 1, unit_price: 500 }]), cust.id])
ok(e?.includes('INVALID_PAID'), 'received more than the bill rejected')
e = await err(staff, `select record_sale($1,$2,$3)`, [org.id, d(0), J([{ product_id: ema.id, qty: 999, unit_price: 500 }])])
ok(e?.includes('INSUFFICIENT_STOCK'), 'cannot sell more than in stock')
e = await err(staff, `select record_sale($1,$2,$3,$4)`, [org.id, d(0), J([{ product_id: ema.id, qty: 1, unit_price: 500 }]), sup.id])
ok(e?.includes('INVALID_PARTY'), 'cannot sell to a supplier account')
ok((await as(staff, `select invoice_seq from organizations`))[0].invoice_seq === 2, 'failed sales do not use up invoice numbers')

// ---- khata payments
await as(staff, `select record_party_payment($1,$2,$3,1000,'Cash received')`, [org.id, cust.id, d(-1)])
await as(staff, `select record_party_payment($1,$2,$3,2900,'Cleared')`, [org.id, sup.id, d(-1)])
ok(+(await as(staff, `select balance from party_balances where id=$1`, [cust.id]))[0].balance === 1400, 'customer pays 1000 -> owes 1400')
ok(+(await as(staff, `select balance from party_balances where id=$1`, [sup.id]))[0].balance === 0, 'supplier paid 2900 -> settled')
const led = await as(staff, `select kind, bill, paid, balance from party_ledger($1)`, [cust.id])
ok(led.map((r) => r.kind).join(',') === 'opening,sale,receipt' && +led.at(-1).balance === 1400, 'customer ledger: opening 1000 -> sale 1900/500 -> receipt 1000 = 1400')

// ---- roznamcha
await as(staff, `insert into cash_entries (org_id, entry_date, kind, amount, note) values ($1,$2,'cash_in',10000,'Opening cash')`, [org.id, d(-11)])
await as(staff, `insert into cash_entries (org_id, entry_date, kind, amount, note) values ($1,$2,'expense',-300,'Tea & transport')`, [org.id, d(-1)])
const cash = await as(staff, `select * from cash_days($1,$2,$3)`, [org.id, d(-11), d(0)])
// 10000 - 4000 (purchase 1) - 3600 (purchase 2, paid in full) + 1500 + 500 (sales) + 1000 (receipt) - 2900 (supplier) - 300 (expense) = 2200
ok(+cash.at(-1).closing === 2200, 'roznamcha closing cash = 2200')
const day1 = cash.find((r) => r.day.toISOString().slice(0, 10) === d(-1))
ok(+day1.cash_in === 1000 && +day1.cash_out === 3200, 'roznamcha day: in 1000, out 3200 (supplier 2900 + expense 300)')
ok(+day1.opening === 4400 && +day1.closing === 2200, 'roznamcha day: opening 4400 -> closing 2200')

// ---- profit
const days = await as(staff, `select * from sales_days($1,$2,$3)`, [org.id, d(-30), d(0)])
const tot = days.reduce((a, r) => ({ s: a.s + +r.sales, c: a.c + +r.cost, p: a.p + +r.profit }), { s: 0, c: 0, p: 0 })
ok(tot.s === 3400 && tot.c === 2450 && tot.p === 950, 'sales 3400, cost 7 x 350 = 2450, profit 950')
const [ps] = await as(staff, `select * from product_sales($1,$2,$3)`, [org.id, d(-30), d(0)])
ok(+ps.qty === 7 && +ps.revenue === 3500 && +ps.profit === 1050, 'product report: 7 sold, revenue 3500, profit 1050 (before invoice discount)')
const [money] = await as(staff, `select * from money_summary($1,$2)`, [org.id, d(-2)])
ok(+money.today_sales === 1900 && +money.cash_in_hand === 2200 && +money.receivable === 1400 && +money.payable === 0, 'dashboard money: sales, cash in hand, receivable, payable')
ok(+money.stock_value === 23 * 350, 'stock value = 23 left x 350 = 8050')

// ---- permissions & voiding
const [line] = await as(owner, `select id from stock_movements where sale_id=$1`, [s2])
await as(owner, `delete from stock_movements where id=$1`, [line.id])
ok((await as(owner, `select count(*)::int c from stock_movements where id=$1`, [line.id]))[0].c === 1, 'a single invoice line cannot be deleted on its own')
await as(staff, `delete from sales where id=$1`, [s2])
ok((await as(owner, `select count(*)::int c from sales where id=$1`, [s2]))[0].c === 1, 'staff cannot void an invoice')
await as(owner, `delete from sales where id=$1`, [s2])
ok((await as(owner, `select count(*)::int c from stock_movements where sale_id=$1`, [s2]))[0].c === 0, 'owner voids invoice #2: its stock lines removed')
ok(+(await as(owner, `select qty from product_stock where id=$1`, [ema.id]))[0].qty === 27, 'stock back to 27')
ok(+(await as(owner, `select balance from party_balances where id=$1`, [cust.id]))[0].balance === 0, 'customer khata recalculated: 1000 - 1000 = 0')
// 30 bought, 3 sold -> sell 15 more (18 sold). Voiding the 20-unit purchase would leave -8.
await as(staff, `select record_sale($1,$2,$3)`, [org.id, d(0), J([{ product_id: ema.id, qty: 15, unit_price: 500 }])])
e = await err(owner, `delete from purchases where id=$1`, [pid])
ok(e?.includes('INSUFFICIENT_STOCK'), 'cannot void a purchase whose stock was already sold')
const [pur2] = await as(owner, `select id from purchases where purchase_no = 2`)
await as(owner, `delete from purchases where id=$1`, [pur2.id])
ok(+(await as(owner, `select qty from product_stock where id=$1`, [ema.id]))[0].qty === 2, 'voiding the 10-unit purchase is allowed: 30 - 10 - 18 = 2 left')
ok((await as(owner, `select count(*)::int c from cash_entries where purchase_id=$1`, [pur2.id]))[0].c === 0, 'its cash payment is removed from roznamcha too')

// ---- isolation
ok((await as(other, `select * from sales`)).length === 0 && (await as(other, `select * from parties`)).length === 0 && (await as(other, `select * from cash_entries`)).length === 0, 'other shop sees no sales, khata or cash')
ok((await err(other, `select record_party_payment($1,$2,$3,10)`, [org.id, cust.id, d(0)]))?.includes('NOT_ALLOWED'), 'other shop cannot post to our khata')
ok((await as(staff, `select created_by_name from sales where id=$1`, [s1]))[0].created_by_name === 'Saad', 'invoice remembers who made it')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
