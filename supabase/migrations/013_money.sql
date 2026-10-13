-- =====================================================================
-- Money: bank accounts, cheques, bank finance / guarantees, credit sales
-- (due dates, credit price, markup) and crop advances.
-- Run once in Supabase -> SQL Editor (after 012). Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bank accounts and wallets (cash in hand = entries without an account)
-- ---------------------------------------------------------------------
create table if not exists public.money_accounts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  kind            text not null check (kind in ('bank', 'wallet')),
  name            text not null check (length(trim(name)) > 0),
  bank_name       text,
  account_no      text,
  opening_balance numeric(14, 2) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (org_id, id)
);
create unique index if not exists money_accounts_name on public.money_accounts (org_id, lower(trim(name)));

-- ---------------------------------------------------------------------
-- 2. Bank facilities: finance (bank pays the company, you owe the bank)
--    and guarantees (security for a company's credit)
-- ---------------------------------------------------------------------
create table if not exists public.bank_facilities (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  kind          text not null check (kind in ('finance', 'guarantee')),
  bank_name     text not null check (length(trim(bank_name)) > 0),
  title         text,
  limit_amount  numeric(14, 2) not null default 0 check (limit_amount >= 0),
  start_date    date,
  expiry_date   date,                     -- repay by (finance) / guarantee valid until
  party_id      uuid,                     -- guarantee in favour of this company
  account_id    uuid,                     -- linked bank account (optional)
  is_active     boolean not null default true,
  note          text,
  created_at    timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict,
  foreign key (org_id, account_id) references public.money_accounts (org_id, id) on delete restrict
);

-- ---------------------------------------------------------------------
-- 3. Crop advances (kept apart from khata)
-- ---------------------------------------------------------------------
create table if not exists public.crop_advances (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  party_id   uuid not null,
  crop       text not null check (length(trim(crop)) > 0),
  season     text,
  note       text,
  is_closed  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict
);

-- ---------------------------------------------------------------------
-- 4. Cheques (received from customers / issued to companies), incl. post-dated
--    Khata changes only when the cheque clears.
-- ---------------------------------------------------------------------
create table if not exists public.cheques (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  direction   text not null check (direction in ('received', 'issued')),
  party_id    uuid not null,
  amount      numeric(14, 2) not null check (amount > 0),
  cheque_no   text,
  bank_name   text,
  cheque_date date not null,              -- date written on the cheque
  received_on date not null,              -- received / issued on
  status      text not null default 'pending' check (status in ('pending', 'cleared', 'bounced', 'cancelled')),
  account_id  uuid,                       -- deposited into / drawn on
  cleared_on  date,
  note        text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict,
  foreign key (org_id, account_id) references public.money_accounts (org_id, id) on delete restrict
);
create index if not exists cheques_org_idx on public.cheques (org_id, status, cheque_date);

-- ---------------------------------------------------------------------
-- 5. Money entries know their account, method and what they belong to
-- ---------------------------------------------------------------------
alter table public.cash_entries add column if not exists account_id  uuid;
alter table public.cash_entries add column if not exists method      text;
alter table public.cash_entries add column if not exists transfer_id uuid;
alter table public.cash_entries add column if not exists facility_id uuid;
alter table public.cash_entries add column if not exists advance_id  uuid;
alter table public.cash_entries add column if not exists cheque_id   uuid references public.cheques (id) on delete set null;
do $$ begin
  alter table public.cash_entries add constraint cash_entries_account_fk
    foreign key (org_id, account_id) references public.money_accounts (org_id, id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.cash_entries add constraint cash_entries_facility_fk
    foreign key (org_id, facility_id) references public.bank_facilities (org_id, id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.cash_entries add constraint cash_entries_advance_fk
    foreign key (org_id, advance_id) references public.crop_advances (org_id, id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.cash_entries add constraint cash_entries_method_check
    check (method is null or method in ('cash', 'bank', 'cheque', 'wallet'));
exception when duplicate_object then null; end $$;
create index if not exists cash_account_idx on public.cash_entries (account_id);

-- money the bank paid / was repaid, per facility
create table if not exists public.facility_entries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  facility_id    uuid not null,
  entry_date     date not null,
  kind           text not null check (kind in ('drawdown', 'repayment', 'markup')),
  amount         numeric(14, 2) not null check (amount > 0),
  party_id       uuid,                    -- company the bank paid (drawdown)
  cash_entry_id  uuid references public.cash_entries (id) on delete cascade,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at     timestamptz not null default now(),
  foreign key (org_id, facility_id) references public.bank_facilities (org_id, id) on delete restrict,
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict
);
create index if not exists facility_entries_idx on public.facility_entries (facility_id);
create index if not exists facility_entries_party_idx on public.facility_entries (party_id);

-- advance money in / used / refunded / moved to khata
create table if not exists public.advance_entries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  advance_id     uuid not null,
  entry_date     date not null,
  kind           text not null check (kind in ('deposit', 'use', 'refund', 'to_khata')),
  amount         numeric(14, 2) not null check (amount > 0),
  sale_id        uuid references public.sales (id) on delete cascade,
  cash_entry_id  uuid references public.cash_entries (id) on delete cascade,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at     timestamptz not null default now(),
  foreign key (org_id, advance_id) references public.crop_advances (org_id, id) on delete cascade
);
create index if not exists advance_entries_idx on public.advance_entries (advance_id);

-- ---------------------------------------------------------------------
-- 6. Credit sales: due date, markup, paid from advance; customer default due
-- ---------------------------------------------------------------------
alter table public.sales add column if not exists due_date     date;
alter table public.sales add column if not exists markup       numeric(14, 2) not null default 0;
alter table public.sales add column if not exists advance_used numeric(14, 2) not null default 0;
alter table public.sales add column if not exists advance_id   uuid;
do $$ begin
  alter table public.sales add constraint sales_advance_fk
    foreign key (org_id, advance_id) references public.crop_advances (org_id, id) on delete restrict;
exception when duplicate_object then null; end $$;
alter table public.sales drop constraint if exists sales_check;
do $$ begin
  alter table public.sales add constraint sales_amounts_check
    check (discount >= 0 and markup >= 0 and advance_used >= 0 and total >= 0 and paid >= 0
           and paid + advance_used <= total and total = subtotal - discount + markup);
exception when duplicate_object then null; end $$;
-- 'days:90' | 'date:12-31' (next 31 Dec) | null
alter table public.parties add column if not exists due_rule text;
alter table public.products add column if not exists credit_price numeric(12, 2);

-- ---------------------------------------------------------------------
-- RLS: members read and record; owner/admin manage
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['money_accounts', 'bank_facilities', 'crop_advances', 'cheques', 'facility_entries', 'advance_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(org_id))', t);
  end loop;
  -- accounts, facilities: owner/admin add and edit; advances: any member opens one
  foreach t in array array['money_accounts', 'bank_facilities'] loop
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_admin(org_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_admin(org_id)) with check (public.is_admin(org_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_admin(org_id))', t);
  end loop;
  drop policy if exists crop_advances_update on public.crop_advances;
  create policy crop_advances_update on public.crop_advances for update to authenticated
    using (public.is_member(org_id)) with check (public.is_member(org_id));
  -- cheques / facility / advance entries are written by the functions below; admins may delete a wrong one
  foreach t in array array['cheques', 'facility_entries', 'advance_entries', 'crop_advances'] loop
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_admin(org_id))', t);
  end loop;
end $$;
grant select, insert, update, delete on public.money_accounts, public.bank_facilities, public.crop_advances to authenticated;
grant select, delete on public.cheques, public.facility_entries, public.advance_entries to authenticated;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public._check_account(p_org uuid, p_account uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_account is not null and not exists
     (select 1 from public.money_accounts where id = p_account and org_id = p_org and is_active) then
    raise exception 'INVALID_ACCOUNT';
  end if;
end $$;

create or replace function public._method_of(p_org uuid, p_account uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p_account is null then 'cash'
              else coalesce((select kind from public.money_accounts where id = p_account and org_id = p_org), 'bank') end;
$$;

create or replace function public.advance_balance(p_advance uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'deposit' then amount else -amount end), 0)
  from public.advance_entries where advance_id = p_advance;
$$;
grant execute on function public.advance_balance(uuid) to authenticated;

-- name of the person saving (kept if they are removed later)
create or replace function public._who()
returns text language sql stable security definer set search_path = public as $$
  select full_name from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Money between cash and accounts
-- ---------------------------------------------------------------------
create or replace function public.record_transfer(
  p_org uuid, p_date date, p_from uuid, p_to uuid, p_amount numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid();
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_from is not distinct from p_to then raise exception 'INVALID_ACCOUNT'; end if;
  perform public._check_account(p_org, p_from);
  perform public._check_account(p_org, p_to);
  insert into public.cash_entries (org_id, entry_date, kind, amount, note, account_id, method, transfer_id, created_by_name)
  values (p_org, p_date, 'cash_out', -p_amount, nullif(trim(p_note), ''), p_from, public._method_of(p_org, p_from), v_id, public._who()),
         (p_org, p_date, 'cash_in',   p_amount, nullif(trim(p_note), ''), p_to,   public._method_of(p_org, p_to),   v_id, public._who());
  return v_id;
end $$;
grant execute on function public.record_transfer(uuid, date, uuid, uuid, numeric, text) to authenticated;

-- Khata payment (customer pays / we pay a supplier) into / from an account
drop function if exists public.record_party_payment(uuid, uuid, date, numeric, text);
create or replace function public.record_party_payment(
  p_org uuid, p_party uuid, p_date date, p_amount numeric, p_note text default null, p_account uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_kind public.party_kind; v_id uuid;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  perform public._check_account(p_org, p_account);
  select kind into v_kind from public.parties where id = p_party and org_id = p_org;
  if not found then raise exception 'INVALID_PARTY'; end if;
  insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, note, account_id, method)
  values (p_org, p_date,
          case when v_kind = 'customer' then 'receipt' else 'payment' end::public.cash_kind,
          case when v_kind = 'customer' then p_amount else -p_amount end,
          p_party, nullif(trim(p_note), ''), p_account, public._method_of(p_org, p_account))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.record_party_payment(uuid, uuid, date, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Cheques
-- ---------------------------------------------------------------------
create or replace function public.record_cheque(
  p_org uuid, p_direction text, p_party uuid, p_amount numeric, p_cheque_date date,
  p_cheque_no text default null, p_bank_name text default null, p_received_on date default null,
  p_account uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_direction not in ('received', 'issued') then raise exception 'INVALID_TYPE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_cheque_date is null then raise exception 'INVALID_DATE'; end if;
  if not exists (select 1 from public.parties where id = p_party and org_id = p_org
                 and kind = (case when p_direction = 'received' then 'customer' else 'supplier' end)::public.party_kind) then
    raise exception 'INVALID_PARTY';
  end if;
  if p_direction = 'issued' and p_account is null then raise exception 'INVALID_ACCOUNT'; end if;
  perform public._check_account(p_org, p_account);
  insert into public.cheques (org_id, direction, party_id, amount, cheque_no, bank_name, cheque_date, received_on, account_id, note, created_by_name)
  values (p_org, p_direction, p_party, p_amount, nullif(trim(p_cheque_no), ''), nullif(trim(p_bank_name), ''), p_cheque_date,
          coalesce(p_received_on, public.org_today(p_org)), p_account, nullif(trim(p_note), ''), public._who())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.record_cheque(uuid, text, uuid, numeric, date, text, text, date, uuid, text) to authenticated;

-- pending -> cleared (money reaches the account, khata changes) / bounced / cancelled;
-- cleared -> pending undoes the clearing (owner/admin)
create or replace function public.set_cheque_status(
  p_org uuid, p_cheque uuid, p_status text, p_date date default null, p_account uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare c public.cheques; v_date date := coalesce(p_date, public.org_today(p_org)); v_acc uuid; v_cash uuid;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  select * into c from public.cheques where id = p_cheque and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_status = 'cleared' then
    if c.status <> 'pending' then raise exception 'INVALID_STATUS'; end if;
    if v_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
    v_acc := coalesce(p_account, c.account_id);
    if v_acc is null then raise exception 'INVALID_ACCOUNT'; end if;
    perform public._check_account(p_org, v_acc);
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, note, account_id, method, cheque_id, created_by_name)
    values (p_org, v_date,
            case when c.direction = 'received' then 'receipt' else 'payment' end::public.cash_kind,
            case when c.direction = 'received' then c.amount else -c.amount end,
            c.party_id, concat_ws(' ', 'Cheque', c.cheque_no, c.bank_name), v_acc, 'cheque', c.id, public._who())
    returning id into v_cash;
    update public.cheques set status = 'cleared', cleared_on = v_date, account_id = v_acc where id = c.id;
  elsif p_status in ('bounced', 'cancelled') then
    if c.status <> 'pending' then raise exception 'INVALID_STATUS'; end if;
    update public.cheques set status = p_status, cleared_on = v_date where id = c.id;
  elsif p_status = 'pending' then
    if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
    delete from public.cash_entries where cheque_id = c.id;
    update public.cheques set status = 'pending', cleared_on = null where id = c.id;
  else
    raise exception 'INVALID_STATUS';
  end if;
  return p_status;
end $$;
grant execute on function public.set_cheque_status(uuid, uuid, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Bank facilities
-- ---------------------------------------------------------------------
-- The bank paid a company for you (finance, or a guarantee the company encashed):
-- the company's dues go down, what you owe the bank goes up.
create or replace function public.facility_drawdown(
  p_org uuid, p_facility uuid, p_date date, p_amount numeric, p_party uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists (select 1 from public.bank_facilities where id = p_facility and org_id = p_org) then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.parties where id = p_party and org_id = p_org and kind = 'supplier') then raise exception 'INVALID_PARTY'; end if;
  insert into public.facility_entries (org_id, facility_id, entry_date, kind, amount, party_id, note, created_by_name)
  values (p_org, p_facility, p_date, 'drawdown', p_amount, p_party, nullif(trim(p_note), ''), public._who())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.facility_drawdown(uuid, uuid, date, numeric, uuid, text) to authenticated;

-- You pay the bank back: principal lowers what you owe; markup / charges are an expense
create or replace function public.facility_repay(
  p_org uuid, p_facility uuid, p_date date, p_principal numeric, p_markup numeric default 0,
  p_account uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f public.bank_facilities; v_cash uuid; v_owed numeric;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if coalesce(p_principal, 0) < 0 or coalesce(p_markup, 0) < 0 or coalesce(p_principal, 0) + coalesce(p_markup, 0) = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  select * into f from public.bank_facilities where id = p_facility and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public._check_account(p_org, p_account);
  select coalesce(sum(case when kind = 'drawdown' then amount when kind = 'repayment' then -amount else 0 end), 0)
    into v_owed from public.facility_entries where facility_id = p_facility;
  if coalesce(p_principal, 0) > v_owed then raise exception 'REPAY_TOO_MUCH' using detail = format('You owe %s on this facility', v_owed); end if;
  if coalesce(p_principal, 0) > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, note, account_id, method, facility_id, created_by_name)
    values (p_org, p_date, 'cash_out', -p_principal, concat_ws(' · ', 'Bank repayment', f.bank_name, nullif(trim(p_note), '')),
            p_account, public._method_of(p_org, p_account), p_facility, public._who())
    returning id into v_cash;
    insert into public.facility_entries (org_id, facility_id, entry_date, kind, amount, cash_entry_id, note, created_by_name)
    values (p_org, p_facility, p_date, 'repayment', p_principal, v_cash, nullif(trim(p_note), ''), public._who());
  end if;
  if coalesce(p_markup, 0) > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, note, account_id, method, facility_id, created_by_name)
    values (p_org, p_date, 'expense', -p_markup, concat_ws(' · ', 'Bank markup', f.bank_name, nullif(trim(p_note), '')),
            p_account, public._method_of(p_org, p_account), p_facility, public._who())
    returning id into v_cash;
    insert into public.facility_entries (org_id, facility_id, entry_date, kind, amount, cash_entry_id, note, created_by_name)
    values (p_org, p_facility, p_date, 'markup', p_markup, v_cash, nullif(trim(p_note), ''), public._who());
  end if;
end $$;
grant execute on function public.facility_repay(uuid, uuid, date, numeric, numeric, uuid, text) to authenticated;

-- One row per facility with what is owed / used
create or replace function public.facility_summary(p_org uuid)
returns table (facility_id uuid, drawn numeric, repaid numeric, markup_paid numeric, owed numeric, guarantee_used numeric)
language sql stable security invoker set search_path = public as $$
  select f.id,
         coalesce(sum(e.amount) filter (where e.kind = 'drawdown'), 0),
         coalesce(sum(e.amount) filter (where e.kind = 'repayment'), 0),
         coalesce(sum(e.amount) filter (where e.kind = 'markup'), 0),
         coalesce(sum(e.amount) filter (where e.kind = 'drawdown'), 0) - coalesce(sum(e.amount) filter (where e.kind = 'repayment'), 0),
         -- a guarantee covers what you currently owe the company it is given to
         case when f.kind = 'guarantee' and f.party_id is not null
              then greatest((select balance from public.party_balances where id = f.party_id), 0) end
  from public.bank_facilities f
  left join public.facility_entries e on e.facility_id = f.id
  where f.org_id = p_org
  group by f.id;
$$;
grant execute on function public.facility_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Crop advances
-- ---------------------------------------------------------------------
create or replace function public.open_crop_advance(
  p_org uuid, p_party uuid, p_crop text, p_season text, p_date date, p_amount numeric,
  p_account uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if not exists (select 1 from public.parties where id = p_party and org_id = p_org and kind = 'customer') then raise exception 'INVALID_PARTY'; end if;
  insert into public.crop_advances (org_id, party_id, crop, season, note)
  values (p_org, p_party, trim(p_crop), nullif(trim(p_season), ''), nullif(trim(p_note), ''))
  returning id into v_id;
  if coalesce(p_amount, 0) > 0 then
    perform public.advance_move(p_org, v_id, 'deposit', p_date, p_amount, p_account, p_note);
  end if;
  return v_id;
end $$;

-- deposit (money in), refund (money out), to_khata (leftover lowers his khata)
create or replace function public.advance_move(
  p_org uuid, p_advance uuid, p_kind text, p_date date, p_amount numeric,
  p_account uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.crop_advances; v_cash uuid; v_id uuid; v_name text; v_left numeric;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_kind not in ('deposit', 'refund', 'to_khata') then raise exception 'INVALID_TYPE'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into a from public.crop_advances where id = p_advance and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public._check_account(p_org, p_account);
  if p_kind <> 'deposit' then
    v_left := public.advance_balance(p_advance);
    if p_amount > v_left then raise exception 'ADVANCE_TOO_MUCH' using detail = format('Only %s left in this advance', v_left); end if;
  end if;
  select name into v_name from public.parties where id = a.party_id;
  if p_kind in ('deposit', 'refund') then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, note, account_id, method, advance_id, created_by_name)
    values (p_org, p_date,
            case when p_kind = 'deposit' then 'cash_in' else 'cash_out' end::public.cash_kind,
            case when p_kind = 'deposit' then p_amount else -p_amount end,
            a.party_id, concat_ws(' · ', case when p_kind = 'deposit' then 'Crop advance' else 'Advance refund' end,
                                  concat_ws(' ', a.crop, a.season), nullif(trim(p_note), '')),
            p_account, public._method_of(p_org, p_account), a.id, public._who())
    returning id into v_cash;
  end if;
  insert into public.advance_entries (org_id, advance_id, entry_date, kind, amount, cash_entry_id, note, created_by_name)
  values (p_org, a.id, p_date, p_kind, p_amount, v_cash, nullif(trim(p_note), ''), public._who())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.open_crop_advance(uuid, uuid, text, text, date, numeric, uuid, text) to authenticated;
grant execute on function public.advance_move(uuid, uuid, text, date, numeric, uuid, text) to authenticated;

-- every advance with what is in it
create or replace view public.crop_advance_balances with (security_invoker = true) as
select a.*, p.name as party_name, p.phone as party_phone,
       coalesce(sum(e.amount) filter (where e.kind = 'deposit'), 0)  as deposited,
       coalesce(sum(e.amount) filter (where e.kind = 'use'), 0)      as used,
       coalesce(sum(e.amount) filter (where e.kind = 'refund'), 0)   as refunded,
       coalesce(sum(e.amount) filter (where e.kind = 'to_khata'), 0) as moved_to_khata,
       coalesce(sum(case when e.kind = 'deposit' then e.amount else -e.amount end), 0) as balance,
       max(e.entry_date) as last_activity
from public.crop_advances a
join public.parties p on p.id = a.party_id
left join public.advance_entries e on e.advance_id = a.id
group by a.id, p.name, p.phone;
grant select on public.crop_advance_balances to authenticated;

-- ---------------------------------------------------------------------
-- Sales, purchases and khata with the new money
-- ---------------------------------------------------------------------
drop function if exists public.record_sale(uuid, date, jsonb, uuid, text, numeric, numeric, text);
create or replace function public.record_sale(
  p_org uuid, p_date date, p_lines jsonb,
  p_party_id uuid default null, p_customer_name text default null,
  p_discount numeric default 0, p_paid numeric default null, p_note text default null,
  p_markup numeric default 0, p_due_date date default null, p_account uuid default null,
  p_advance uuid default null, p_advance_amount numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l       jsonb;
  b       record;
  v_sale  uuid;
  v_no    int;
  v_name  text := nullif(trim(p_customer_name), '');
  v_need  numeric;
  v_take  numeric;
  v_rate  numeric;
  v_sub   numeric := 0;
  v_disc  numeric := coalesce(p_discount, 0);
  v_total numeric;
  v_paid  numeric;
  v_loose boolean;
  v_mark  numeric := coalesce(p_markup, 0);
  v_adv   numeric := coalesce(p_advance_amount, 0);
  v_left  numeric;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;

  if p_party_id is not null then
    select name into v_name from public.parties where id = p_party_id and org_id = p_org and kind = 'customer';
    if not found then raise exception 'INVALID_PARTY'; end if;
  end if;
  perform public._check_account(p_org, p_account);
  if v_mark < 0 then raise exception 'INVALID_AMOUNT'; end if;
  -- paying (part of) the bill from the customer's crop advance
  if v_adv < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_adv > 0 then
    if p_party_id is null or p_advance is null then raise exception 'INVALID_ADVANCE'; end if;
    perform 1 from public.crop_advances where id = p_advance and org_id = p_org and party_id = p_party_id and not is_closed for update;
    if not found then raise exception 'INVALID_ADVANCE'; end if;
    v_left := public.advance_balance(p_advance);
    if v_adv > v_left then raise exception 'ADVANCE_TOO_MUCH' using detail = format('Only %s left in this advance', v_left); end if;
  end if;

  v_no := public.next_doc_no(p_org, 'invoice');
  insert into public.sales (org_id, invoice_no, sale_date, party_id, customer_name, note)
  values (p_org, v_no, p_date, p_party_id, v_name, nullif(trim(p_note), ''))
  returning id into v_sale;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_need := (l->>'qty')::numeric;
    v_rate := (l->>'unit_price')::numeric;
    if v_need is null or v_need <= 0 then raise exception 'INVALID_QTY'; end if;
    if v_rate is null or v_rate < 0 then raise exception 'INVALID_PRICE'; end if;
    v_sub := v_sub + round(v_need * v_rate, 2);
    -- a bag sold by weight (kg): qty is still in bags (e.g. 0.25), the flag only changes how it is shown
    v_loose := coalesce((l->>'loose')::boolean, false)
               and exists (select 1 from public.products where id = (l->>'product_id')::uuid and org_id = p_org and pack_type = 'bag');

    perform 1 from public.batches where org_id = p_org and product_id = (l->>'product_id')::uuid for update;

    for b in
      select bs.id, bs.qty, bs.expiry_date, coalesce(bs.avg_cost, p.purchase_price, 0) as cost
      from public.batch_stock bs join public.products p on p.id = bs.product_id
      where bs.org_id = p_org
        and bs.product_id = (l->>'product_id')::uuid
        and bs.qty > 0
        and (nullif(l->>'batch_id', '') is null or bs.id = (l->>'batch_id')::uuid)
        and bs.expiry_date >= p_date                     -- never sell expired stock
      order by bs.expiry_date, bs.created_at
    loop
      exit when v_need <= 0;
      v_take := least(v_need, b.qty);
      -- loose sales leave rounding dust (10 kg of a 60 kg bag = 0.166667): never leave a millionth of a bag behind
      if b.qty - v_take < 0.00001 then v_take := b.qty; end if;
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, unit_cost, sale_id, party, reference, loose)
      values (p_org, b.id, p_date, 'sale', -v_take, v_rate, b.cost, v_sale, v_name, 'INV-' || v_no, v_loose);
      v_need := v_need - v_take;
      if v_need < 0.00001 then v_need := 0; end if;
    end loop;

    if v_need > 0 then
      raise exception 'INSUFFICIENT_STOCK' using detail = format('Short by %s for product %s', v_need, l->>'product_id');
    end if;
  end loop;

  if v_disc < 0 or v_disc > v_sub then raise exception 'INVALID_DISCOUNT'; end if;
  v_total := v_sub - v_disc + round(v_mark, 2);
  if v_adv > v_total then raise exception 'ADVANCE_TOO_MUCH'; end if;
  v_paid := coalesce(p_paid, v_total - v_adv);
  if v_paid < 0 or v_paid + v_adv > v_total then raise exception 'INVALID_PAID'; end if;
  if v_paid + v_adv < v_total and p_party_id is null then raise exception 'CREDIT_NEEDS_PARTY'; end if;

  update public.sales
     set subtotal = v_sub, discount = v_disc, markup = round(v_mark, 2), total = v_total, paid = v_paid,
         advance_used = v_adv, advance_id = case when v_adv > 0 then p_advance end,
         due_date = case when v_paid + v_adv < v_total then p_due_date end
   where id = v_sale;
  if v_paid > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, sale_id, note, account_id, method)
    values (p_org, p_date, 'sale', v_paid, p_party_id, v_sale, 'INV-' || v_no, p_account, public._method_of(p_org, p_account));
  end if;
  if v_adv > 0 then
    insert into public.advance_entries (org_id, advance_id, entry_date, kind, amount, sale_id, note)
    values (p_org, p_advance, p_date, 'use', v_adv, v_sale, 'INV-' || v_no);
  end if;
  return v_sale;
end $$;
grant execute on function public.record_sale(uuid, date, jsonb, uuid, text, numeric, numeric, text, numeric, date, uuid, uuid, numeric) to authenticated;

drop function if exists public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text, uuid, numeric, boolean);
create or replace function public.record_stock_in(
  p_org uuid, p_date date, p_type public.movement_type, p_lines jsonb,
  p_party text default null, p_reference text default null, p_note text default null,
  p_party_id uuid default null, p_paid numeric default null, p_opening boolean default false,
  p_account uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l          jsonb;
  v_batch    public.batches;
  v_no       text;
  v_exp      date;
  v_mfg      date;
  v_qty      numeric;
  v_rate     numeric;
  v_total    numeric := 0;
  v_paid     numeric;
  v_purchase uuid;
  v_name     text := nullif(trim(p_party), '');
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_type not in ('purchase', 'return_in') then raise exception 'INVALID_TYPE'; end if;
  if p_opening and p_type <> 'purchase' then raise exception 'INVALID_TYPE'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;
  perform public._check_account(p_org, p_account);

  if p_party_id is not null and not p_opening then
    select name into v_name from public.parties
     where id = p_party_id and org_id = p_org and kind = (case when p_type = 'purchase' then 'supplier' else 'customer' end)::public.party_kind;
    if not found then raise exception 'INVALID_PARTY'; end if;
  end if;

  -- a real purchase gets a purchase document; opening stock does not
  if p_type = 'purchase' and not p_opening then
    insert into public.purchases (org_id, purchase_no, purchase_date, party_id, supplier_name, reference, note)
    values (p_org, public.next_doc_no(p_org, 'purchase'), p_date, p_party_id, v_name,
            nullif(trim(p_reference), ''), nullif(trim(p_note), ''))
    returning id into v_purchase;
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty  := (l->>'qty')::numeric;
    v_exp  := (l->>'expiry_date')::date;
    v_mfg  := nullif(l->>'mfg_date', '')::date;
    v_no   := nullif(trim(l->>'batch_no'), '');
    v_rate := nullif(l->>'unit_price', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    if v_exp is null then raise exception 'EXPIRY_REQUIRED'; end if;
    if v_rate is not null and v_rate < 0 then raise exception 'INVALID_PRICE'; end if;
    v_no := coalesce(v_no, 'EXP-' || to_char(v_exp, 'YYYY-MM-DD'));

    select * into v_batch from public.batches
     where org_id = p_org and product_id = (l->>'product_id')::uuid and batch_no = v_no;
    if not found then
      insert into public.batches (org_id, product_id, batch_no, mfg_date, expiry_date)
      values (p_org, (l->>'product_id')::uuid, v_no, v_mfg, v_exp)
      returning * into v_batch;
    elsif v_batch.expiry_date <> v_exp then
      raise exception 'BATCH_EXPIRY_MISMATCH' using detail = format('Batch %s already exists with expiry %s', v_no, v_batch.expiry_date);
    end if;

    insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, purchase_id, party, reference, note)
    values (p_org, v_batch.id, p_date, p_type, v_qty, v_rate, v_purchase,
            case when p_opening then null else v_name end,
            case when p_opening then coalesce(nullif(trim(p_reference), ''), 'Opening stock') else nullif(trim(p_reference), '') end,
            nullif(trim(p_note), ''));

    if p_type = 'purchase' and v_rate is not null then
      v_total := v_total + round(v_qty * v_rate, 2);
      if v_rate > 0 then
        update public.products set purchase_price = v_rate where id = (l->>'product_id')::uuid and org_id = p_org;
      end if;
    end if;
  end loop;

  if v_purchase is not null then
    v_paid := coalesce(p_paid, v_total);
    if v_paid < 0 or v_paid > v_total then raise exception 'INVALID_PAID'; end if;
    if v_paid < v_total and p_party_id is null then raise exception 'CREDIT_NEEDS_PARTY'; end if;
    update public.purchases set total = v_total, paid = v_paid where id = v_purchase;
    if v_paid > 0 then
      insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, purchase_id, note, account_id, method)
      values (p_org, p_date, 'purchase', -v_paid, p_party_id, v_purchase, nullif(trim(p_reference), ''), p_account, public._method_of(p_org, p_account));
    end if;
  end if;
  return v_purchase;
end $$;
grant execute on function public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text, uuid, numeric, boolean, uuid) to authenticated;

create or replace function public.update_purchase(
  p_org uuid, p_purchase uuid, p_date date, p_lines jsonb,
  p_party text default null, p_reference text default null, p_note text default null,
  p_party_id uuid default null, p_paid numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pur     public.purchases;
  v_old     uuid[];
  v_by      uuid;
  v_by_name text;
  l         jsonb;
  v_batch   uuid;
  v_qty     numeric;
  v_rate    numeric;
  v_total   numeric := 0;
  v_paid    numeric;
  v_name    text := nullif(trim(p_party), '');
  v_acc     uuid;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  select * into v_pur from public.purchases where id = p_purchase and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;
  if p_party_id is not null then
    select name into v_name from public.parties where id = p_party_id and org_id = p_org and kind = 'supplier';
    if not found then raise exception 'INVALID_PARTY'; end if;
  end if;

  -- stock is checked once, at the end, against the final result
  set constraints public.stock_movements_balance deferred;

  select array_agg(distinct batch_id), (array_agg(created_by))[1], (array_agg(created_by_name))[1]
    into v_old, v_by, v_by_name
  from public.stock_movements where purchase_id = p_purchase;
  delete from public.stock_movements where purchase_id = p_purchase;
  -- the payment keeps the account it was paid from
  select account_id into v_acc from public.cash_entries where purchase_id = p_purchase limit 1;
  delete from public.cash_entries where purchase_id = p_purchase;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty  := (l->>'qty')::numeric;
    v_rate := nullif(l->>'unit_price', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    if v_rate is not null and v_rate < 0 then raise exception 'INVALID_PRICE'; end if;
    v_batch := public._batch_for(p_org, (l->>'product_id')::uuid, l->>'batch_no', (l->>'expiry_date')::date, nullif(l->>'mfg_date', '')::date);
    insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, purchase_id, party, reference, note, created_by, created_by_name)
    values (p_org, v_batch, p_date, 'purchase', v_qty, v_rate, p_purchase, v_name,
            nullif(trim(p_reference), ''), nullif(trim(p_note), ''), coalesce(v_by, auth.uid()), v_by_name);
    if v_rate is not null then
      v_total := v_total + round(v_qty * v_rate, 2);
      if v_rate > 0 then
        update public.products set purchase_price = v_rate where id = (l->>'product_id')::uuid and org_id = p_org;
      end if;
    end if;
  end loop;

  v_paid := coalesce(p_paid, v_total);
  if v_paid < 0 or v_paid > v_total then raise exception 'INVALID_PAID'; end if;
  if v_paid < v_total and p_party_id is null then raise exception 'CREDIT_NEEDS_PARTY'; end if;

  update public.purchases
     set purchase_date = p_date, party_id = p_party_id, supplier_name = v_name,
         reference = nullif(trim(p_reference), ''), note = nullif(trim(p_note), ''),
         total = v_total, paid = v_paid
   where id = p_purchase;
  if v_paid > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, purchase_id, note, created_by, created_by_name, account_id, method)
    values (p_org, p_date, 'purchase', -v_paid, p_party_id, p_purchase, nullif(trim(p_reference), ''), coalesce(v_by, auth.uid()), v_by_name, v_acc, public._method_of(p_org, v_acc));
  end if;

  -- batches that this purchase created and no longer uses
  delete from public.batches b
   where b.id = any(coalesce(v_old, '{}')) and not exists (select 1 from public.stock_movements m where m.batch_id = b.id);
  return p_purchase;
end $$;

-- products now carry an optional credit (udhaar) price
create or replace view public.product_stock with (security_invoker = true) as
select p.id, p.org_id, p.name, p.name_ur, p.category_id, p.company_id,
       p.pack_size, p.pack_unit, p.pack_type, p.min_stock, p.is_active, p.notes, p.created_at,
       c.name    as category_name,
       c.name_ur as category_name_ur,
       co.name   as company_name,
       coalesce(sum(bs.qty), 0)::numeric(16, 6)          as qty,
       min(bs.expiry_date) filter (where bs.qty > 0)     as next_expiry,
       count(bs.id) filter (where bs.qty > 0)::int       as active_batches,
       p.purchase_price,
       p.sale_price,
       coalesce(sum(greatest(bs.qty, 0) * coalesce(bs.avg_cost, p.purchase_price)), 0)::numeric(14, 2) as stock_value,
       p.credit_price
from public.products p
join public.categories c on c.id = p.category_id
left join public.companies co on co.id = p.company_id
left join public.batch_stock bs on bs.product_id = p.id
group by p.id, c.id, co.id;

-- khata balance: sales minus cash and advance, bank-paid company bills and advances moved to khata
drop view if exists public.party_balances;
create view public.party_balances with (security_invoker = true) as
select p.*,
       (p.opening_balance
        + coalesce((select sum(s.total - s.paid - s.advance_used) from public.sales s where s.party_id = p.id), 0)
        + coalesce((select sum(u.total - u.paid) from public.purchases u where u.party_id = p.id), 0)
        - coalesce((select sum(abs(c.amount)) from public.cash_entries c
                    where c.party_id = p.id and c.kind in ('receipt', 'payment')), 0)
        - coalesce((select sum(r.total - r.refund) from public.sale_returns r where r.party_id = p.id), 0)
        - coalesce((select sum(f.amount) from public.facility_entries f where f.party_id = p.id and f.kind = 'drawdown'), 0)
        - coalesce((select sum(e.amount) from public.advance_entries e join public.crop_advances a on a.id = e.advance_id
                    where a.party_id = p.id and e.kind = 'to_khata'), 0))::numeric(14, 2) as balance,
       greatest(
         (select max(s.sale_date) from public.sales s where s.party_id = p.id),
         (select max(u.purchase_date) from public.purchases u where u.party_id = p.id),
         (select max(c.entry_date) from public.cash_entries c where c.party_id = p.id),
         (select max(r.return_date) from public.sale_returns r where r.party_id = p.id),
         (select max(f.entry_date) from public.facility_entries f where f.party_id = p.id)) as last_activity
from public.parties p;
grant select on public.party_balances to authenticated;

create or replace function public.party_ledger(p_party uuid)
returns table (entry_date date, kind text, ref text, note text, bill numeric, paid numeric, balance numeric, doc_id uuid, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with rows as (
    select p.created_at::date as entry_date, 'opening'::text as kind, null::text as ref, null::text as note,
           p.opening_balance as bill, 0::numeric as paid, null::uuid as doc_id, p.created_at, 0 as ord
    from public.parties p where p.id = p_party and p.opening_balance <> 0
    union all
    select s.sale_date, 'sale', 'INV-' || s.invoice_no, s.note, s.total, s.paid + s.advance_used, s.id, s.created_at, 1
    from public.sales s where s.party_id = p_party
    union all
    select u.purchase_date, 'purchase', coalesce(u.reference, 'PUR-' || u.purchase_no), u.note, u.total, u.paid, u.id, u.created_at, 1
    from public.purchases u where u.party_id = p_party
    union all
    select r.return_date, 'return', 'INV-' || s.invoice_no, r.note, r.refund, r.total, r.sale_id, r.created_at, 1
    from public.sale_returns r join public.sales s on s.id = r.sale_id where r.party_id = p_party
    union all
    select c.entry_date, c.kind::text, case when c.cheque_id is not null then 'CHQ' end, c.note, 0, abs(c.amount), c.id, c.created_at, 2
    from public.cash_entries c where c.party_id = p_party and c.kind in ('receipt', 'payment')
    union all
    select f.entry_date, 'bank_paid', b.bank_name, f.note, 0, f.amount, f.id, f.created_at, 2
    from public.facility_entries f join public.bank_facilities b on b.id = f.facility_id
    where f.party_id = p_party and f.kind = 'drawdown'
    union all
    select e.entry_date, 'advance_moved', concat_ws(' ', a.crop, a.season), e.note, 0, e.amount, e.id, e.created_at, 2
    from public.advance_entries e join public.crop_advances a on a.id = e.advance_id
    where a.party_id = p_party and e.kind = 'to_khata'
  )
  select entry_date, kind, ref, note, bill, paid,
         sum(bill - paid) over (order by (ord <> 0), entry_date, ord, created_at rows unbounded preceding) as balance,
         doc_id, created_at
  from rows
  order by (ord <> 0), entry_date, ord, created_at;
$$;

-- What each customer still owes per invoice, oldest first (payments clear the oldest bills)
create or replace function public.customer_dues(p_org uuid)
returns table (party_id uuid, sale_id uuid, invoice_no int, sale_date date, due_date date, amount numeric, outstanding numeric)
language sql stable security invoker set search_path = public as $$
  with charges as (
    select p.id as party_id, null::uuid as sale_id, null::int as invoice_no, p.created_at::date as sale_date,
           null::date as due_date, p.opening_balance as amount, 0 as ord, p.created_at as ts
    from public.parties p where p.org_id = p_org and p.kind = 'customer' and p.opening_balance > 0
    union all
    select s.party_id, s.id, s.invoice_no, s.sale_date, s.due_date, s.total - s.paid - s.advance_used, 1, s.created_at
    from public.sales s where s.org_id = p_org and s.party_id is not null and s.total - s.paid - s.advance_used > 0
  ),
  credits as (
    select p.id as party_id,
           greatest(-p.opening_balance, 0)
           + coalesce((select sum(c.amount) from public.cash_entries c where c.party_id = p.id and c.kind = 'receipt'), 0)
           + coalesce((select sum(r.total - r.refund) from public.sale_returns r where r.party_id = p.id), 0)
           + coalesce((select sum(e.amount) from public.advance_entries e join public.crop_advances a on a.id = e.advance_id
                       where a.party_id = p.id and e.kind = 'to_khata'), 0) as paid
    from public.parties p where p.org_id = p_org and p.kind = 'customer'
  ),
  run as (
    select c.*, sum(c.amount) over (partition by c.party_id order by c.ord, c.sale_date, c.ts rows unbounded preceding) as cum
    from charges c
  )
  select r.party_id, r.sale_id, r.invoice_no, r.sale_date, r.due_date, r.amount,
         least(r.amount, r.cum - coalesce(cr.paid, 0))
  from run r left join credits cr on cr.party_id = r.party_id
  where r.cum - coalesce(cr.paid, 0) > 0
  order by r.due_date nulls last, r.sale_date;
$$;
grant execute on function public.customer_dues(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Cash book per account, dashboard money
-- ---------------------------------------------------------------------
drop function if exists public.cash_days(uuid, date, date);
create or replace function public.cash_days(p_org uuid, p_from date, p_to date, p_account uuid default null)
returns table (day date, opening numeric, cash_in numeric, cash_out numeric, closing numeric)
language sql stable security invoker set search_path = public as $$
  with base as (
    select coalesce(sum(amount), 0)
           + coalesce((select opening_balance from public.money_accounts where id = p_account), 0) as amt
    from public.cash_entries
    where org_id = p_org and entry_date < p_from and account_id is not distinct from p_account
  ),
  d as (
    select entry_date as day,
           coalesce(sum(amount) filter (where amount > 0), 0)  as cin,
           coalesce(-sum(amount) filter (where amount < 0), 0) as cout
    from public.cash_entries
    where org_id = p_org and entry_date between p_from and p_to and account_id is not distinct from p_account
    group by entry_date
  ),
  g as (
    select x::date as day from generate_series(p_from, p_to, interval '1 day') x
  )
  select g.day,
         (select amt from base) + coalesce(sum(coalesce(d.cin, 0) - coalesce(d.cout, 0)) over w_prev, 0),
         coalesce(d.cin, 0), coalesce(d.cout, 0),
         (select amt from base) + sum(coalesce(d.cin, 0) - coalesce(d.cout, 0)) over w_all
  from g left join d on d.day = g.day
  window w_all  as (order by g.day rows between unbounded preceding and current row),
         w_prev as (order by g.day rows between unbounded preceding and 1 preceding)
  order by g.day;
$$;
grant execute on function public.cash_days(uuid, date, date, uuid) to authenticated;

-- dashboard: cash in hand is cash only now; banks are shown on their own
create or replace function public.money_summary(p_org uuid, p_today date)
returns table (today_sales numeric, today_profit numeric, today_received numeric, month_sales numeric, month_profit numeric,
               cash_in_hand numeric, receivable numeric, payable numeric, stock_value numeric, today_expenses numeric)
language sql stable security invoker set search_path = public as $$
  with t as (select * from public.sales_days(p_org, p_today, p_today)),
       m as (select * from public.sales_days(p_org, date_trunc('month', p_today)::date, p_today))
  select coalesce((select sum(sales) from t), 0),
         coalesce((select sum(profit) from t), 0),
         coalesce((select sum(amount) from public.cash_entries where org_id = p_org and entry_date = p_today and amount > 0 and transfer_id is null), 0),
         coalesce((select sum(sales) from m), 0),
         coalesce((select sum(profit) from m), 0),
         coalesce((select sum(amount) from public.cash_entries where org_id = p_org and account_id is null), 0),
         coalesce((select sum(balance) from public.party_balances where org_id = p_org and kind = 'customer' and balance > 0), 0),
         coalesce((select sum(balance) from public.party_balances where org_id = p_org and kind = 'supplier' and balance > 0), 0),
         coalesce((select sum(stock_value) from public.product_stock where org_id = p_org), 0),
         coalesce((select -sum(amount) from public.cash_entries where org_id = p_org and entry_date = p_today and kind = 'expense'), 0);
$$;

-- everything about money in one call (dashboard + bank page)
create or replace function public.money_position(p_org uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_today date := public.org_today(p_org);
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  return jsonb_build_object(
    'cash', coalesce((select sum(amount) from public.cash_entries where org_id = p_org and account_id is null), 0),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'bank_name', a.bank_name,
                                  'account_no', a.account_no, 'is_active', a.is_active,
                                  'balance', a.opening_balance + coalesce((select sum(c.amount) from public.cash_entries c where c.account_id = a.id), 0))
                                  order by a.name)
                          from public.money_accounts a where a.org_id = p_org), '[]'::jsonb),
    'cheques_in_hand', coalesce((select sum(amount) from public.cheques where org_id = p_org and direction = 'received' and status = 'pending'), 0),
    'cheques_in_count', (select count(*) from public.cheques where org_id = p_org and direction = 'received' and status = 'pending'),
    'cheques_due_week', (select count(*) from public.cheques where org_id = p_org and status = 'pending' and cheque_date <= v_today + 7),
    'cheques_out_pending', coalesce((select sum(amount) from public.cheques where org_id = p_org and direction = 'issued' and status = 'pending'), 0),
    'bank_owed', coalesce((select sum(case when kind = 'drawdown' then amount when kind = 'repayment' then -amount else 0 end)
                           from public.facility_entries where org_id = p_org), 0),
    'next_bank_due', (select min(f.expiry_date) from public.bank_facilities f
                      where f.org_id = p_org and f.is_active and f.kind = 'finance' and f.expiry_date is not null
                        and exists (select 1 from public.facility_entries e where e.facility_id = f.id and e.kind = 'drawdown')),
    'guarantees_expiring', (select count(*) from public.bank_facilities where org_id = p_org and is_active and kind = 'guarantee'
                              and expiry_date between v_today and v_today + 60),
    'crop_advances', coalesce((select sum(case when e.kind = 'deposit' then e.amount else -e.amount end) from public.advance_entries e where e.org_id = p_org), 0),
    'dues_overdue', coalesce((select sum(outstanding) from public.customer_dues(p_org) where due_date < v_today), 0),
    'dues_next_30', coalesce((select sum(outstanding) from public.customer_dues(p_org) where due_date between v_today and v_today + 30), 0)
  );
end $$;
grant execute on function public.money_position(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Year report with bank, cheques and advances
-- ---------------------------------------------------------------------
create or replace function public.year_report(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  r          jsonb := '{}'::jsonb;
  v_open     numeric; v_close numeric;
  v_purch    numeric; v_bills int;
  v_nobill   numeric; v_pret numeric; v_written numeric;
  v_gross    numeric; v_disc numeric; v_inv numeric; v_count int; v_ret numeric;
  v_exp      numeric;
  v_cash_o   numeric; v_cash_in numeric; v_cash_out numeric;
  v_recv     numeric; v_pay numeric; v_adv_c numeric; v_adv_s numeric;
  v_cogs     numeric; v_net_sales numeric;
  v_cash_hand numeric; v_bank numeric; v_bank_owed numeric; v_adv_held numeric; v_cheques numeric;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;

  select coalesce(sum(opening_value), 0), coalesce(sum(closing_value), 0) into v_open, v_close
  from public.year_stock(p_org, p_from, p_to);

  select coalesce(sum(total), 0), count(*) into v_purch, v_bills
  from public.purchases where org_id = p_org and purchase_date between p_from and p_to;

  -- stock that came in without a purchase bill (opening stock entries, manual stock in)
  -- and stock that went back to suppliers / was written off, at cost
  select coalesce(sum(m.qty * coalesce(m.unit_price, bs.avg_cost, p.purchase_price, 0))
                  filter (where m.type = 'purchase' and m.purchase_id is null), 0),
         coalesce(sum(-m.qty * coalesce(bs.avg_cost, p.purchase_price, 0)) filter (where m.type = 'return_out'), 0),
         coalesce(sum(-m.qty * coalesce(bs.avg_cost, p.purchase_price, 0)) filter (where m.type in ('damaged', 'expired')), 0)
    into v_nobill, v_pret, v_written
  from public.stock_movements m
  join public.batches b on b.id = m.batch_id
  join public.products p on p.id = b.product_id
  join public.batch_stock bs on bs.id = b.id
  where m.org_id = p_org and m.movement_date between p_from and p_to;

  select coalesce(sum(subtotal), 0), coalesce(sum(discount), 0), coalesce(sum(total), 0), count(*)
    into v_gross, v_disc, v_inv, v_count
  from public.sales where org_id = p_org and sale_date between p_from and p_to;
  select coalesce(sum(total), 0) into v_ret
  from public.sale_returns where org_id = p_org and return_date between p_from and p_to;

  select coalesce(-sum(amount), 0) into v_exp
  from public.cash_entries where org_id = p_org and kind = 'expense' and entry_date between p_from and p_to;

  -- all money (cash + bank accounts); moving money between them is not money in or out
  select coalesce(sum(amount) filter (where entry_date < p_from), 0)
           + coalesce((select sum(opening_balance) from public.money_accounts where org_id = p_org and created_at::date < p_from), 0),
         coalesce(sum(amount) filter (where entry_date between p_from and p_to and amount > 0 and transfer_id is null), 0)
           + coalesce((select sum(opening_balance) from public.money_accounts where org_id = p_org and created_at::date between p_from and p_to and opening_balance > 0), 0),
         coalesce(-sum(amount) filter (where entry_date between p_from and p_to and amount < 0 and transfer_id is null), 0)
    into v_cash_o, v_cash_in, v_cash_out
  from public.cash_entries where org_id = p_org;
  select coalesce(sum(amount), 0) into v_cash_hand from public.cash_entries where org_id = p_org and account_id is null and entry_date <= p_to;
  select coalesce(sum(a.opening_balance + coalesce((select sum(c.amount) from public.cash_entries c where c.account_id = a.id and c.entry_date <= p_to), 0)), 0)
    into v_bank from public.money_accounts a where a.org_id = p_org and a.created_at::date <= p_to;
  select coalesce(sum(case when kind = 'drawdown' then amount when kind = 'repayment' then -amount else 0 end), 0)
    into v_bank_owed from public.facility_entries where org_id = p_org and entry_date <= p_to;
  select coalesce(sum(case when kind = 'deposit' then amount else -amount end), 0)
    into v_adv_held from public.advance_entries where org_id = p_org and entry_date <= p_to;
  select coalesce(sum(amount), 0) into v_cheques from public.cheques
   where org_id = p_org and direction = 'received' and received_on <= p_to
     and (status = 'pending' or (status = 'cleared' and cleared_on > p_to));

  -- khata balances on the last day
  with bal as (
    select p.kind,
           (case when p.created_at::date <= p_to then p.opening_balance else 0 end
            + coalesce((select sum(s.total - s.paid - s.advance_used) from public.sales s where s.party_id = p.id and s.sale_date <= p_to), 0)
            + coalesce((select sum(u.total - u.paid) from public.purchases u where u.party_id = p.id and u.purchase_date <= p_to), 0)
            - coalesce((select sum(abs(c.amount)) from public.cash_entries c
                        where c.party_id = p.id and c.kind in ('receipt', 'payment') and c.entry_date <= p_to), 0)
            - coalesce((select sum(x.total - x.refund) from public.sale_returns x where x.party_id = p.id and x.return_date <= p_to), 0)
            - coalesce((select sum(f.amount) from public.facility_entries f where f.party_id = p.id and f.kind = 'drawdown' and f.entry_date <= p_to), 0)
            - coalesce((select sum(a.amount) from public.advance_entries a join public.crop_advances ca on ca.id = a.advance_id
                        where ca.party_id = p.id and a.kind = 'to_khata' and a.entry_date <= p_to), 0)) as balance
    from public.parties p where p.org_id = p_org
  )
  select coalesce(sum(balance) filter (where kind = 'customer' and balance > 0), 0),
         coalesce(sum(balance) filter (where kind = 'supplier' and balance > 0), 0),
         coalesce(-sum(balance) filter (where kind = 'customer' and balance < 0), 0),
         coalesce(-sum(balance) filter (where kind = 'supplier' and balance < 0), 0)
    into v_recv, v_pay, v_adv_c, v_adv_s
  from bal;

  v_net_sales := v_inv - v_ret;
  v_cogs := v_open + v_purch + v_nobill - v_pret - v_close;

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'opening_stock', v_open, 'purchases', v_purch, 'purchase_bills', v_bills,
    'stock_without_bill', round(v_nobill, 2), 'purchase_returns', round(v_pret, 2),
    'closing_stock', v_close, 'cost_of_goods_sold', round(v_cogs, 2), 'written_off', round(v_written, 2),
    'gross_sales', v_gross, 'discounts', v_disc, 'invoices', v_count, 'sale_returns', v_ret,
    'net_sales', v_net_sales, 'gross_profit', round(v_net_sales - v_cogs, 2),
    'expenses', v_exp, 'net_profit', round(v_net_sales - v_cogs - v_exp, 2),
    'cash_opening', v_cash_o, 'cash_in', v_cash_in, 'cash_out', v_cash_out,
    'cash_closing', v_cash_o + v_cash_in - v_cash_out,
    'receivable', v_recv, 'payable', v_pay, 'customer_advances', v_adv_c, 'supplier_advances', v_adv_s,
    'cash_in_hand', v_cash_hand, 'bank_balance', v_bank, 'bank_owed', v_bank_owed,
    'crop_advances_held', v_adv_held, 'cheques_in_hand', v_cheques,
    'locked_until', (select locked_until from public.organizations where id = p_org));
end $$;
grant execute on function public.year_report(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Year lock and audit trail cover the new records too
-- ---------------------------------------------------------------------
do $$
declare t text[]; u text;
begin
  foreach t slice 1 in array array[['facility_entries', 'entry_date'], ['advance_entries', 'entry_date'], ['cheques', 'received_on']]
  loop
    execute format('drop trigger if exists %I on public.%I', t[1] || '_period_lock', t[1]);
    execute format('create trigger %I before insert or update or delete on public.%I
                    for each row execute function public.check_period_lock(%L)', t[1] || '_period_lock', t[1], t[2]);
  end loop;
  foreach u in array array['money_accounts', 'bank_facilities', 'crop_advances', 'cheques', 'facility_entries', 'advance_entries']
  loop
    execute format('drop trigger if exists %I on public.%I', u || '_audit', u);
    execute format('create trigger %I after update or delete on public.%I
                    for each row execute function public.audit_row()', u || '_audit', u);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Keep linked records consistent when a money entry is deleted
-- ---------------------------------------------------------------------
create or replace function public.cash_entry_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- a cleared cheque whose money entry is removed is pending again
  if old.cheque_id is not null then
    update public.cheques set status = 'pending', cleared_on = null where id = old.cheque_id and status = 'cleared';
  end if;
  -- a transfer is removed as a whole (both sides)
  if old.transfer_id is not null then
    delete from public.cash_entries where transfer_id = old.transfer_id and id <> old.id;
  end if;
  return null;
end $$;
drop trigger if exists cash_entries_deleted on public.cash_entries;
create trigger cash_entries_deleted after delete on public.cash_entries
  for each row execute function public.cash_entry_deleted();
