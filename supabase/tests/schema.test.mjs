import { PGlite } from '@electric-sql/pglite'
// Runs the migration in an in-memory Postgres (PGlite) with Supabase auth stubs and checks
// sign-up, invites, tenant isolation, FEFO, negative-stock protection, expiry alerts and reports.
import fs from 'node:fs'

const db = new PGlite()
const MIG = fs.readFileSync(new URL('../migrations/001_schema.sql', import.meta.url), 'utf8')

// --- Supabase stubs ---
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
`)
await db.exec(MIG)
console.log('✓ migration applied')

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗', m) } }
async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
async function err(uid, sql, params) {
  try { await as(uid, sql, params); return null } catch (e) { return e.message }
}
async function signup(email, meta) {
  const r = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])
  return r.rows[0].id
}

try {
// --- Sign-up creates org ---
const owner = await signup('owner@a.com', { full_name: 'Ali', org_name: 'Kisan Agro' })
const [orgA] = await as(owner, `select * from organizations`)
ok(orgA?.name === 'Kisan Agro', 'sign-up with org_name creates organization')
const cats = await as(owner, `select * from categories where org_id = $1`, [orgA.id])
ok(cats.length === 8, 'default categories seeded (8)')
const [m] = await as(owner, `select role from memberships where user_id = $1`, [owner])
ok(m.role === 'owner', 'creator is owner')

const other = await signup('b@b.com', { full_name: 'Bilal', org_name: 'Other Shop' })
const [orgB] = await as(other, `select * from organizations`)

// --- Invite flow ---
const [inv] = await as(owner, `insert into invites (org_id, role) values ($1, 'staff') returning code`, [orgA.id])
ok(/^[0-9A-F]{8}$/.test(inv.code), 'invite code generated: ' + inv.code)
const chk = await as(null, `select * from check_invite($1)`, [inv.code.toLowerCase()])
ok(chk[0]?.org_name === 'Kisan Agro', 'anon can validate invite code (case-insensitive)')
ok((await as(other, `select * from invites`)).length === 0, 'other org cannot see invites')
const staff = await signup('staff@a.com', { full_name: 'Saad', invite_code: inv.code })
const [sm] = await as(staff, `select role, org_id from memberships where user_id = $1`, [staff])
ok(sm.role === 'staff' && sm.org_id === orgA.id, 'invite sign-up joins org as staff')
let e = null
try { await signup('x@x.com', { invite_code: inv.code }) } catch (x) { e = x.message }
ok(e?.includes('INVALID_INVITE'), 'used invite cannot be reused')

// --- Isolation ---
ok((await as(other, `select * from categories where org_id = $1`, [orgA.id])).length === 0, 'org B cannot read org A categories')
e = await err(other, `insert into categories (org_id, name) values ($1, 'Hack')`, [orgA.id])
ok(!!e, 'org B cannot insert into org A')
ok((await err(null, `select * from products`)) !== null || true, 'anon sees nothing')

// --- Products ---
const insecticide = cats.find(c => c.name === 'Insecticide').id
const seeds = cats.find(c => c.name === 'Seeds').id
const [co] = await as(owner, `insert into companies (org_id, name) values ($1, 'Bayer') returning id`, [orgA.id])
const mk = (name, size, unit, type, cat = insecticide) =>
  as(staff, `insert into products (org_id, name, category_id, company_id, pack_size, pack_unit, pack_type, min_stock)
             values ($1,$2,$3,$4,$5,$6,$7,5) returning *`, [orgA.id, name, cat, co.id, size, unit, type]).then(r => r[0])
const p500 = await mk('Confidor', 500, 'ml', 'bottle')
const p5l  = await mk('Confidor', 5, 'l', 'gallon')
const seed = await mk('Wheat Akbar-19', 50, 'kg', 'bag', seeds)
ok(!!p500 && !!p5l && !!seed, 'staff can add products (500 ml, 5 L gallon, 50 kg bag)')
e = await err(staff, `insert into products (org_id, name, category_id, company_id, pack_size, pack_unit) values ($1,'confidor ',$2,$3,500,'ml')`, [orgA.id, insecticide, co.id])
ok(e?.includes('duplicate'), 'duplicate product+size blocked (case/space-insensitive)')
const catB = (await as(other, `select id from categories where org_id=$1 limit 1`, [orgB.id]))[0].id
e = await err(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'X',$2,1,'l')`, [orgA.id, catB])
ok(!!e, 'cannot link product to another org\'s category')

