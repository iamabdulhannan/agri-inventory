// Tests 015: investments (capital, investor stock first, profit share, withdraw / settle).
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '005_sales_khata', '006_sale_returns', '007_opening_stock', '008_edit_stock_in', '009_delete_stock_in_line', '010_loose_sale', '011_precise_qty', '012_audit', '013_money', '014_sale_due_date', '015_investments', '015_investments'])
  await db.exec(R(`../migrations/${f}.sql`))
console.log('✓ migrations 001-015 applied (015 twice)')

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




const sum = async () => (await as(owner, `select * from investor_summary($1)`, [org.id]))[0]
const cashNow = async () => N((await as(owner, `select coalesce(sum(amount),0) s from cash_entries where account_id is null`))[0].s)

// ---- investor + capital ----
let e = await err(staff, `insert into investors (org_id, name) values ($1,'X')`, [org.id])
ok(!!e, 'staff cannot add an investor')
const [ali] = await as(owner, `insert into investors (org_id, name, profit_share) values ($1,'Ali',50) returning id`, [org.id])
ok((await as(staff, `select count(*)::int c from investors`))[0].c === 0, 'staff cannot see investors')
await as(owner, `select investor_deposit($1,$2,$3,10000)`, [org.id, ali.id, today])
let s = await sum()
ok(N(s.capital) === 10000 && N(s.available) === 10000 && await cashNow() === 10000, 'Ali invests 10,000 cash: capital 10,000, available 10,000')

