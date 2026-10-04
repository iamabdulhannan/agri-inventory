-- =====================================================================
-- Agri Inventory: agricultural medicines, fertilizers & seeds
-- Multi-organization stock + expiry tracking for Supabase (Postgres 15+)
--
-- Run this whole file once in Supabase Dashboard -> SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.member_role   as enum ('owner', 'admin', 'staff');
create type public.pack_unit     as enum ('ml', 'l', 'g', 'kg', 'pcs');
create type public.pack_type     as enum ('bottle', 'can', 'gallon', 'drum', 'bag', 'packet', 'box', 'piece');
create type public.movement_type as enum (
  'purchase',    -- stock received from supplier          (+)
  'return_in',   -- customer returned goods               (+)
  'sale',        -- sold / issued to farmer               (-)
  'return_out',  -- returned to supplier / company        (-)
  'damaged',     -- leaked, broken, spoiled               (-)
  'expired',     -- removed because expired               (-)
  'adjustment'   -- physical count correction             (+/-)
);

-- ---------------------------------------------------------------------
-- Organizations & membership
-- ---------------------------------------------------------------------
create table public.organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) between 2 and 120),
  address           text,
  phone             text,
  expiry_alert_days int  not null default 60 check (expiry_alert_days between 1 and 365),
  timezone          text not null default 'Asia/Karachi',
  created_at        timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  code       text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  role       public.member_role not null default 'staff' check (role <> 'owner'),
  email      text,                         -- optional: only this email may use it
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by    uuid references auth.users (id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index invites_org_idx on public.invites (org_id);

-- Membership helpers (security definer so policies don't recurse)
create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                 where org_id = p_org and user_id = auth.uid() and role in ('owner', 'admin'));
$$;

-- Today's date in the organization's own timezone
create or replace function public.org_today(p_org uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.organizations where id = p_org), 'Asia/Karachi'))::date;
$$;

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  name_ur    text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  name_ur     text,
  category_id uuid not null,
  company_id  uuid,
  pack_size   numeric(12, 3) not null check (pack_size > 0),
  pack_unit   public.pack_unit not null,
  pack_type   public.pack_type not null default 'bottle',
  min_stock   numeric(12, 3) not null default 0 check (min_stock >= 0),
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, category_id) references public.categories (org_id, id) on delete restrict,
  foreign key (org_id, company_id)  references public.companies  (org_id, id) on delete restrict
);
-- Same product + same company + same pack size can exist only once
create unique index products_unique_variant on public.products
  (org_id, lower(trim(name)), coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), pack_size, pack_unit);
create index products_org_idx on public.products (org_id);

create table public.batches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  product_id  uuid not null,
  batch_no    text not null check (length(trim(batch_no)) > 0),
  mfg_date    date,
  expiry_date date not null,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (product_id, batch_no),
  check (mfg_date is null or mfg_date <= expiry_date),
  foreign key (org_id, product_id) references public.products (org_id, id) on delete restrict
);
create index batches_org_expiry_idx on public.batches (org_id, expiry_date);
create index batches_product_idx on public.batches (product_id);

create table public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  batch_id      uuid not null,
  movement_date date not null,
  type          public.movement_type not null,
  qty           numeric(12, 3) not null check (qty <> 0),   -- packs; + in, - out
  party         text,   -- supplier / customer / farmer name
  reference     text,   -- invoice or bill no.
  note          text,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  foreign key (org_id, batch_id) references public.batches (org_id, id) on delete restrict,
  check (
    (type in ('purchase', 'return_in') and qty > 0) or
    (type in ('sale', 'return_out', 'damaged', 'expired') and qty < 0) or
    (type = 'adjustment')
  )
);
create index movements_org_date_idx on public.stock_movements (org_id, movement_date);
create index movements_batch_idx on public.stock_movements (batch_id, movement_date);

