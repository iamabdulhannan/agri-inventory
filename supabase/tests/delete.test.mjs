// Tests 009: deleting a wrong stock-in line.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '009_delete_stock_in_line'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-009 applied (009 twice)')

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

// purchase with 3 lines (Bectal 38 + Bectal 61 by mistake + Karant 10), total 38*325 + 61*325 + 10*500 = 37175, paid 37175
const pid = (await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,'123',null,$4,37175) id`, [org.id, today, J([
  { product_id: p.id, batch_no: 'E-9', expiry_date: '2028-02-02', qty: 38, unit_price: 325 },
  { product_id: p.id, batch_no: 'E-9', expiry_date: '2028-02-02', qty: 61, unit_price: 325 },
  { product_id: p2.id, batch_no: 'K-1', expiry_date: '2028-02-02', qty: 10, unit_price: 500 }]), sup.id]))[0].id
const lines = await as(owner, `select id, qty from stock_movements where purchase_id=$1 order by qty`, [pid])
const line61 = lines.find((l) => N(l.qty) === 61).id
const lineK = lines.find((l) => N(l.qty) === 10).id
ok(await stock(p.id) === 99 && await cash() === -37175, 'before: Bectal 99, cash -37175')

let e = await err(staff, `select delete_stock_in_line($1,$2)`, [org.id, line61])
ok(e?.includes('NOT_ALLOWED'), 'staff cannot delete')
const r1 = (await as(owner, `select delete_stock_in_line($1,$2) r`, [org.id, line61]))[0].r
ok(r1 === 'line' && await stock(p.id) === 38, 'wrong line (61) deleted: Bectal 99 -> 38')
const [pur] = await as(owner, `select total, paid from purchases where id=$1`, [pid])
ok(N(pur.total) === 38 * 325 + 5000 && N(pur.paid) === 38 * 325 + 5000, 'purchase total and paid reduced to 17350 (paid never above bill)')
ok(await cash() === -17350 && await bal(sup.id) === 0, 'roznamcha cash -17350, khata still settled')

// sell 5 Karant, then deleting its line must be refused
await as(owner, `select record_sale($1,$2,$3)`, [org.id, today, J([{ product_id: p2.id, qty: 5, unit_price: 600 }])])
e = await err(owner, `select delete_stock_in_line($1,$2)`, [org.id, lineK])
ok(e?.includes('INSUFFICIENT_STOCK') && await stock(p2.id) === 5, 'cannot delete a line whose stock was sold (nothing changed)')

// credit purchase: delete a line, khata follows
const pid2 = (await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,'200',null,$4,1000) id`, [org.id, today, J([
  { product_id: p.id, batch_no: 'E-10', expiry_date: '2028-05-05', qty: 10, unit_price: 300 },
  { product_id: p.id, batch_no: 'E-11', expiry_date: '2028-06-06', qty: 4, unit_price: 300 }]), sup.id]))[0].id
ok(await bal(sup.id) === 3200, 'credit purchase: khata 4200 - 1000 = 3200')
const [l11] = await as(owner, `select m.id from stock_movements m join batches b on b.id=m.batch_id where b.batch_no='E-11'`)
await as(owner, `select delete_stock_in_line($1,$2)`, [org.id, l11.id])
ok(await bal(sup.id) === 2000 && (await as(owner, `select count(*)::int c from batches where batch_no='E-11'`))[0].c === 0, 'khata 3000 - 1000 = 2000; empty batch E-11 removed')

// only line left -> whole purchase removed
const [l10] = await as(owner, `select m.id from stock_movements m join batches b on b.id=m.batch_id where b.batch_no='E-10'`)
const r2 = (await as(owner, `select delete_stock_in_line($1,$2) r`, [org.id, l10.id]))[0].r
ok(r2 === 'purchase' && (await as(owner, `select count(*)::int c from purchases where id=$1`, [pid2]))[0].c === 0, 'last line deleted -> the whole purchase is removed')
ok(await bal(sup.id) === 0 && await cash() === -17350 + 3000, 'its khata amount and cash entry are gone too')

// opening stock line
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p2.id, batch_no: 'OP', expiry_date: '2028-01-01', qty: 7 }])])
const [op] = await as(owner, `select id from stock_movements where reference='Opening stock'`)
await as(owner, `select delete_stock_in_line($1,$2)`, [org.id, op.id])
ok(await stock(p2.id) === 5, 'opening stock line deleted')

// sales cannot be deleted this way
const [sl] = await as(owner, `select id from stock_movements where sale_id is not null limit 1`)
e = await err(owner, `select delete_stock_in_line($1,$2)`, [org.id, sl.id])
ok(e?.includes('EDIT_VIA_INVOICE'), 'sale lines are voided through the invoice, not here')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
