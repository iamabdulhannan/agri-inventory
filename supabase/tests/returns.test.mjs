// Tests 006: customer returns against a sale invoice.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '006_sale_returns'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-006 applied (006 twice)')

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const err = async (uid, sql, params) => { try { await as(uid, sql, params); return null } catch (e) { return e.message } }
const user = async (email, meta) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id
const J = JSON.stringify
const num = (v) => Number(v)

const owner = await user('owner@shop.pk', { org_name: 'Hannan Agro', full_name: 'Umair' })
const [org] = await as(owner, `select id from organizations`)
const [inv] = await as(owner, `insert into invites (org_id, role) values ($1, 'staff') returning code`, [org.id])
const staff = await user('staff@shop.pk', { invite_code: inv.code, full_name: 'Saad' })
const other = await user('x@other.pk', { org_name: 'Other' })
const today = (await db.query(`select org_today($1) d`, [org.id])).rows[0].d.toISOString().slice(0, 10)
const d = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

const [cat] = await as(owner, `select id from categories where org_id=$1 and name='Insecticide'`, [org.id])
const [ema] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit, purchase_price, sale_price) values ($1,'Emamectin',$2,400,'ml',345,500) returning id`, [org.id, cat.id])
const [cust] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'customer','Hannan') returning id`, [org.id])
// two batches so the sale spans both (FEFO)
await as(owner, `select record_stock_in($1,$2,'purchase',$3)`, [org.id, d(-20), J([
  { product_id: ema.id, batch_no: 'A', expiry_date: d(100), qty: 3, unit_price: 345 },
  { product_id: ema.id, batch_no: 'B', expiry_date: d(400), qty: 10, unit_price: 345 }])])

// credit sale to Hannan: 5 x 500 = 2500 - 100 discount = 2400, received 400 -> owes 2000
const sale = (await as(staff, `select record_sale($1,$2,$3,$4,null,100,400) id`, [org.id, d(-5), J([{ product_id: ema.id, qty: 5, unit_price: 500 }]), cust.id]))[0].id
const rr = await as(staff, `select * from sale_returnable($1)`, [sale])
ok(rr.length === 2 && num(rr[0].sold) === 3 && num(rr[1].sold) === 2 && num(rr[0].rate) === 500, 'invoice shows returnable lines per batch (A: 3, B: 2) at rate 500')
ok(num((await as(staff, `select balance from party_balances where id=$1`, [cust.id]))[0].balance) === 2000, 'Hannan owes 2000 before return')

// partial return of 2 from batch A, credited to khata (default for khata customer)
const batchA = rr.find((r) => r.batch_no === 'A').batch_id
const batchB = rr.find((r) => r.batch_no === 'B').batch_id
const ret1 = (await as(staff, `select record_sale_return($1,$2,$3,$4) id`, [org.id, sale, d(-2), J([{ batch_id: batchA, qty: 2 }])]))[0].id
const [r1] = await as(staff, `select * from sale_returns where id=$1`, [ret1])
ok(num(r1.total) === 960 && num(r1.refund) === 0, 'return value 2 x 500 x (2400/2500) = 960, credited to khata (no cash)')
ok(num((await as(staff, `select balance from party_balances where id=$1`, [cust.id]))[0].balance) === 1040, 'Hannan now owes 2000 - 960 = 1040')
const stockA = await as(staff, `select qty from batch_stock where id=$1`, [batchA])
ok(num(stockA[0].qty) === 2, 'stock went back into batch A (0 -> 2)')
const led = await as(staff, `select kind, bill, paid, balance from party_ledger($1)`, [cust.id])
ok(led.at(-1).kind === 'return' && num(led.at(-1).paid) === 960 && num(led.at(-1).balance) === 1040, 'khata ledger shows the return line')

// limits
let e = await err(staff, `select record_sale_return($1,$2,$3,$4)`, [org.id, sale, d(0), J([{ batch_id: batchA, qty: 2 }])])
ok(e?.includes('RETURN_TOO_MUCH'), 'cannot return more than sold (only 1 left from batch A)')
const [p2] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Other',$2,1,'l') returning id`, [org.id, cat.id])
e = await err(staff, `select record_sale_return($1,$2,$3,$4)`, [org.id, sale, d(0), J([{ batch_id: '00000000-0000-0000-0000-000000000000', qty: 1 }])])
ok(e?.includes('INVALID_RETURN_LINE'), 'cannot return an item that was not on the invoice')
e = await err(staff, `select record_sale_return($1,$2,$3,$4)`, [org.id, sale, d(-6), J([{ batch_id: batchA, qty: 1 }])])
ok(e?.includes('INVALID_DATE'), 'return date cannot be before the sale')
e = await err(other, `select record_sale_return($1,$2,$3,$4)`, [org.id, sale, d(0), J([{ batch_id: batchA, qty: 1 }])])
ok(e?.includes('NOT_ALLOWED'), 'other shop cannot return our invoice')

