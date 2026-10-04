// Tests 008: editing purchases and single stock-in lines.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '008_edit_stock_in'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-008 applied (008 twice)')

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
const staff = await user('s@shop.pk', { invite_code: inv.code, full_name: 'Saad' })
const [cat] = await as(owner, `select id from categories where org_id=$1 limit 1`, [org.id])
const [p] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Bectal',$2,400,'ml') returning id`, [org.id, cat.id])
const [p2] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Karant',$2,500,'ml') returning id`, [org.id, cat.id])
const [sup] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'supplier','Starco') returning id`, [org.id])
const [sup2] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'supplier','DJC') returning id`, [org.id])
const today = (await db.query(`select org_today($1) d`, [org.id])).rows[0].d.toISOString().slice(0, 10)
const d = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
const stock = async (pid) => N((await as(owner, `select qty from product_stock where id=$1`, [pid]))[0].qty)
const bal = async (id) => N((await as(owner, `select balance from party_balances where id=$1`, [id]))[0].balance)
const cash = async () => N((await as(owner, `select coalesce(sum(amount),0) s from cash_entries`))[0].s)

// staff enters a purchase with a mistake: 20 instead of 12, paid 5000
const pid = (await as(staff, `select record_stock_in($1,$2,'purchase',$3,null,'BILL-1',null,$4,5000) id`, [org.id, d(-5), J([{ product_id: p.id, batch_no: 'B1', expiry_date: '2028-06-30', qty: 20, unit_price: 650 }]), sup.id]))[0].id
ok(await stock(p.id) === 20 && await bal(sup.id) === 8000 && await cash() === -5000, 'before: stock 20, Starco khata 8000 (13000 - 5000), cash -5000')

// permissions
let e = await err(staff, `select update_purchase($1,$2,$3,$4,null,'BILL-1',null,$5,5000)`, [org.id, pid, d(-5), J([{ product_id: p.id, batch_no: 'B1', expiry_date: '2028-06-30', qty: 12, unit_price: 650 }]), sup.id])
ok(e?.includes('NOT_ALLOWED'), 'staff cannot edit a purchase')

// owner fixes: qty 12, rate 640, add a second line, paid 6000
await as(owner, `select update_purchase($1,$2,$3,$4,null,'BILL-1A','fixed qty',$5,6000)`, [org.id, pid, d(-4), J([
  { product_id: p.id, batch_no: 'B1', expiry_date: '2028-06-30', qty: 12, unit_price: 640 },
  { product_id: p2.id, batch_no: 'K1', expiry_date: '2028-01-31', qty: 5, unit_price: 500 }]), sup.id])
const [pur] = await as(owner, `select * from purchases where id=$1`, [pid])
ok(N(pur.total) === 12 * 640 + 2500 && N(pur.paid) === 6000 && pur.reference === 'BILL-1A' && pur.purchase_date.toISOString().slice(0, 10) === d(-4), 'purchase updated: total 10180, paid 6000, new bill no. and date')
ok(await stock(p.id) === 12 && await stock(p2.id) === 5, 'stock now Bectal 12, Karant 5')
ok(await bal(sup.id) === 4180 && await cash() === -6000, 'khata 10180 - 6000 = 4180, roznamcha cash -6000')
ok((await as(owner, `select count(*)::int c from purchases`))[0].c === 1, 'still one purchase (edited, not duplicated)')
ok((await as(owner, `select distinct created_by_name n from stock_movements where purchase_id=$1`, [pid])).map((r) => r.n).join() === 'Saad', 'lines keep the original "By" (Saad)')
ok(N((await as(owner, `select purchase_price from products where id=$1`, [p.id]))[0].purchase_price) === 640, 'product purchase rate follows the edit (640)')

// change supplier to DJC
await as(owner, `select update_purchase($1,$2,$3,$4,null,'BILL-1A',null,$5,6000)`, [org.id, pid, d(-4), J([
  { product_id: p.id, batch_no: 'B1', expiry_date: '2028-06-30', qty: 12, unit_price: 640 },
  { product_id: p2.id, batch_no: 'K1', expiry_date: '2028-01-31', qty: 5, unit_price: 500 }]), sup2.id])
ok(await bal(sup.id) === 0 && await bal(sup2.id) === 4180, 'moving the purchase to another supplier moves the khata amount')

// sell 10, then try to cut the purchase to 8 -> blocked, nothing changed
await as(owner, `select record_sale($1,$2,$3)`, [org.id, d(0), J([{ product_id: p.id, qty: 10, unit_price: 800 }])])
e = await err(owner, `select update_purchase($1,$2,$3,$4,null,'BILL-1A',null,$5,6000)`, [org.id, pid, d(-4), J([
  { product_id: p.id, batch_no: 'B1', expiry_date: '2028-06-30', qty: 8, unit_price: 640 },
  { product_id: p2.id, batch_no: 'K1', expiry_date: '2028-01-31', qty: 5, unit_price: 500 }]), sup2.id])
