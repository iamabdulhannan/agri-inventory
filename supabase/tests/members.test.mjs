// Tests remove_member (004): full removal, sign-out, history kept, permissions, re-invite.
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
for (const f of ['001_schema', '002_one_org_per_user', '003_password_reset', '004_remove_member', '004_remove_member']) await db.exec(R(`../migrations/${f}.sql`))

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const err = async (uid, sql, params) => { try { await as(uid, sql, params); return null } catch (e) { return e.message } }
const q = async (sql, params) => (await db.query(sql, params)).rows
const user = async (email, meta) => (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta]))[0].id

const owner = await user('owner@shop.pk', { org_name: 'Shop A', full_name: 'Umair' })
const [org] = await as(owner, `select id from organizations`)
const invite = async (role) => (await as(owner, `insert into invites (org_id, role) values ($1, $2) returning code`, [org.id, role]))[0].code
const staff = await user('staff@shop.pk', { invite_code: await invite('staff'), full_name: 'Saad' })
const staff2 = await user('staff2@shop.pk', { invite_code: await invite('staff'), full_name: 'Bilal' })
const admin = await user('admin@shop.pk', { invite_code: await invite('admin'), full_name: 'Ali' })
const admin2 = await user('admin2@shop.pk', { invite_code: await invite('admin'), full_name: 'Hamza' })
const outsider = await user('x@other.pk', { org_name: 'Shop B' })

// staff records stock so we can check history survives
const [cat] = await as(owner, `select id from categories where org_id=$1 limit 1`, [org.id])
const [p] = await as(owner, `insert into products (org_id, name, category_id, pack_size, pack_unit) values ($1,'Confidor',$2,500,'ml') returning id`, [org.id, cat.id])
await as(staff, `select record_stock_in($1, current_date, 'purchase', $2)`, [org.id, JSON.stringify([{ product_id: p.id, batch_no: 'B1', expiry_date: '2030-01-01', qty: 10 }])])
ok((await q(`select created_by_name from stock_movements where created_by=$1`, [staff]))[0]?.created_by_name === 'Saad', 'new stock entry stores the name of who made it')
await q(`insert into auth.sessions (user_id) values ($1), ($1)`, [staff])
await q(`insert into auth.refresh_tokens (user_id) values ($1)`, [staff])

// permissions
ok((await err(admin, `select remove_member($1,$2)`, [org.id, admin2]))?.includes('NOT_ALLOWED'), 'admin cannot remove another admin')
ok((await err(admin, `select remove_member($1,$2)`, [org.id, owner]))?.includes('NOT_ALLOWED'), 'admin cannot remove owner')
ok((await err(staff2, `select remove_member($1,$2)`, [org.id, staff]))?.includes('NOT_ALLOWED'), 'staff cannot remove anyone')
ok((await err(owner, `select remove_member($1,$2)`, [org.id, owner]))?.includes('CANNOT_REMOVE_SELF'), 'owner cannot remove themselves')
ok((await err(outsider, `select remove_member($1,$2)`, [org.id, staff]))?.includes('NOT_ALLOWED'), 'other shop cannot remove our staff')
ok((await err(null, `select remove_member($1,$2)`, [org.id, staff])) !== null, 'anonymous caller rejected')
ok((await q(`select count(*)::int c from auth.users where id=$1`, [staff]))[0].c === 1, 'failed attempts removed nothing')

// owner removes staff
await as(owner, `select remove_member($1,$2)`, [org.id, staff])
ok((await q(`select count(*)::int c from auth.users where id=$1`, [staff]))[0].c === 0, 'account deleted')
ok((await q(`select count(*)::int c from profiles where id=$1`, [staff]))[0].c === 0, 'profile deleted')
ok((await q(`select count(*)::int c from memberships where user_id=$1`, [staff]))[0].c === 0, 'membership deleted')
ok((await q(`select count(*)::int c from auth.sessions where user_id=$1`, [staff]))[0].c === 0, 'signed out: sessions removed')
ok((await q(`select count(*)::int c from auth.refresh_tokens where user_id=$1`, [staff]))[0].c === 0, 'signed out: refresh tokens removed')
const hist = await q(`select created_by, created_by_name, qty from stock_movements`)
ok(hist.length === 1 && hist[0].created_by === null && hist[0].created_by_name === 'Saad' && +hist[0].qty === 10, 'stock history kept, still shows "Saad"')
ok(+(await as(owner, `select qty from product_stock where id=$1`, [p.id]))[0].qty === 10, 'stock levels unchanged')

// admin removes staff
await as(admin, `select remove_member($1,$2)`, [org.id, staff2])
ok((await q(`select count(*)::int c from auth.users where id=$1`, [staff2]))[0].c === 0, 'admin can remove staff')

// owner removes admin
await as(owner, `select remove_member($1,$2)`, [org.id, admin2])
ok((await q(`select count(*)::int c from auth.users where id=$1`, [admin2]))[0].c === 0, 'owner can remove admin')

// same email can be invited again
const again = await user('staff@shop.pk', { invite_code: await invite('staff'), full_name: 'Saad' })
ok((await q(`select role from memberships where user_id=$1 and org_id=$2`, [again, org.id]))[0]?.role === 'staff', 'removed email can join again with a new invite code')
ok((await as(owner, `select count(*)::int c from memberships where org_id=$1`, [org.id]))[0].c === 3, 'team now: owner, admin, re-joined staff')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
