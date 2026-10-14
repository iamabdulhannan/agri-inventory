// Tests 017: correcting the rates of a saved invoice.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '010_loose_sale', '011_precise_qty', '012_audit', '013_money', '014_sale_due_date', '015_investments', '016_receipt_note', '017_correct_sale_rates', '017_correct_sale_rates'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-017 applied (017 twice)')

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





const cashNow = async () => N((await as(owner, `select coalesce(sum(amount),0) s from cash_entries where account_id is null`))[0].s)
const sale = async (id) => (await as(owner, `select total, paid, subtotal, discount from sales where id=$1`, [id]))[0]
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p.id, batch_no: 'B1', expiry_date: '2029-01-01', qty: 100, unit_price: 400 }])])
const fix = (who, id, lines, disc = null) => as(who, `select correct_sale_rates($1,$2,$3,$4) r`, [org.id, id, J(lines), disc])

// walk-in sold 2 @ 550 by mistake; correct rate is 500
const w = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p.id, qty: 2, unit_price: 550 }])]))[0].id
const c0 = await cashNow()
let e = await err(staff, `select correct_sale_rates($1,$2,$3)`, [org.id, w, J([{ product_id: p.id, unit_price: 500 }])])
ok(e?.includes('NOT_ALLOWED'), 'staff cannot change invoice rates')
await fix(owner, w, [{ product_id: p.id, unit_price: 500 }])
let sw = await sale(w)
ok(N(sw.total) === 1000 && N(sw.paid) === 1000 && await cashNow() === c0 - 100, 'walk-in: 1,100 -> 1,000, cash received follows (-100)')
const [mv] = await as(owner, `select unit_price from stock_movements where sale_id = $1`, [w])
ok(N(mv.unit_price) === 500 && await stock(p.id) === 98, 'line rate is 500 now; stock unchanged')

// khata customer on credit: rate goes up
const [cus] = await as(owner, `insert into parties (org_id, kind, name) values ($1,'customer','Farmer') returning id`, [org.id])
const k = (await as(owner, `select record_sale($1,$2,$3,$4,null,0,0) id`, [org.id, today, J([{ product_id: p.id, qty: 4, unit_price: 500 }]), cus.id]))[0].id
await fix(owner, k, [{ product_id: p.id, unit_price: 550 }], 100)
const sk = await sale(k)
ok(N(sk.subtotal) === 2200 && N(sk.discount) === 100 && N(sk.total) === 2100 && await bal(cus.id) === 2100, 'khata: 4 @ 550 - 100 discount = 2,100 on his khata')

// khata customer paid in full, corrected bill is lower: extra goes to his khata as a payment
const f = (await as(owner, `select record_sale($1,$2,$3,$4,null,0,1000) id`, [org.id, today, J([{ product_id: p.id, qty: 2, unit_price: 500 }]), cus.id]))[0].id
const c1 = await cashNow()
const r = (await fix(owner, f, [{ product_id: p.id, unit_price: 400 }]))[0].r
const sf = await sale(f)
ok(N(sf.total) === 800 && N(sf.paid) === 800 && N(r.to_khata) === 200, 'paid 1,000 on a bill corrected to 800: 200 moves to his khata')
ok(await bal(cus.id) === 2100 - 200 && await cashNow() === c1, 'his khata 2,100 - 200 = 1,900; cash in hand unchanged')

// a returned invoice can't be corrected
const [rl] = await as(owner, `select batch_id from sale_returnable($1)`, [w])
await as(owner, `select record_sale_return($1,$2,$3,$4)`, [org.id, w, today, J([{ batch_id: rl.batch_id, qty: 1 }])])
e = await err(owner, `select correct_sale_rates($1,$2,$3)`, [org.id, w, J([{ product_id: p.id, unit_price: 450 }])])
ok(e?.includes('SALE_HAS_RETURNS'), 'invoices with returns cannot be corrected')
e = await err(owner, `select correct_sale_rates($1,$2,$3,5000)`, [org.id, k, J([])])
ok(e?.includes('INVALID_DISCOUNT'), 'discount cannot be more than the bill')

// investors follow the corrected rate
const [ali] = await as(owner, `insert into investors (org_id, name, profit_share) values ($1,'Ali',50) returning id`, [org.id])
await as(owner, `select investor_deposit($1,$2,$3,10000)`, [org.id, ali.id, today])
await as(owner, `select assign_investor_stock($1,$2,$3,10,400,$4)`, [org.id, ali.id, p.id, today])
const v = (await as(owner, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p.id, qty: 10, unit_price: 600 }])]))[0].id
await fix(owner, v, [{ product_id: p.id, unit_price: 450 }])
const [ia] = await as(owner, `select open_gross from investor_summary($1)`, [org.id])
ok(N(ia.open_gross) === 500, 'investor profit uses the corrected rate (10 x 50 = 500)')
await as(owner, `select settle_investor($1,$2,'withdraw_some',$3,null,100)`, [org.id, ali.id, today])
e = await err(owner, `select correct_sale_rates($1,$2,$3)`, [org.id, v, J([{ product_id: p.id, unit_price: 500 }])])
ok(e?.includes('INVESTOR_SETTLED'), 'an invoice in a settled investor profit cannot be corrected')

ok((await as(owner, `select count(*)::int c from audit_log where table_name = 'stock_movements' and action = 'update'`))[0].c >= 3, 'every rate change is in the audit trail')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