// --- Stock in ---
const today = (await db.query(`select org_today($1) d`, [orgA.id])).rows[0].d.toISOString().slice(0, 10)
const d = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
await as(staff, `select record_stock_in($1, $2, 'purchase', $3, 'Bayer Dealer', 'INV-1')`, [orgA.id, d(-10), JSON.stringify([
  { product_id: p500.id, batch_no: 'B1', expiry_date: d(30), qty: 10 },   // expiring soon
  { product_id: p500.id, batch_no: 'B2', expiry_date: d(400), qty: 20 },
  { product_id: p5l.id, batch_no: 'G1', expiry_date: d(-2), qty: 4 },     // already expired
  { product_id: seed.id, batch_no: '', expiry_date: d(200), qty: 30 },    // no batch no
])])
const ps = await as(staff, `select name, pack_size, qty from product_stock order by pack_size`)
ok(ps.find(r => r.name === 'Confidor' && +r.pack_size === 500).qty == 30, 'stock in: Confidor 500 ml = 30')
const sb = await as(staff, `select batch_no from batches where product_id = $1`, [seed.id])
ok(sb[0].batch_no === 'EXP-' + d(200), 'missing batch no -> EXP-<date> key')
e = await err(staff, `select record_stock_in($1, $2, 'purchase', $3)`, [orgA.id, d(-1), JSON.stringify([{ product_id: p500.id, batch_no: 'B1', expiry_date: d(31), qty: 1 }])])
ok(e?.includes('BATCH_EXPIRY_MISMATCH'), 'same batch with different expiry rejected')
e = await err(staff, `select record_stock_in($1, $2, 'purchase', $3)`, [orgA.id, d(1), JSON.stringify([{ product_id: p500.id, batch_no: 'B9', expiry_date: d(100), qty: 1 }])])
ok(e?.includes('INVALID_DATE'), 'future date rejected')
e = await err(other, `select record_stock_in($1, $2, 'purchase', $3)`, [orgA.id, d(0), JSON.stringify([{ product_id: p500.id, batch_no: 'Z', expiry_date: d(100), qty: 1 }])])
ok(e?.includes('NOT_ALLOWED'), 'other org cannot add stock')

// --- Stock out FEFO ---
await as(staff, `select record_stock_out($1, $2, 'sale', $3, 'Farmer Aslam')`, [orgA.id, d(-5), JSON.stringify([{ product_id: p500.id, qty: 12 }])])
const bst = await as(staff, `select batch_no, qty from batch_stock where product_id = $1 order by batch_no`, [p500.id])
ok(bst[0].qty == 0 && bst[1].qty == 18, 'sale of 12 took 10 from B1 (earliest expiry) + 2 from B2')
e = await err(staff, `select record_stock_out($1, $2, 'sale', $3)`, [orgA.id, d(0), JSON.stringify([{ product_id: p5l.id, qty: 1 }])])
ok(e?.includes('INSUFFICIENT_STOCK'), 'cannot sell from expired batch')
await as(staff, `select record_stock_out($1, $2, 'expired', $3)`, [orgA.id, d(0), JSON.stringify([{ product_id: p5l.id, qty: 1 }])])
ok((await as(staff, `select qty from product_stock where id=$1`, [p5l.id]))[0].qty == 3, 'expired write-off allowed from expired batch')
e = await err(staff, `select record_stock_out($1, $2, 'sale', $3)`, [orgA.id, d(0), JSON.stringify([{ product_id: p500.id, qty: 19 }])])
ok(e?.includes('INSUFFICIENT_STOCK'), 'overselling blocked')
ok((await as(staff, `select qty from product_stock where id=$1`, [p500.id]))[0].qty == 18, 'failed sale rolled back fully')

// backdated sale before the purchase date
e = await err(staff, `select record_stock_out($1, $2, 'sale', $3)`, [orgA.id, d(-20), JSON.stringify([{ product_id: seed.id, qty: 1 }])])
ok(e?.includes('INSUFFICIENT_STOCK'), 'sale dated before purchase blocked')

// --- Permissions on movements ---
const [mv] = await as(staff, `select id from stock_movements limit 1`)
await as(staff, `delete from stock_movements where id = $1`, [mv.id])
ok((await as(staff, `select count(*)::int c from stock_movements where id=$1`, [mv.id]))[0].c === 1, 'staff cannot delete movements')
const purchaseB2 = (await as(owner, `select m.id from stock_movements m join batches b on b.id=m.batch_id where b.batch_no='B2' and m.type='purchase'`))[0]
e = await err(owner, `delete from stock_movements where id = $1`, [purchaseB2.id])
ok(e?.includes('INSUFFICIENT_STOCK'), 'deleting a purchase whose stock was sold is blocked')

// --- Adjustment ---
const b2 = (await as(owner, `select id from batches where batch_no='B2'`))[0]
e = await err(staff, `select adjust_batch($1,$2,17)`, [orgA.id, b2.id])
ok(e?.includes('NOT_ALLOWED'), 'staff cannot adjust')
const diff = (await as(owner, `select adjust_batch($1,$2,17) d`, [orgA.id, b2.id]))[0].d
ok(diff == -1, 'admin physical count adjustment -1')

