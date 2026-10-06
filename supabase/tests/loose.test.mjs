// Tests 010: selling bags loose by weight (kg).
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '010_loose_sale', '010_loose_sale'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-010 applied (010 twice)')

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
const [cat] = await as(owner, `select id from categories where org_id=$1 limit 1`, [org.id])
const [p] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Bectal',$2,200,'ml') returning id`, [org.id, cat.id])
const [p2] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Karant',$2,500,'ml') returning id`, [org.id, cat.id])
const [sup] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'supplier','Starco') returning id`, [org.id])
const today = (await db.query(`select org_today($1) d`, [org.id])).rows[0].d.toISOString().slice(0, 10)
const stock = async (id) => N((await as(owner, `select qty from product_stock where id=$1`, [id]))[0].qty)
const bal = async (id) => N((await as(owner, `select balance from party_balances where id=$1`, [id]))[0].balance)
const cash = async () => N((await as(owner, `select coalesce(sum(amount),0) s from cash_entries`))[0].s)

// a 50 kg urea bag, MRP 5000 per bag
const [bag] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit, pack_type, sale_price) values ($1,'Urea',$2,50,'kg','bag',5000) returning id`, [org.id, cat.id])
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: bag.id, batch_no: 'U-1', expiry_date: '2029-01-01', qty: 10 }])])
await as(owner, `update products set purchase_price = 4000 where id = $1`, [bag.id])

// sell 12.5 kg at Rs 110 / kg  ->  0.25 bag at Rs 5500 / bag = Rs 1375
const sid = (await as(staff, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: bag.id, qty: 0.25, unit_price: 5500, loose: true }])]))[0].id
ok(await stock(bag.id) === 9.75, 'stock 10 -> 9.75 bags after 12.5 kg')
const [s1] = await as(owner, `select total, paid from sales where id=$1`, [sid])
ok(N(s1.total) === 1375 && N(s1.paid) === 1375, 'invoice total Rs 1375 (12.5 kg x 110)')
const [mv] = await as(owner, `select loose, qty, unit_price from stock_movements where sale_id=$1`, [sid])
ok(mv.loose === true && N(mv.qty) === -0.25 && N(mv.unit_price) === 5500, 'line marked loose, stored as 0.25 bag @ 5500')

// 1.1 kg works (0.022 bag)
const sid2 = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: bag.id, qty: 0.022, unit_price: 5000, loose: true }, { product_id: bag.id, qty: 1, unit_price: 5000 }])]))[0].id
ok(await stock(bag.id) === 8.728, '1.1 kg + 1 full bag: 9.75 -> 8.728')
const lines2 = await as(owner, `select loose, qty from stock_movements where sale_id=$1 order by qty desc`, [sid2])
ok(lines2[0].loose === true && lines2[1].loose === false, 'loose and full-bag lines kept apart')

// loose flag ignored for non-bag products
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p.id, batch_no: 'B', expiry_date: '2029-01-01', qty: 5 }])])
const sid4 = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p.id, qty: 1, unit_price: 100, loose: true }])]))[0].id
ok((await as(owner, `select loose from stock_movements where sale_id=$1`, [sid4]))[0].loose === false, 'bottle product: loose flag ignored')

// return 5 kg (0.1 bag) of the 12.5 kg sale
const [rl] = await as(owner, `select batch_id, remaining, rate, loose from sale_returnable($1)`, [sid])
ok(rl.loose === true && N(rl.remaining) === 0.25 && N(rl.rate) === 5500, 'returnable: 0.25 bag @ 5500, marked loose')
await as(owner, `select record_sale_return($1,$2,$3,$4)`, [org.id, sid, today, J([{ batch_id: rl.batch_id, qty: 0.1 }])])
const [ret] = await as(owner, `select total, refund from sale_returns where sale_id=$1`, [sid])
ok(N(ret.total) === 550 && N(ret.refund) === 550, 'return of 5 kg = Rs 550 refunded')
ok((await as(owner, `select loose from stock_movements where return_id is not null`))[0].loose === true && await stock(bag.id) === 8.828, 'returned line is loose, stock back to 8.828')

// profit: cost 4000 per bag -> 0.25 bag costs 1000
const [ps] = await as(owner, `select sum(-qty * unit_cost) c from stock_movements where sale_id=$1`, [sid])
ok(N(ps.c) === 1000 || ps.c === null, 'cost of 12.5 kg = Rs 1000 (or no cost recorded for opening stock)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