ok(e?.includes('INSUFFICIENT_STOCK'), 'cannot reduce below what is already sold (10 sold, 8 asked)')
ok(await stock(p.id) === 2 && N((await as(owner, `select total from purchases where id=$1`, [pid]))[0].total) === 10180, 'failed edit changed nothing')
e = await err(owner, `select update_purchase($1,$2,$3,$4,null,'BILL-1A',null,$5,6000)`, [org.id, pid, d(-4), J([
  { product_id: p.id, batch_no: 'B1', expiry_date: '2029-06-30', qty: 12, unit_price: 640 },
  { product_id: p2.id, batch_no: 'K1', expiry_date: '2028-01-31', qty: 5, unit_price: 500 }]), sup2.id])
ok(e?.includes('BATCH_EXPIRY_MISMATCH'), 'cannot change the expiry of a batch that already has sales')
// unsold Karant: change its batch expiry -> allowed; remove it -> its empty batch is cleaned up
await as(owner, `select update_purchase($1,$2,$3,$4,null,'BILL-1A',null,$5,6000)`, [org.id, pid, d(-4), J([
  { product_id: p.id, batch_no: 'B1', expiry_date: '2028-06-30', qty: 12, unit_price: 640 },
  { product_id: p2.id, batch_no: 'K1', expiry_date: '2028-03-31', qty: 5, unit_price: 500 }]), sup2.id])
ok((await as(owner, `select expiry_date from batches where batch_no='K1'`))[0].expiry_date.toISOString().slice(0, 10) === '2028-03-31', 'expiry of an unsold batch can be corrected')
await as(owner, `select update_purchase($1,$2,$3,$4,null,'BILL-1A',null,$5,0)`, [org.id, pid, d(-4), J([
  { product_id: p.id, batch_no: 'B1', expiry_date: '2028-06-30', qty: 12, unit_price: 640 }]), sup2.id])
ok((await as(owner, `select count(*)::int c from batches where batch_no='K1'`))[0].c === 0 && await stock(p2.id) === 0, 'removed line: stock gone and its empty batch cleaned up')
ok(await bal(sup2.id) === 7680 && await cash() === 8000, 'paid 0 -> full 7680 on DJC khata; cash back to just the sale (8000)')

// single opening-stock line
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, d(-3), J([{ product_id: p2.id, batch_no: 'OP-1', expiry_date: '2028-09-30', qty: 50, unit_price: 480 }])])
const [line] = await as(owner, `select id from stock_movements where reference='Opening stock'`)
e = await err(staff, `select edit_stock_in_line($1,$2,$3,30,480,'OP-1','2028-09-30')`, [org.id, line.id, d(-3)])
ok(e?.includes('NOT_ALLOWED'), 'staff cannot edit a line')
await as(owner, `select edit_stock_in_line($1,$2,$3,30,470,'OP-1','2028-10-31',null,'recounted')`, [org.id, line.id, d(-2)])
const [l2] = await as(owner, `select m.qty, m.unit_price, m.movement_date, m.note, b.batch_no, b.expiry_date from stock_movements m join batches b on b.id=m.batch_id where m.id=$1`, [line.id])
ok(N(l2.qty) === 30 && N(l2.unit_price) === 470 && l2.expiry_date.toISOString().slice(0, 10) === '2028-10-31' && l2.note === 'recounted', 'opening-stock line: qty 50 -> 30, rate, expiry and note changed')
ok(await stock(p2.id) === 30 && await cash() === 8000, 'stock 30, no cash effect')
await as(owner, `select edit_stock_in_line($1,$2,$3,30,470,'OP-2','2028-10-31')`, [org.id, line.id, d(-2)])
ok((await as(owner, `select count(*)::int c from batches where batch_no='OP-1'`))[0].c === 0 && (await as(owner, `select count(*)::int c from batches where batch_no='OP-2'`))[0].c === 1, 'renaming the batch moves the line and removes the empty old batch')
// a line that belongs to a purchase must be edited through the purchase
const [pl] = await as(owner, `select id from stock_movements where purchase_id=$1 limit 1`, [pid])
e = await err(owner, `select edit_stock_in_line($1,$2,$3,1,1,'B1','2028-06-30')`, [org.id, pl.id, d(0)])
ok(e?.includes('EDIT_VIA_INVOICE'), 'purchase lines are edited through the purchase, not one by one')
// sold-from line cannot be reduced below sales
await as(owner, `select record_sale($1,$2,$3)`, [org.id, d(0), J([{ product_id: p2.id, qty: 25, unit_price: 600 }])])
e = await err(owner, `select edit_stock_in_line($1,$2,$3,20,470,'OP-2','2028-10-31')`, [org.id, line.id, d(-2)])
ok(e?.includes('INSUFFICIENT_STOCK') && await stock(p2.id) === 5, 'opening line cannot go below what was sold (25 sold, 20 asked)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
