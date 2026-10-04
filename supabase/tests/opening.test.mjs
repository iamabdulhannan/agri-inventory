// Tests 007: opening stock (no purchase document / cash / khata) and bulk entry.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '007_opening_stock'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-007 applied (007 twice)')

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const err = async (uid, sql, params) => { try { await as(uid, sql, params); return null } catch (e) { return e.message } }
const J = JSON.stringify
const owner = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('o@shop.pk', '{"org_name":"Shop"}') returning id`)).rows[0].id
const [org] = await as(owner, `select id from organizations`)
const [cat] = await as(owner, `select id from categories where org_id=$1 limit 1`, [org.id])
await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) select $1, 'Product ' || g, $2, 400, 'ml' from generate_series(1, 500) g`, [org.id, cat.id])
const products = await as(owner, `select id from products order by name`)

// opening stock for 500 products in one call
const lines = products.map((p, i) => ({ product_id: p.id, batch_no: 'OPEN-' + i, expiry_date: '2028-06-30', qty: 10 + (i % 5), unit_price: 300 + i }))
const t0 = Date.now()
const res = await as(owner, `select record_stock_in($1, org_today($1), 'purchase', $2, null, null, null, null, null, true) id`, [org.id, J(lines)])
const ms = Date.now() - t0
ok(res[0].id === null, 'opening stock returns no purchase document')
ok((await as(owner, `select count(*)::int c from stock_movements`))[0].c === 500, `500 lines saved in one entry (${ms} ms in-memory)`)
ok((await as(owner, `select count(*)::int c from purchases`))[0].c === 0, 'no purchase invoice created')
ok((await as(owner, `select count(*)::int c from cash_entries`))[0].c === 0, 'nothing in roznamcha (no cash out)')
ok((await as(owner, `select count(*)::int c from stock_movements where reference = 'Opening stock' and party is null`))[0].c === 500, 'entries are labelled "Opening stock"')
const [p0] = await as(owner, `select qty, stock_value, purchase_price from product_stock where id=$1`, [products[0].id])
ok(Number(p0.qty) === 10 && Number(p0.stock_value) === 3000 && Number(p0.purchase_price) === 300, 'stock 10, stock value 10 x 300, product purchase rate updated')

// sale from opening stock has the right cost / profit
const [s] = await as(owner, `select record_sale($1, org_today($1), $2) id`, [org.id, J([{ product_id: products[0].id, qty: 2, unit_price: 450 }])])
ok(Number((await as(owner, `select unit_cost from stock_movements where sale_id=$1`, [s.id]))[0].unit_cost) === 300, 'sale cost comes from the opening stock rate (300)')

// normal purchase still makes an invoice and cash entry
await as(owner, `select record_stock_in($1, org_today($1), 'purchase', $2)`, [org.id, J([{ product_id: products[1].id, batch_no: 'P1', expiry_date: '2028-06-30', qty: 5, unit_price: 400 }])])
ok((await as(owner, `select count(*)::int c from purchases`))[0].c === 1 && (await as(owner, `select count(*)::int c from cash_entries where kind='purchase'`))[0].c === 1, 'normal purchase still creates an invoice and cash entry')

// rules
let e = await err(owner, `select record_stock_in($1, org_today($1), 'return_in', $2, null, null, null, null, null, true)`, [org.id, J([{ product_id: products[2].id, expiry_date: '2028-06-30', qty: 1 }])])
ok(e?.includes('INVALID_TYPE'), 'opening stock only for stock-in, not returns')
e = await err(owner, `select record_stock_in($1, org_today($1), 'purchase', $2, null, null, null, null, null, true)`, [org.id, J([{ product_id: products[0].id, batch_no: 'OPEN-0', expiry_date: '2029-01-01', qty: 1 }])])
ok(e?.includes('BATCH_EXPIRY_MISMATCH'), 'existing batch with a different expiry is rejected')
const before = (await as(owner, `select count(*)::int c from stock_movements`))[0].c
e = await err(owner, `select record_stock_in($1, org_today($1), 'purchase', $2, null, null, null, null, null, true)`, [org.id, J([
  { product_id: products[3].id, batch_no: 'X1', expiry_date: '2028-06-30', qty: 3 },
  { product_id: products[4].id, batch_no: 'X2', expiry_date: '2028-06-30', qty: 0 }])])
ok(e?.includes('INVALID_QTY') && (await as(owner, `select count(*)::int c from stock_movements`))[0].c === before, 'one bad line rejects the whole entry (nothing half-saved)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