-- ---------------------------------------------------------------------
-- Stock can never go below zero on any day (protects against backdated
-- sales before the purchase, double entry, concurrent sales, etc.)
-- ---------------------------------------------------------------------
create or replace function public.check_batch_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  v_min   numeric;
begin
  for v_batch in
    select distinct b from unnest(array[
      case when tg_op <> 'INSERT' then old.batch_id end,
      case when tg_op <> 'DELETE' then new.batch_id end
    ]) as b where b is not null
  loop
    select min(running) into v_min from (
      select sum(day_qty) over (order by movement_date) as running
      from (select movement_date, sum(qty) as day_qty
            from public.stock_movements where batch_id = v_batch
            group by movement_date) d
    ) r;
    if v_min < 0 then
      raise exception 'INSUFFICIENT_STOCK' using
        detail = format('Batch %s would go negative (%s)', v_batch, v_min),
        hint   = 'Stock cannot go below zero on any date.';
    end if;
  end loop;
  return null;
end $$;

create constraint trigger stock_movements_balance
  after insert or update or delete on public.stock_movements
  deferrable initially immediate
  for each row execute function public.check_batch_balance();

-- ---------------------------------------------------------------------
-- Views (security_invoker => RLS of the caller applies)
-- ---------------------------------------------------------------------
create view public.batch_stock with (security_invoker = true) as
select b.id, b.org_id, b.product_id, b.batch_no, b.mfg_date, b.expiry_date, b.created_at,
       coalesce(sum(m.qty), 0)::numeric(12, 3) as qty
from public.batches b
left join public.stock_movements m on m.batch_id = b.id
group by b.id;

create view public.product_stock with (security_invoker = true) as
select p.id, p.org_id, p.name, p.name_ur, p.category_id, p.company_id,
       p.pack_size, p.pack_unit, p.pack_type, p.min_stock, p.is_active, p.notes, p.created_at,
       c.name    as category_name,
       c.name_ur as category_name_ur,
       co.name   as company_name,
       coalesce(sum(bs.qty), 0)::numeric(12, 3)          as qty,
       min(bs.expiry_date) filter (where bs.qty > 0)     as next_expiry,
       count(bs.id) filter (where bs.qty > 0)::int       as active_batches
from public.products p
join public.categories c on c.id = p.category_id
left join public.companies co on co.id = p.company_id
left join public.batch_stock bs on bs.product_id = p.id
group by p.id, c.id, co.id;

-- Batches that still have stock and are expired or inside the alert window
create view public.expiry_alerts with (security_invoker = true) as
select bs.id as batch_id, bs.org_id, bs.product_id, bs.batch_no, bs.mfg_date, bs.expiry_date, bs.qty,
       p.name, p.name_ur, p.pack_size, p.pack_unit, p.pack_type,
       co.name as company_name,
       (bs.expiry_date - public.org_today(bs.org_id))::int as days_left
from public.batch_stock bs
join public.products p on p.id = bs.product_id
join public.organizations o on o.id = bs.org_id
left join public.companies co on co.id = p.company_id
where bs.qty > 0
  and bs.expiry_date <= public.org_today(bs.org_id) + o.expiry_alert_days;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------

-- Opening / in / out / closing for every product over a date range.
-- Daily report  => p_from = p_to = that day
-- Monthly report => first and last day of the month
create or replace function public.stock_summary(p_org uuid, p_from date, p_to date)
returns table (
  product_id   uuid,
  opening      numeric,
  purchased    numeric,
  returned_in  numeric,
  sold         numeric,
  returned_out numeric,
  damaged      numeric,
  expired      numeric,
  adjusted     numeric,
  closing      numeric
)
language sql stable security invoker set search_path = public as $$
  select p.id,
    coalesce(sum(m.qty)  filter (where m.movement_date <  p_from), 0),
    coalesce(sum(m.qty)  filter (where m.movement_date >= p_from and m.type = 'purchase'), 0),
    coalesce(sum(m.qty)  filter (where m.movement_date >= p_from and m.type = 'return_in'), 0),
    coalesce(-sum(m.qty) filter (where m.movement_date >= p_from and m.type = 'sale'), 0),
    coalesce(-sum(m.qty) filter (where m.movement_date >= p_from and m.type = 'return_out'), 0),
    coalesce(-sum(m.qty) filter (where m.movement_date >= p_from and m.type = 'damaged'), 0),
    coalesce(-sum(m.qty) filter (where m.movement_date >= p_from and m.type = 'expired'), 0),
    coalesce(sum(m.qty)  filter (where m.movement_date >= p_from and m.type = 'adjustment'), 0),
    coalesce(sum(m.qty), 0)
  from public.products p
  left join public.batches b on b.product_id = p.id
  left join public.stock_movements m on m.batch_id = b.id and m.movement_date <= p_to
  where p.org_id = p_org
  group by p.id;