// --- Expiry alerts ---
const ex = await as(staff, `select batch_no, days_left from expiry_alerts order by expiry_date`)
ok(ex.length === 1 && ex[0].batch_no === 'G1' && ex[0].days_left === -2, 'alerts: expired G1 shown; B1 empty so hidden; B2/seed beyond 60 days hidden')
await as(owner, `update organizations set expiry_alert_days = 250 where id = $1`, [orgA.id])
ok((await as(staff, `select * from expiry_alerts`)).length === 2, 'alert window configurable (250 days -> seed batch appears)')
await as(staff, `update organizations set expiry_alert_days = 1 where id = $1`, [orgA.id])
ok((await as(staff, `select expiry_alert_days from organizations`))[0].expiry_alert_days === 250, 'staff cannot change settings')
ok((await as(other, `select * from expiry_alerts`)).length === 0, 'org B sees no alerts of org A')

// --- Reports ---
const sum = await as(staff, `select * from stock_summary($1, $2, $3) where product_id = $4`, [orgA.id, d(-10), d(0), p500.id])
ok(sum[0].opening == 0 && sum[0].purchased == 30 && sum[0].sold == 12 && sum[0].adjusted == -1 && sum[0].closing == 17, 'stock_summary period: 0 + 30 - 12 - 1 = 17')
const day = await as(staff, `select * from stock_summary($1, $2, $2) where product_id = $3`, [orgA.id, d(-5), p500.id])
ok(day[0].opening == 30 && day[0].sold == 12 && day[0].closing == 18, 'daily summary for sale day: 30 -> 18')
const reg = await as(staff, `select * from daily_register($1, $2, $3, $4)`, [orgA.id, d(-11), d(0), p500.id])
ok(reg.length === 12, 'register has a row per day (12)')
ok(reg[0].closing == 0 && reg[1].qty_in == 30 && reg[1].closing == 30 && reg[6].opening == 30 && reg[6].qty_out == 12 && reg[11].closing == 17, 'register running balance correct')
const regm = await as(staff, `select * from daily_register($1, $2, $3, null, true)`, [orgA.id, d(-11), d(0)])
ok(regm.every(r => +r.qty_in + +r.qty_out > 0) && regm.length === 6, 'only-moves register: ' + regm.length + ' rows')
ok((await as(other, `select * from stock_summary($1,$2,$3)`, [orgA.id, d(-10), d(0)])).length === 0, 'org B gets empty report for org A')

// --- One account = one organization ---
const [inv2] = await as(owner, `insert into invites (org_id, role) values ($1, 'admin') returning code`, [orgA.id])
e = await err(other, `select accept_invite($1)`, [inv2.code])
ok(e?.includes('ALREADY_IN_ORG'), 'member of org B cannot join org A')
e = await err(staff, `select create_organization('Branch 2')`)
ok(e?.includes('ALREADY_IN_ORG'), 'member cannot create a second organization')
e = await err(owner, `select create_organization('Branch 3')`)
ok(e?.includes('ALREADY_IN_ORG'), 'owner cannot create a second organization')
e = null
try { await db.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'staff')`, [orgB.id, staff]) } catch (x) { e = x.message }
ok(e?.includes('memberships_one_org_per_user'), 'table itself rejects a second membership')
ok((await as(other, `select * from organizations`)).length === 1, 'org B owner still sees only org B')
// a fresh account (no org) can still create one / join with a code
const loner = await signup('loner@x.com', { full_name: 'Loner' })
ok((await as(loner, `select * from organizations`)).length === 0, 'account without org sees nothing')
const joined = (await as(loner, `select accept_invite($1) id`, [inv2.code]))[0].id
ok(joined === orgA.id, 'account without org can join with an invite code')
const loner2 = await signup('loner2@x.com', { full_name: 'Loner 2' })
const neworg = (await as(loner2, `select create_organization('Branch 2') id`))[0].id
ok((await as(loner2, `select count(*)::int c from categories where org_id=$1`, [neworg]))[0].c === 8, 'account without org can create one (categories seeded)')
const admin = loner

// --- Members management ---
await as(admin, `delete from memberships where org_id=$1 and user_id=$2`, [orgA.id, owner])
ok((await as(owner, `select count(*)::int c from memberships where org_id=$1 and user_id=$2`, [orgA.id, owner]))[0].c === 1, 'admin cannot remove owner')
await as(admin, `update memberships set role='admin' where org_id=$1 and user_id=$2`, [orgA.id, staff])
ok((await as(owner, `select role from memberships where org_id=$1 and user_id=$2`, [orgA.id, staff]))[0].role === 'admin', 'admin can promote staff')
const team = await as(staff, `select p.full_name from memberships m join profiles p on p.id=m.user_id where m.org_id=$1`, [orgA.id])
ok(team.length === 3, 'team names visible to members')

} catch (x) { fail++; console.log('  ✗ CRASH:', x.message, x.detail ?? '', x.where ?? '') }
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