// second return with cash refund: 1 from A + 2 from B = 3 x 480 = 1440, refund 500 in cash
const ret2 = (await as(staff, `select record_sale_return($1,$2,$3,$4,500,'Leaking bottles') id`, [org.id, sale, d(0), J([{ batch_id: batchA, qty: 1 }, { batch_id: batchB, qty: 2 }])]))[0].id
const [r2] = await as(staff, `select * from sale_returns where id=$1`, [ret2])
ok(num(r2.total) === 1440 && num(r2.refund) === 500, 'second return 1440, refund 500 cash')
ok(num((await as(staff, `select balance from party_balances where id=$1`, [cust.id]))[0].balance) === 100, 'khata: 1040 - (1440 - 500) = 100')
ok((await as(staff, `select remaining from sale_returnable($1)`, [sale])).every((r) => num(r.remaining) === 0), 'everything on the invoice is now returned')
const cash = await as(staff, `select kind, amount from cash_entries where return_id=$1`, [ret2])
ok(cash.length === 1 && cash[0].kind === 'cash_out' && num(cash[0].amount) === -500, 'refund appears in roznamcha as cash out 500')

// profit net of returns: sold 2400 (cost 5 x 345 = 1725) all returned -> 0
const days = await as(staff, `select * from sales_days($1,$2,$3)`, [org.id, d(-30), d(0)])
const t = days.reduce((a, x) => ({ s: a.s + num(x.sales), c: a.c + num(x.cost), p: a.p + num(x.profit), r: a.r + num(x.received) }), { s: 0, c: 0, p: 0, r: 0 })
ok(t.s === 0 && t.c === 0 && t.p === 0, 'fully returned sale: sales, cost and profit net to 0')
ok(t.r === -100, 'received 400 - refunded 500 = -100 net cash for this customer')
const ps = await as(staff, `select * from product_sales($1,$2,$3)`, [org.id, d(-30), d(0)])
ok(ps.length === 1 && num(ps[0].qty) === 0, 'product report: 5 sold - 5 returned = 0')
ok(num((await as(staff, `select qty from product_stock where id=$1`, [ema.id]))[0].qty) === 13, 'all 13 bottles back in stock')

// walk-in sale return must be refunded in cash
const s2 = (await as(staff, `select record_sale($1,$2,$3) id`, [org.id, d(0), J([{ product_id: ema.id, qty: 1, unit_price: 500 }])]))[0].id
const [b2] = await as(staff, `select batch_id from sale_returnable($1)`, [s2])
e = await err(staff, `select record_sale_return($1,$2,$3,$4,0)`, [org.id, s2, d(0), J([{ batch_id: b2.batch_id, qty: 1 }])])
ok(e?.includes('CREDIT_NEEDS_PARTY'), 'walk-in return cannot be left on credit')
const ret3 = (await as(staff, `select record_sale_return($1,$2,$3,$4) id`, [org.id, s2, d(0), J([{ batch_id: b2.batch_id, qty: 1 }])]))[0].id
ok(num((await as(staff, `select refund from sale_returns where id=$1`, [ret3]))[0].refund) === 500, 'walk-in return refunds 500 by default')

// permissions and voiding
const [line] = await as(owner, `select id from stock_movements where return_id=$1`, [ret3])
await as(owner, `delete from stock_movements where id=$1`, [line.id])
ok((await as(owner, `select count(*)::int c from stock_movements where id=$1`, [line.id]))[0].c === 1, 'a single return line cannot be deleted on its own')
await as(staff, `delete from sales where id=$1`, [sale])
ok((await as(owner, `select count(*)::int c from sales where id=$1`, [sale]))[0].c === 1, 'staff cannot void')
await as(owner, `delete from sales where id=$1`, [sale])
ok((await as(owner, `select count(*)::int c from sale_returns where sale_id=$1`, [sale]))[0].c === 0, 'voiding the invoice removes its returns too')
ok(num((await as(owner, `select qty from product_stock where id=$1`, [ema.id]))[0].qty) === 13, 'stock stays correct after voiding (13)')
ok(num((await as(owner, `select balance from party_balances where id=$1`, [cust.id]))[0].balance) === 0, 'Hannan khata back to 0')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