$$;

-- Day-by-day register: one row per product per day with opening, in, out, closing.
-- p_only_moves = true returns only the days on which the product actually moved.
create or replace function public.daily_register(
  p_org uuid, p_from date, p_to date, p_product uuid default null, p_only_moves boolean default false)
returns table (day date, product_id uuid, opening numeric, qty_in numeric, qty_out numeric, closing numeric)
language sql stable security invoker set search_path = public as $$
  with prods as (
    select id from public.products
    where org_id = p_org and (p_product is null or id = p_product)
  ),
  base as (
    select b.product_id, sum(m.qty) as qty
    from public.stock_movements m join public.batches b on b.id = m.batch_id
    where m.org_id = p_org and m.movement_date < p_from
      and (p_product is null or b.product_id = p_product)
    group by b.product_id
  ),
  mv as (
    select b.product_id, m.movement_date as d,
           coalesce(sum(m.qty) filter (where m.qty > 0), 0)  as qin,
           coalesce(-sum(m.qty) filter (where m.qty < 0), 0) as qout,
           sum(m.qty) as net
    from public.stock_movements m join public.batches b on b.id = m.batch_id
    where m.org_id = p_org and m.movement_date between p_from and p_to
      and (p_product is null or b.product_id = p_product)
    group by b.product_id, m.movement_date
  ),
  grid as (
    select d::date as d, p.id as pid
    from generate_series(p_from, p_to, interval '1 day') d cross join prods p
  ),
  reg as (
    select g.d, g.pid,
      coalesce(bs.qty, 0) + coalesce(sum(coalesce(mv.net, 0)) over w_prev, 0) as opening,
      coalesce(mv.qin, 0)  as qin,
      coalesce(mv.qout, 0) as qout,
      coalesce(bs.qty, 0) + sum(coalesce(mv.net, 0)) over w_all as closing,
      (mv.product_id is not null) as moved
    from grid g
    left join mv on mv.product_id = g.pid and mv.d = g.d
    left join base bs on bs.product_id = g.pid
    window w_all  as (partition by g.pid order by g.d rows between unbounded preceding and current row),
           w_prev as (partition by g.pid order by g.d rows between unbounded preceding and 1 preceding)
  )
  select d, pid, opening, qin, qout, closing
  from reg
  where not p_only_moves or moved
  order by d, pid;
$$;

-- ---------------------------------------------------------------------
-- Transactional stock entry
-- ---------------------------------------------------------------------

-- Stock IN (purchase or customer return). p_lines:
-- [{ "product_id": uuid, "batch_no": text|null, "expiry_date": "YYYY-MM-DD",
--    "mfg_date": "YYYY-MM-DD"|null, "qty": number }]
create or replace function public.record_stock_in(
  p_org uuid, p_date date, p_type public.movement_type, p_lines jsonb,
  p_party text default null, p_reference text default null, p_note text default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  l        jsonb;
  v_batch  public.batches;
  v_no     text;
  v_exp    date;
  v_mfg    date;
  v_qty    numeric;
  v_count  int := 0;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_type not in ('purchase', 'return_in') then raise exception 'INVALID_TYPE'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric;
    v_exp := (l->>'expiry_date')::date;
    v_mfg := nullif(l->>'mfg_date', '')::date;
    v_no  := nullif(trim(l->>'batch_no'), '');
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    if v_exp is null then raise exception 'EXPIRY_REQUIRED'; end if;
    -- No batch printed? Use expiry month as the batch key.
    v_no := coalesce(v_no, 'EXP-' || to_char(v_exp, 'YYYY-MM-DD'));

    select * into v_batch from public.batches
     where org_id = p_org and product_id = (l->>'product_id')::uuid and batch_no = v_no;

    if not found then
      insert into public.batches (org_id, product_id, batch_no, mfg_date, expiry_date)
      values (p_org, (l->>'product_id')::uuid, v_no, v_mfg, v_exp)
      returning * into v_batch;
    elsif v_batch.expiry_date <> v_exp then
      raise exception 'BATCH_EXPIRY_MISMATCH' using
        detail = format('Batch %s already exists with expiry %s', v_no, v_batch.expiry_date);
    end if;

    insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, party, reference, note)
    values (p_org, v_batch.id, p_date, p_type, v_qty, nullif(trim(p_party), ''), nullif(trim(p_reference), ''), nullif(trim(p_note), ''));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Stock OUT (sale, return to supplier, damaged, expired). p_lines:
-- [{ "product_id": uuid, "qty": number, "batch_id": uuid|null }]
-- Without batch_id the quantity is taken First-Expiry-First-Out across batches.
-- Sales never take from already-expired batches.
create or replace function public.record_stock_out(
  p_org uuid, p_date date, p_type public.movement_type, p_lines jsonb,
  p_party text default null, p_reference text default null, p_note text default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  l        jsonb;
  b        record;
  v_need   numeric;
  v_take   numeric;
  v_today  date := public.org_today(p_org);
  v_count  int := 0;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_type not in ('sale', 'return_out', 'damaged', 'expired') then raise exception 'INVALID_TYPE'; end if;
  if p_date is null or p_date > v_today then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_need := (l->>'qty')::numeric;
    if v_need is null or v_need <= 0 then raise exception 'INVALID_QTY'; end if;

    -- lock this product's batches so two counters can't sell the same stock
    perform 1 from public.batches where org_id = p_org and product_id = (l->>'product_id')::uuid for update;

    for b in
      select bs.id, bs.qty, bs.expiry_date
      from public.batch_stock bs
      where bs.org_id = p_org
        and bs.product_id = (l->>'product_id')::uuid
        and bs.qty > 0
        and (nullif(l->>'batch_id', '') is null or bs.id = (l->>'batch_id')::uuid)
        and (p_type <> 'sale' or bs.expiry_date >= p_date)
      order by bs.expiry_date, bs.created_at
    loop
      exit when v_need <= 0;
      v_take := least(v_need, b.qty);
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, party, reference, note)
      values (p_org, b.id, p_date, p_type, -v_take, nullif(trim(p_party), ''), nullif(trim(p_reference), ''), nullif(trim(p_note), ''));
      v_need := v_need - v_take;
      v_count := v_count + 1;
    end loop;

    if v_need > 0 then
      raise exception 'INSUFFICIENT_STOCK' using detail = format('Short by %s for product %s', v_need, l->>'product_id');
    end if;
  end loop;
  return v_count;
end $$;

-- Physical count: set a batch to the counted quantity
create or replace function public.adjust_batch(p_org uuid, p_batch uuid, p_counted numeric, p_note text default null)
returns numeric language plpgsql security invoker set search_path = public as $$
declare v_cur numeric; v_diff numeric;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'INVALID_QTY'; end if;
  select qty into v_cur from public.batch_stock where id = p_batch and org_id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_diff := p_counted - v_cur;
  if v_diff <> 0 then
    insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, note)
    values (p_org, p_batch, public.org_today(p_org), 'adjustment', v_diff, coalesce(nullif(trim(p_note), ''), 'Physical count'));
  end if;
  return v_diff;
end $$;

-- ---------------------------------------------------------------------
-- Organizations: sign-up, invites
-- ---------------------------------------------------------------------
create or replace function public.seed_categories(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (org_id, name, name_ur) values
    (p_org, 'Insecticide',      'کیڑے مار دوا'),
    (p_org, 'Fungicide',        'پھپھوند کش دوا'),
    (p_org, 'Herbicide',        'جڑی بوٹی مار دوا'),
    (p_org, 'Fertilizer',       'کھاد'),
    (p_org, 'Micronutrient',    'مائیکرو نیوٹرینٹ'),
    (p_org, 'Growth Regulator', 'نشوونما بڑھانے والی دوا'),
    (p_org, 'Seeds',            'بیج'),
    (p_org, 'Other',            'دیگر')
  on conflict do nothing;
$$;

-- Runs when a new auth user is created. user metadata carries either
-- { org_name } to create a new organization, or { invite_code } to join one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid;
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_name text := trim(coalesce(new.raw_user_meta_data->>'org_name', ''));
  v_inv  public.invites;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, trim(coalesce(new.raw_user_meta_data->>'full_name', '')), new.email)
  on conflict (id) do nothing;

  if v_code <> '' then
    select * into v_inv from public.invites
     where code = v_code and used_at is null and expires_at > now()
     for update;
    if not found then raise exception 'INVALID_INVITE'; end if;
    if v_inv.email is not null and lower(v_inv.email) <> lower(new.email) then
      raise exception 'INVITE_EMAIL_MISMATCH';
    end if;
    insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, new.id, v_inv.role);
    update public.invites set used_by = new.id, used_at = now() where id = v_inv.id;
  elsif v_name <> '' then
    insert into public.organizations (name) values (v_name) returning id into v_org;
    insert into public.memberships (org_id, user_id, role) values (v_org, new.id, 'owner');
    perform public.seed_categories(v_org);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Public: validate an invite code before sign-up (returns org name only)
