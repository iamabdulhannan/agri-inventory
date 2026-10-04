// Tests admin_reset_password (003) and the owner reset tool in an in-memory Postgres with Supabase auth stubs.
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
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
  create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255));
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
`)
for (const f of ['../migrations/001_schema.sql', '../migrations/002_one_org_per_user.sql', '../migrations/003_password_reset.sql', '../migrations/003_password_reset.sql']) await db.exec(R(f))

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m) }
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const err = async (uid, sql, params) => { try { await as(uid, sql, params); return null } catch (e) { return e.message } }
const user = async (email, meta) => (await db.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, extensions.crypt('old-pass', extensions.gen_salt('bf')), $2) returning id`, [email, meta])).rows[0].id
const pwOk = async (id, pw) => (await db.query(`select encrypted_password = extensions.crypt($2, encrypted_password) ok from auth.users where id = $1`, [id, pw])).rows[0].ok

const owner = await user('owner@shop.pk', { org_name: 'Shop A' })
const [org] = await as(owner, `select id from organizations`)
const mk = async (email, role) => {
  const [inv] = await as(owner, `insert into invites (org_id, role) values ($1, $2) returning code`, [org.id, role])
  return user(email, { invite_code: inv.code })
}
const admin = await mk('admin@shop.pk', 'admin')
const admin2 = await mk('admin2@shop.pk', 'admin')
const staff = await mk('staff@shop.pk', 'staff')
const outsider = await user('other@x.pk', { org_name: 'Shop B' })
await db.query(`insert into auth.sessions (user_id) values ($1), ($1)`, [staff])
await db.query(`insert into auth.refresh_tokens (user_id) values ($1)`, [staff])

await as(owner, `select admin_reset_password($1, $2, 'staff-new-1')`, [org.id, staff])
ok(await pwOk(staff, 'staff-new-1'), 'owner resets staff password (bcrypt hash verifies)')
ok(!(await pwOk(staff, 'old-pass')), 'old staff password no longer works')
ok((await db.query(`select count(*)::int c from auth.sessions where user_id=$1`, [staff])).rows[0].c === 0, 'staff signed out of all sessions')
ok((await db.query(`select count(*)::int c from auth.refresh_tokens where user_id=$1`, [staff])).rows[0].c === 0, 'staff refresh tokens removed')

await as(owner, `select admin_reset_password($1, $2, 'admin-new-1')`, [org.id, admin])
ok(await pwOk(admin, 'admin-new-1'), 'owner resets admin password')

await as(admin, `select admin_reset_password($1, $2, 'staff-new-2')`, [org.id, staff])
ok(await pwOk(staff, 'staff-new-2'), 'admin resets staff password')

ok((await err(admin, `select admin_reset_password($1, $2, 'xxxxxx1')`, [org.id, admin2]))?.includes('NOT_ALLOWED'), 'admin cannot reset another admin')
ok((await err(admin, `select admin_reset_password($1, $2, 'xxxxxx1')`, [org.id, owner]))?.includes('NOT_ALLOWED'), 'admin cannot reset owner')
ok((await err(staff, `select admin_reset_password($1, $2, 'xxxxxx1')`, [org.id, admin]))?.includes('NOT_ALLOWED'), 'staff cannot reset anyone')
ok((await err(owner, `select admin_reset_password($1, $2, 'xxxxxx1')`, [org.id, outsider]))?.includes('NOT_ALLOWED'), 'owner cannot reset someone from another shop')
const [orgB] = await as(outsider, `select id from organizations`)
ok((await err(outsider, `select admin_reset_password($1, $2, 'xxxxxx1')`, [orgB.id, staff]))?.includes('NOT_ALLOWED'), 'other shop owner cannot reset our staff')
ok((await err(owner, `select admin_reset_password($1, $2, 'xxxxxx1')`, [org.id, owner]))?.includes('USE_PROFILE'), 'own password must be changed from profile')
ok((await err(owner, `select admin_reset_password($1, $2, '123')`, [org.id, staff]))?.includes('PASSWORD_TOO_SHORT'), 'short password rejected')
ok((await err(null, `select admin_reset_password($1, $2, 'xxxxxx1')`, [org.id, staff])) !== null, 'anonymous caller rejected')
ok(await pwOk(staff, 'staff-new-2'), 'failed attempts did not change the password')

// owner tool script
const tool = R('../tools/reset_owner_password.sql')
let e = null
try { await db.exec(tool.replaceAll('iamabdalhannan@gmail.com', 'owner@shop.pk')) } catch (x) { e = x.message }
ok(e?.includes('Set a new password'), 'owner tool refuses the placeholder password')
const res = await db.exec(tool.replaceAll('iamabdalhannan@gmail.com', 'owner@shop.pk').replace("'CHANGE-ME-123';", "'owner-new-77';"))
ok(await pwOk(owner, 'owner-new-77') && res.at(-1).rows[0].status.startsWith('password changed'), 'owner tool sets owner password and shows result')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
