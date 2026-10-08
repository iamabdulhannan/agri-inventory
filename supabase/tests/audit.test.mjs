// Tests 012: year report, year lock and audit trail.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '010_loose_sale', '011_precise_qty', '012_audit', '012_audit'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-012 applied (012 twice)')

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


// ---- tax year 1 Jul 2025 - 30 Jun 2026 ----
const Y = ['2025-07-01', '2026-06-30']
// opening stock before the year: 10 x Bectal @ 300 (no bill)
await as(owner, `select record_stock_in($1,'2025-06-20','purchase',$2,null,null,null,null,null,true)`, [org.id, J([{ product_id: p.id, batch_no: 'O1', expiry_date: '2028-01-01', qty: 10, unit_price: 300 }])])
// purchase bill in the year: 20 x Bectal @ 300 = 6000, paid
await as(owner, `select record_stock_in($1,'2025-08-01','purchase',$2,null,'B-1',null,$3,6000)`, [org.id, J([{ product_id: p.id, batch_no: 'O1', expiry_date: '2028-01-01', qty: 20, unit_price: 300 }]), sup.id])
// sale in the year: 12 @ 400 = 4800, discount 300 -> 4500, customer pays 4000 (500 on khata)
const [cus] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'customer','Farmer') returning id`, [org.id])
const sid = (await as(owner, `select record_sale($1,'2025-09-01',$2,$3,null,300,4000) id`, [org.id, J([{ product_id: p.id, qty: 12, unit_price: 400 }]), cus.id]))[0].id
// expense 700
await as(owner, `insert into cash_entries (org_id, entry_date, kind, amount, note) values ($1,'2026-01-10','expense',-700,'Rent')`, [org.id])

const yr = (await as(owner, `select year_report($1,$2,$3) r`, [org.id, ...Y]))[0].r
ok(N(yr.opening_stock) === 3000 && N(yr.purchases) === 6000 && N(yr.closing_stock) === 5400, `opening 3000, purchases 6000, closing 18 x 300 = 5400 (got ${yr.opening_stock}, ${yr.purchases}, ${yr.closing_stock})`)
ok(N(yr.cost_of_goods_sold) === 3600 && N(yr.net_sales) === 4500 && N(yr.gross_profit) === 900, `COGS 3600, net sales 4500, gross profit 900 (got ${yr.cost_of_goods_sold}, ${yr.net_sales}, ${yr.gross_profit})`)
ok(N(yr.expenses) === 700 && N(yr.net_profit) === 200, 'expenses 700, net profit 200')
ok(N(yr.cash_closing) === -6000 + 4000 - 700 && N(yr.receivable) === 500, 'cash -2700, customer owes 500 on 30 Jun')
const ys = await as(owner, `select * from year_stock($1,$2,$3)`, [org.id, ...Y])
const yb = ys.find((x) => x.product_id === p.id)
ok(N(yb.opening_qty) === 10 && N(yb.in_qty) === 20 && N(yb.out_qty) === 12 && N(yb.closing_qty) === 18, 'stock register 10 + 20 - 12 = 18')

// ---- lock ----
let e = await err(staff, `select set_locked_until($1,'2026-06-30')`, [org.id])
ok(e?.includes('NOT_ALLOWED'), 'staff cannot lock')
e = await err(admin, `select set_locked_until($1,'2026-06-30')`, [org.id])
ok(e?.includes('NOT_ALLOWED'), 'admin cannot lock (owner only)')
e = await err(admin, `update organizations set locked_until = '2026-06-30' where id = $1`, [org.id])
ok(e?.includes('NOT_ALLOWED') || (await as(owner, `select locked_until from organizations where id=$1`, [org.id]))[0].locked_until === null, 'admin cannot set the lock directly either')
await as(owner, `select set_locked_until($1,'2026-06-30')`, [org.id])
e = await err(owner, `select record_sale($1,'2026-06-25',$2)`, [org.id, J([{ product_id: p.id, qty: 1, unit_price: 400 }])])
ok(e?.includes('PERIOD_LOCKED'), 'no new sale dated in the locked year')
e = await err(owner, `delete from cash_entries where note = 'Rent'`)
ok(e?.includes('PERIOD_LOCKED'), 'no deleting an expense in the locked year')
e = await err(owner, `delete from sales where id = $1`, [sid])
ok(e?.includes('PERIOD_LOCKED'), 'no voiding an invoice in the locked year')
const [opl] = await as(owner, `select id from stock_movements where movement_date = '2025-06-20'`)
e = await err(owner, `select edit_stock_in_line($1,$2,$3,5,300,'O1','2028-01-01')`, [org.id, opl.id, today])
ok(e?.includes('PERIOD_LOCKED'), 'no editing or moving a stock entry out of the locked year')
await as(owner, `select record_sale($1,$2,$3)`, [org.id, today, J([{ product_id: p.id, qty: 1, unit_price: 400 }])])
ok(await stock(p.id) === 17, 'sales today still work')
const yr2 = (await as(owner, `select year_report($1,$2,$3) r`, [org.id, ...Y]))[0].r
ok(yr2.locked_until === '2026-06-30' && N(yr2.net_profit) === 200, 'locked year figures unchanged')

// ---- audit trail ----
ok((await as(owner, `select count(*)::int c from audit_log where table_name not in ('organizations', 'products')`))[0].c === 0, 'saving a sale is not logged as an edit')
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p2.id, batch_no: 'K9', expiry_date: '2028-01-01', qty: 10, unit_price: 500 }])])
const [k9] = await as(owner, `select m.id from stock_movements m join batches b on b.id = m.batch_id where b.batch_no = 'K9'`)
await as(admin, `select edit_stock_in_line($1,$2,$3,8,500,'K9','2028-01-01')`, [org.id, k9.id, today])
await as(owner, `insert into cash_entries (org_id, entry_date, kind, amount, note) values ($1,$2,'expense',-100,'Tea')`, [org.id, today])
await as(admin, `delete from cash_entries where note = 'Tea'`)
const log = await as(owner, `select table_name, action, user_name, old_data->>'qty' oq, new_data->>'qty' nq, old_data->>'amount' oa from audit_log where table_name in ('stock_movements', 'cash_entries') order by id`)
ok(log.length === 2 && log[0].action === 'update' && N(log[0].oq) === 10 && N(log[0].nq) === 8 && log[0].user_name === 'Ali', 'edit logged: qty 10 -> 8 by Ali')
ok(log[1].action === 'delete' && N(log[1].oa) === -100 && log[1].table_name === 'cash_entries', 'deleted expense logged with its amount')
ok((await as(staff, `select count(*)::int c from audit_log`))[0].c === 0, 'staff cannot read the audit trail')
e = await err(owner, `delete from audit_log`)
ok(!!e, 'the audit trail cannot be deleted, even by the owner')
e = await err(owner, `update audit_log set user_name = 'x'`)
ok(!!e, 'the audit trail cannot be changed')
await as(owner, `update products set sale_price = 450 where id = $1`, [p.id])
ok((await as(owner, `select count(*)::int c from audit_log where table_name = 'products' and (new_data->>'sale_price')::numeric = 450`))[0].c === 1, 'product price change logged')
await as(owner, `select set_locked_until($1, null)`, [org.id])
ok((await as(owner, `select count(*)::int c from audit_log where table_name = 'organizations'`))[0].c === 2, 'locking and unlocking are logged (and nothing else on the shop)')

// removing a member who made entries in a locked year still works
await as(owner, `select set_locked_until($1,'2026-06-30')`, [org.id])
await db.query(`delete from auth.users where id = $1`, [admin])
ok((await as(owner, `select count(*)::int c from memberships where org_id = $1`, [org.id]))[0].c === 2, 'member removed despite the lock')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
