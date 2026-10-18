// Tests 018: sales follow corrected purchase rates.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '010_loose_sale', '011_precise_qty', '012_audit', '013_money', '014_sale_due_date', '015_investments', '016_receipt_note', '017_correct_sale_rates', '018_refresh_sale_costs', '018_refresh_sale_costs'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-018 applied (018 twice)')

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





const profit = async (pid) => (await as(owner, `select * from product_sales($1,'2000-01-01',$2) where product_id = $3`, [org.id, today, pid]))[0]
const costOf = async (sid) => N((await as(owner, `select unit_cost from stock_movements where sale_id = $1 limit 1`, [sid]))[0].unit_cost)

// purchase entered by mistake at 1,600 per bag (should be 60,000), then 0.2 bag sold at 64,000
const pur = (await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,'B-9',null,$4,0) id`, [org.id, today, J([{ product_id: p.id, batch_no: 'S1', expiry_date: '2029-01-01', qty: 10, unit_price: 1600 }]), sup.id]))[0].id
const s1 = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p.id, qty: 0.2, unit_price: 64000 }])]))[0].id
let pr = await profit(p.id)
ok(N(pr.cost) === 320 && N(pr.profit) === 12480, 'wrong rate: cost 320, profit 12,480 (the bug)')

// correct the purchase with Edit purchase
await as(owner, `select update_purchase($1,$2,$3,$4,null,'B-9',null,$5,0)`, [org.id, pur, today, J([{ product_id: p.id, batch_no: 'S1', expiry_date: '2029-01-01', qty: 10, unit_price: 60000 }]), sup.id])
pr = await profit(p.id)
ok(await costOf(s1) === 60000 && N(pr.cost) === 12000 && N(pr.profit) === 800, 'after Edit purchase: cost 12,000, profit 800')

// a new delivery of the same batch at another price does NOT rewrite the old sale
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,'B-10',null,$4,0)`, [org.id, today, J([{ product_id: p.id, batch_no: 'S1', expiry_date: '2029-01-01', qty: 10, unit_price: 62000 }]), sup.id])
ok(await costOf(s1) === 60000, 'new purchase of the same batch: old sale keeps its cost')

// opening stock line corrected with the pencil (edit_stock_in_line)
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p2.id, batch_no: 'O1', expiry_date: '2029-01-01', qty: 5, unit_price: 100 }])])
const s2 = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p2.id, qty: 1, unit_price: 900 }])]))[0].id
const [ol] = await as(owner, `select id from stock_movements where reference = 'Opening stock' and qty > 0`)
await as(owner, `select edit_stock_in_line($1,$2,$3,5,700,'O1','2029-01-01')`, [org.id, ol.id, today])
ok(await costOf(s2) === 700, 'opening stock rate corrected 100 -> 700: sale cost 700')

// stock without a rate uses the product purchase rate; correcting the product rate updates its sales
const [p3] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit, purchase_price) values ($1,'Zorro',$2,1,'l',50) returning id`, [org.id, cat.id])
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p3.id, batch_no: 'Z1', expiry_date: '2029-01-01', qty: 5 }])])
const s3 = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p3.id, qty: 1, unit_price: 900 }])]))[0].id
ok(await costOf(s3) === 50, 'no rate on the stock: cost from the product (50)')
await as(owner, `update products set purchase_price = 650 where id = $1`, [p3.id])
ok(await costOf(s3) === 650, 'product purchase rate corrected to 650: sale cost 650')

// deleting a wrong purchase line puts the cost back on the product rate
ok(N((await as(owner, `select count(*)::int c from audit_log where table_name = 'stock_movements' and action = 'update'`))[0].c) > 0, 'cost corrections are in the audit trail')

// locked years are not changed: old rateless stock sold in 2025, year locked, then product rate changed
const [p4] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit, purchase_price) values ($1,'Oldie',$2,1,'l',100) returning id`, [org.id, cat.id])
await as(owner, `select record_stock_in($1,'2025-11-01','purchase',$2,null,null,null,null,null,true)`, [org.id, J([{ product_id: p4.id, batch_no: 'X1', expiry_date: '2029-01-01', qty: 5 }])])
const s4 = (await as(owner, `select record_sale($1,'2025-12-01',$2) id`, [org.id, J([{ product_id: p4.id, qty: 1, unit_price: 300 }])]))[0].id
await as(owner, `select set_locked_until($1,'2025-12-31')`, [org.id])
await as(owner, `update products set purchase_price = 250 where id = $1`, [p4.id])
ok(await costOf(s4) === 100, 'a sale in a locked year keeps its cost')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