create or replace function public.check_invite(p_code text)
returns table (org_name text, role public.member_role, email text)
language sql stable security definer set search_path = public as $$
  select o.name, i.role, i.email
  from public.invites i join public.organizations o on o.id = i.org_id
  where i.code = upper(trim(p_code)) and i.used_at is null and i.expires_at > now();
$$;

-- Hard guarantee at the table level
create unique index if not exists memberships_one_org_per_user on public.memberships (user_id);

-- Logged-in user without an organization joins one with a code
create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.invites; v_email text;
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'ALREADY_IN_ORG';
  end if;
  select * into v_inv from public.invites
   where code = upper(trim(p_code)) and used_at is null and expires_at > now() for update;
  if not found then raise exception 'INVALID_INVITE'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if v_inv.email is not null and lower(v_inv.email) <> lower(v_email) then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role);
  update public.invites set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

-- Logged-in user without an organization creates one
create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'ALREADY_IN_ORG';
  end if;
  insert into public.organizations (name) values (trim(p_name)) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  perform public.seed_categories(v_org);
  return v_org;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.memberships     enable row level security;
alter table public.invites         enable row level security;
alter table public.categories      enable row level security;
alter table public.companies       enable row level security;
alter table public.products        enable row level security;
alter table public.batches         enable row level security;
alter table public.stock_movements enable row level security;

-- organizations
create policy org_select on public.organizations for select to authenticated using (public.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

-- profiles: yourself, and people in your organizations
create policy profile_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profile_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships: members see the team; admins manage non-owner members
create policy member_select on public.memberships for select to authenticated using (public.is_member(org_id));
create policy member_update on public.memberships for update to authenticated
  using (public.is_admin(org_id) and role <> 'owner' and user_id <> auth.uid())
  with check (public.is_admin(org_id) and role <> 'owner');
create policy member_delete on public.memberships for delete to authenticated
  using (public.is_admin(org_id) and role <> 'owner' and user_id <> auth.uid());

-- invites: admins only
create policy invite_select on public.invites for select to authenticated using (public.is_admin(org_id));
create policy invite_insert on public.invites for insert to authenticated with check (public.is_admin(org_id));
create policy invite_delete on public.invites for delete to authenticated using (public.is_admin(org_id));

-- catalog: every member can read/add/edit, admins delete
do $$
declare t text;
begin
  foreach t in array array['categories', 'companies', 'products', 'batches'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(org_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_member(org_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_admin(org_id))', t);
  end loop;
end $$;

-- movements: members read and add; only admins edit or delete
create policy movements_select on public.stock_movements for select to authenticated using (public.is_member(org_id));
create policy movements_insert on public.stock_movements for insert to authenticated
  with check (public.is_member(org_id) and created_by = auth.uid());
create policy movements_update on public.stock_movements for update to authenticated
  using (public.is_admin(org_id)) with check (public.is_admin(org_id));
create policy movements_delete on public.stock_movements for delete to authenticated using (public.is_admin(org_id));

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on function public.handle_new_user()           from public, anon, authenticated;
revoke execute on function public.check_batch_balance()       from public, anon, authenticated;
revoke execute on function public.seed_categories(uuid)       from public, anon, authenticated;
revoke execute on function public.accept_invite(text)         from public, anon;
revoke execute on function public.create_organization(text)   from public, anon;
grant  execute on function public.check_invite(text)          to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text) to authenticated;
grant execute on function public.record_stock_out(uuid, date, public.movement_type, jsonb, text, text, text) to authenticated;
grant execute on function public.adjust_batch(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.stock_summary(uuid, date, date) to authenticated;
grant execute on function public.daily_register(uuid, date, date, uuid, boolean) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.create_organization(text) to authenticated;
