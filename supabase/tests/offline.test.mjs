// Tests 019: offline changes applied exactly once, reserved invoice numbers.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '010_loose_sale', '011_precise_qty', '012_audit', '013_money', '014_sale_due_date', '015_investments', '016_receipt_note', '017_correct_sale_rates', '018_refresh_sale_costs', '019_offline', '019_offline'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-019 applied (019 twice)')

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






const apply = (who, op, fn, args, dev = 'dev-A') => as(who, `select offline_apply($1,$2,$3,$4,$5) r`, [org.id, op, fn, J(args), dev]).then((r) => r[0].r)
const uuid = () => crypto.randomUUID()
const count = async (tbl) => (await as(owner, `select count(*)::int c from ${tbl}`))[0].c
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p.id, batch_no: 'B1', expiry_date: '2029-01-01', qty: 10, unit_price: 100 }])])

// ---- reserved invoice numbers per device ----
const nosA = (await as(staff, `select reserve_invoice_numbers($1,'dev-A',5) n`, [org.id]))[0].n
const nosB = (await as(owner, `select reserve_invoice_numbers($1,'dev-B',5) n`, [org.id]))[0].n
ok(nosA.join() === '1,2,3,4,5' && nosB.join() === '6,7,8,9,10', 'devices get separate number blocks (1-5, 6-10)')
const online = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p.id, qty: 1, unit_price: 150 }])]))[0].id
ok((await as(owner, `select invoice_no from sales where id=$1`, [online]))[0].invoice_no === 11, 'a normal online sale continues after the reserved blocks (11)')

// ---- an offline sale, sent twice (connection lost after the first) ----
const op1 = uuid()
const sale = { p_date: today, p_lines: [{ product_id: p.id, qty: 2, unit_price: 150 }], p_invoice_no: nosA[0] }
const r1 = await apply(staff, op1, 'record_sale', sale)
const r2 = await apply(staff, op1, 'record_sale', sale)
ok(r1.ok && r2.ok && r2.again && r1.result === r2.result, 'same change twice: applied once, same result returned')
ok(await count('sales') === 2 && await stock(p.id) === 7, 'only one sale saved; stock 10 - 1 - 2 = 7')
ok((await as(owner, `select invoice_no from sales where id=$1`, [r1.result]))[0].invoice_no === 1, 'offline receipt number 1 is the final invoice number')

// a reserved number can't be used twice or by a number that was never reserved
const r3 = await apply(staff, uuid(), 'record_sale', { ...sale, p_invoice_no: nosA[0] })
ok(!r3.ok && /INVALID_INVOICE_NO/.test(r3.error), 'used number is refused (comes back as an error, nothing saved)')
const r4 = await apply(staff, uuid(), 'record_sale', { ...sale, p_invoice_no: 999 })
ok(!r4.ok && await count('sales') === 2, 'unreserved number is refused')

// ---- not enough stock at sync: error returned, nothing saved, can be retried later ----
const op5 = uuid()
const big = { p_date: today, p_lines: [{ product_id: p.id, qty: 50, unit_price: 150 }], p_invoice_no: nosA[1] }
const r5 = await apply(staff, op5, 'record_sale', big)
ok(!r5.ok && /INSUFFICIENT_STOCK/.test(r5.error) && await stock(p.id) === 7, 'too little stock: returned for review, stock untouched')
ok((await as(owner, `select used_at from invoice_reservations where invoice_no=$1`, [nosA[1]]))[0].used_at === null, 'its reserved number is still free')
await apply(owner, uuid(), 'record_stock_in', { p_date: today, p_type: 'purchase', p_lines: [{ product_id: p.id, batch_no: 'B2', expiry_date: '2029-06-01', qty: 50, unit_price: 100 }], p_opening: true })
const r6 = await apply(staff, op5, 'record_sale', big)
ok(r6.ok && await stock(p.id) === 7, 'after stock arrives, Retry with the same id works (57 - 50 = 7)')

// ---- other changes offline ----
const [cus] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'customer','Farmer') returning id`, [org.id])
const op7 = uuid()
await apply(staff, op7, 'record_party_payment', { p_party: cus.id, p_date: today, p_amount: 500, p_note: 'cash' })
await apply(staff, op7, 'record_party_payment', { p_party: cus.id, p_date: today, p_amount: 500, p_note: 'cash' })
ok(await count(`cash_entries where kind = 'receipt'`) === 1, 'khata payment sent twice: saved once')
const op8 = uuid()
const ex = await apply(staff, op8, 'add_cash_entry', { p_date: today, p_kind: 'expense', p_amount: 300, p_note: 'Tea' })
await apply(staff, op8, 'add_cash_entry', { p_date: today, p_kind: 'expense', p_amount: 300, p_note: 'Tea' })
ok(ex.ok && await count(`cash_entries where kind = 'expense'`) === 1, 'expense sent twice: saved once')

// ---- safety ----
let e = await err(staff, `select offline_apply($1,$2,'set_locked_until',$3)`, [org.id, uuid(), J({ p_until: today })])
ok(e?.includes('NOT_ALLOWED'), 'only sale / stock in / payments / cash entries can be applied this way')
e = await err(staff, `select offline_apply($1,$2,'add_cash_entry',$3)`, [org.id, uuid(), J({ 'p_amount) from x; --': 1 })])
ok(e?.includes('INVALID_TYPE'), 'odd argument names are refused')
const other = await user('x@other.pk', { org_name: 'Other', full_name: 'X' })
e = await err(other, `select offline_apply($1,$2,'add_cash_entry',$3)`, [org.id, uuid(), J({ p_date: today, p_kind: 'expense', p_amount: 1 })])
ok(e?.includes('NOT_ALLOWED'), 'another shop cannot apply changes here')
ok((await as(staff, `select my_reserved_invoices($1,'dev-A') n`, [org.id]))[0].n.join() === '3,4,5', 'device can see its unused numbers (3, 4, 5)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