// ---- shop buys 100 Bectal @ 100; 60 are Ali's ----
const pur = (await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,'B-1',null,$4,10000) id`, [org.id, today, J([{ product_id: p.id, batch_no: 'B1', expiry_date: '2029-01-01', qty: 100, unit_price: 100 }]), sup.id]))[0].id
await as(owner, `select assign_investor_stock($1,$2,$3,60,100,$4,$5)`, [org.id, ali.id, p.id, today, pur])
s = await sum()
ok(N(s.stock_cost) === 6000 && N(s.available) === 4000 && N(s.units_left) === 60, 'split purchase: 60 his (6,000 in stock), 4,000 still available')
e = await err(owner, `select assign_investor_stock($1,$2,$3,50,100,$4)`, [org.id, ali.id, p.id, today])
ok(e?.includes('INVESTOR_NO_STOCK'), 'cannot give him more than the shop\'s own 40')
await as(owner, `select record_stock_in($1,$2,'purchase',$3,null,null,null,null,null,true)`, [org.id, today, J([{ product_id: p2.id, batch_no: 'K1', expiry_date: '2029-01-01', qty: 100, unit_price: 500 }])])
e = await err(owner, `select assign_investor_stock($1,$2,$3,10,500,$4)`, [org.id, ali.id, p2.id, today])
ok(e?.includes('INVESTOR_NO_FUNDS'), 'cannot put more stock in his name than his money (5,000 > 4,000)')

// ---- sales: his stock first ----
const s1 = (await as(staff, `select record_sale($1,$2,$3) id`, [org.id, today, J([{ product_id: p.id, qty: 70, unit_price: 150 }])]))[0].id
s = await sum()
ok(N(s.units_left) === 0 && N(s.open_gross) === 3000 && N(s.open_profit) === 1500, 'sale of 70: his 60 sold first, gross 3,000, his half 1,500')
const al = await as(owner, `select sum(qty) q from investor_alloc where sale_id = $1`, [s1])
ok(N(al[0].q) === 60, 'only 60 of the 70 are his, 10 were the shop\'s')
// customer returns 5
const [rl] = await as(owner, `select batch_id from sale_returnable($1)`, [s1])
await as(owner, `select record_sale_return($1,$2,$3,$4)`, [org.id, s1, today, J([{ batch_id: rl.batch_id, qty: 5 }])])
s = await sum()
ok(N(s.units_left) === 5 && N(s.open_gross) === 2750, 'return of 5 goes back to his stock first: 5 left, gross 2,750')

// ---- withdraw some profit any time ----
e = await err(owner, `select settle_investor($1,$2,'withdraw_all',$3)`, [org.id, ali.id, today])
ok(e?.includes('INVESTOR_STOCK_LEFT'), 'cannot withdraw everything while his stock is unsold')
e = await err(owner, `select settle_investor($1,$2,'withdraw_some',$3,null,2000)`, [org.id, ali.id, today])
ok(e?.includes('INVESTOR_NO_PROFIT'), 'cannot withdraw more than his profit (1,375)')
const c0 = await cashNow()
await as(owner, `select settle_investor($1,$2,'withdraw_some',$3,null,1000)`, [org.id, ali.id, today])
s = await sum()
ok(N(s.profit_balance) === 375 && N(s.capital) === 10000 && await cashNow() === c0 - 1000, 'withdrew 1,000 of 1,375 profit: 375 left, capital 10,000, cash -1,000')
e = await err(owner, `delete from sales where id = $1`, [s1])
ok(e?.includes('INVESTOR_SETTLED'), 'an invoice in a settled profit cannot be voided')

// ---- sell his last 5; settle: withdraw profit, keep capital ----
await as(staff, `select record_sale($1,$2,$3)`, [org.id, today, J([{ product_id: p.id, qty: 5, unit_price: 150 }])])
s = await sum()
ok(N(s.units_left) === 0 && N(s.open_profit) === 125, 'last 5 sold: +125 his share')
const r1 = (await as(owner, `select settle_investor($1,$2,'withdraw_profit',$3) r`, [org.id, ali.id, today]))[0].r
s = await sum()
ok(N(r1.profit_paid) === 500 && N(s.profit_balance) === 0 && N(s.capital) === 10000 && N(s.available) === 10000, 'settle: profit 500 paid, capital 10,000 stays invested')
const daily = await as(owner, `select * from investor_daily($1,$2,$3,$3)`, [org.id, ali.id, today])
ok(daily.length === 1 && N(daily[0].gross_profit) === 3000, 'daily view: 3,000 gross profit today')

// ---- a loss: his stock damaged, settle reinvest_all ----
await as(owner, `select assign_investor_stock($1,$2,$3,10,500,$4)`, [org.id, ali.id, p2.id, today])
await as(owner, `select record_stock_out($1,$2,'damaged',$3)`, [org.id, today, J([{ product_id: p2.id, qty: 10 }])])
s = await sum()
ok(N(s.open_gross) === -5000 && N(s.open_profit) === -5000, 'damaged stock is his loss in full (-5,000)')
await as(owner, `select settle_investor($1,$2,'reinvest_all',$3)`, [org.id, ali.id, today])
s = await sum()
ok(N(s.capital) === 5000 && N(s.profit_balance) === 0, 'reinvest all: capital 10,000 - 5,000 loss = 5,000')

// ---- profit then reinvest everything ----
await as(owner, `select assign_investor_stock($1,$2,$3,10,500,$4)`, [org.id, ali.id, p2.id, today])
await as(staff, `select record_sale($1,$2,$3)`, [org.id, today, J([{ product_id: p2.id, qty: 10, unit_price: 700 }])])
await as(owner, `select settle_investor($1,$2,'reinvest_all',$3)`, [org.id, ali.id, today])
s = await sum()
ok(N(s.capital) === 6000, 'profit 2,000, his half 1,000 reinvested: capital 6,000')

// ---- withdraw everything ----
const c1 = await cashNow()
const r2 = (await as(owner, `select settle_investor($1,$2,'withdraw_all',$3) r`, [org.id, ali.id, today]))[0].r
s = await sum()
ok(N(r2.capital_paid) === 6000 && N(s.equity) === 0 && await cashNow() === c1 - 6000, 'withdraw all: 6,000 paid, nothing left invested')
const st = await as(owner, `select count(*)::int c from investor_settlements where investor_id = $1`, [ali.id])
ok(st[0].c >= 4, 'every booking is kept in history')
const roz = await as(owner, `select count(*)::int c from cash_entries where investor_id = $1`, [ali.id])
ok(roz[0].c === 4, 'roznamcha has the deposit and the 3 payouts')

// ---- lock ----
await as(owner, `select set_locked_until($1,'2026-01-01')`, [org.id])
e = await err(owner, `select investor_deposit($1,$2,'2025-12-01',100)`, [org.id, ali.id])
ok(e?.includes('PERIOD_LOCKED'), 'no investor entries in a locked year')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
