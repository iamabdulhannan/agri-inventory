-- =====================================================================
-- Prices, sales invoices, purchases, khata (customer & supplier ledgers),
-- roznamcha (daily cash book) and profit.
-- Run once in Supabase -> SQL Editor (after 001-004). Safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------
alter table public.products add column if not exists purchase_price numeric(12, 2) not null default 0;
alter table public.products add column if not exists sale_price     numeric(12, 2) not null default 0;  -- MRP
do $$ begin
  alter table public.products add constraint products_prices_check check (purchase_price >= 0 and sale_price >= 0);
exception when duplicate_object then null; end $$;

alter table public.organizations add column if not exists invoice_seq  int not null default 0;
alter table public.organizations add column if not exists purchase_seq int not null default 0;

-- ---------------------------------------------------------------------
-- Parties (khata): customers and suppliers
-- ---------------------------------------------------------------------
do $$ begin
  create type public.party_kind as enum ('customer', 'supplier');
exception when duplicate_object then null; end $$;

create table if not exists public.parties (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  kind            public.party_kind not null,
  name            text not null check (length(trim(name)) > 0),
  phone           text,
  address         text,
  opening_balance numeric(12, 2) not null default 0,   -- customer: they owe us / supplier: we owe them
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (org_id, id)
);
create unique index if not exists parties_unique on public.parties (org_id, kind, lower(trim(name)), coalesce(phone, ''));

-- ---------------------------------------------------------------------
-- Sales invoices and purchases
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  invoice_no      int not null,
  sale_date       date not null,
  party_id        uuid,
  customer_name   text,                                 -- walk-in customer name (optional)
  subtotal        numeric(12, 2) not null default 0,
  discount        numeric(12, 2) not null default 0,
  total           numeric(12, 2) not null default 0,
  paid            numeric(12, 2) not null default 0,
  note            text,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, invoice_no),
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict,
  check (discount >= 0 and total >= 0 and paid >= 0 and paid <= total and total = subtotal - discount)
);
create index if not exists sales_org_date_idx on public.sales (org_id, sale_date);
create index if not exists sales_party_idx on public.sales (party_id);

create table if not exists public.purchases (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  purchase_no     int not null,
  purchase_date   date not null,
  party_id        uuid,
  supplier_name   text,
  reference       text,                                 -- supplier's bill no.
  total           numeric(12, 2) not null default 0,
  paid            numeric(12, 2) not null default 0,
  note            text,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, purchase_no),
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict,
  check (total >= 0 and paid >= 0 and paid <= total)
);
create index if not exists purchases_org_date_idx on public.purchases (org_id, purchase_date);
create index if not exists purchases_party_idx on public.purchases (party_id);

-- stock movements: link to the invoice and keep prices
alter table public.stock_movements add column if not exists sale_id     uuid references public.sales (id) on delete cascade;
alter table public.stock_movements add column if not exists purchase_id uuid references public.purchases (id) on delete cascade;
alter table public.stock_movements add column if not exists unit_price  numeric(12, 2);  -- sale rate / purchase rate per pack
alter table public.stock_movements add column if not exists unit_cost   numeric(12, 2);  -- cost per pack at time of sale
create index if not exists movements_sale_idx on public.stock_movements (sale_id);
create index if not exists movements_purchase_idx on public.stock_movements (purchase_id);

-- ---------------------------------------------------------------------
-- Roznamcha (cash book). amount: + cash in, - cash out
-- ---------------------------------------------------------------------
do $$ begin
  create type public.cash_kind as enum ('sale', 'purchase', 'receipt', 'payment', 'expense', 'cash_in', 'cash_out');
exception when duplicate_object then null; end $$;

create table if not exists public.cash_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  entry_date      date not null,
  kind            public.cash_kind not null,
  amount          numeric(12, 2) not null check (amount <> 0),
  party_id        uuid,
  sale_id         uuid references public.sales (id) on delete cascade,
  purchase_id     uuid references public.purchases (id) on delete cascade,
  note            text,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now(),
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict,
  check ((kind in ('sale', 'receipt', 'cash_in') and amount > 0) or
         (kind in ('purchase', 'payment', 'expense', 'cash_out') and amount < 0))
);
create index if not exists cash_org_date_idx on public.cash_entries (org_id, entry_date);
create index if not exists cash_party_idx on public.cash_entries (party_id);

-- keep the creator's name on documents (survives member removal)
do $$
declare t text;
begin
  foreach t in array array['sales', 'purchases', 'cash_entries'] loop
    execute format('drop trigger if exists %1$s_created_by_name on public.%1$s', t);
    execute format('create trigger %1$s_created_by_name before insert on public.%1$s
                    for each row execute function public.set_created_by_name()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.parties      enable row level security;
alter table public.sales        enable row level security;
alter table public.purchases    enable row level security;
alter table public.cash_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['parties', 'sales', 'purchases', 'cash_entries'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(org_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_member(org_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_admin(org_id))', t);
  end loop;
end $$;
-- customers/suppliers can be edited by any member; money documents are not edited (void and re-enter)
drop policy if exists parties_update on public.parties;
create policy parties_update on public.parties for update to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));

-- a single line of an invoice cannot be deleted on its own (void the whole invoice instead)
drop policy if exists movements_delete on public.stock_movements;
create policy movements_delete on public.stock_movements for delete to authenticated
  using (public.is_admin(org_id) and sale_id is null and purchase_id is null);

grant select, insert, update, delete on public.parties, public.sales, public.purchases, public.cash_entries to authenticated;

-- ---------------------------------------------------------------------
-- Views: batch cost, stock value, party balances
-- (columns are only appended so existing app queries keep working)
-- ---------------------------------------------------------------------
create or replace view public.batch_stock with (security_invoker = true) as
select b.id, b.org_id, b.product_id, b.batch_no, b.mfg_date, b.expiry_date, b.created_at,
       coalesce(sum(m.qty), 0)::numeric(12, 3) as qty,
       -- average purchase rate of this batch
       round(sum(m.qty * m.unit_price) filter (where m.type = 'purchase' and m.unit_price is not null)
             / nullif(sum(m.qty) filter (where m.type = 'purchase' and m.unit_price is not null), 0), 2) as avg_cost
from public.batches b
left join public.stock_movements m on m.batch_id = b.id
group by b.id;

create or replace view public.product_stock with (security_invoker = true) as
select p.id, p.org_id, p.name, p.name_ur, p.category_id, p.company_id,
       p.pack_size, p.pack_unit, p.pack_type, p.min_stock, p.is_active, p.notes, p.created_at,
       c.name    as category_name,
       c.name_ur as category_name_ur,
       co.name   as company_name,
       coalesce(sum(bs.qty), 0)::numeric(12, 3)          as qty,
       min(bs.expiry_date) filter (where bs.qty > 0)     as next_expiry,
       count(bs.id) filter (where bs.qty > 0)::int       as active_batches,
       p.purchase_price,
       p.sale_price,
       coalesce(sum(greatest(bs.qty, 0) * coalesce(bs.avg_cost, p.purchase_price)), 0)::numeric(14, 2) as stock_value
from public.products p
join public.categories c on c.id = p.category_id
left join public.companies co on co.id = p.company_id
left join public.batch_stock bs on bs.product_id = p.id
group by p.id, c.id, co.id;

-- balance: customer = they owe us, supplier = we owe them
create or replace view public.party_balances with (security_invoker = true) as
select p.*,
       (p.opening_balance
        + coalesce((select sum(s.total - s.paid) from public.sales s where s.party_id = p.id), 0)
        + coalesce((select sum(u.total - u.paid) from public.purchases u where u.party_id = p.id), 0)
        - coalesce((select sum(abs(c.amount)) from public.cash_entries c
                    where c.party_id = p.id and c.kind in ('receipt', 'payment')), 0))::numeric(14, 2) as balance,
       greatest(
         (select max(s.sale_date) from public.sales s where s.party_id = p.id),
         (select max(u.purchase_date) from public.purchases u where u.party_id = p.id),
         (select max(c.entry_date) from public.cash_entries c where c.party_id = p.id)) as last_activity
from public.parties p;

grant select on public.party_balances, public.batch_stock, public.product_stock to authenticated;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.next_doc_no(p_org uuid, p_kind text)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_kind = 'invoice' then
    update public.organizations set invoice_seq = invoice_seq + 1 where id = p_org returning invoice_seq into v;
  else
    update public.organizations set purchase_seq = purchase_seq + 1 where id = p_org returning purchase_seq into v;
  end if;
  return v;
end $$;
revoke execute on function public.next_doc_no(uuid, text) from public, anon;
grant execute on function public.next_doc_no(uuid, text) to authenticated;

-- record_stock_in / record_sale run as security definer: invoices cannot be
-- edited through the API, so only these functions may fill in the totals.
-- They check membership themselves and scope every row to p_org.
-- ---------------------------------------------------------------------
-- Stock In with purchase rates, supplier and payment.  p_lines:
-- [{ product_id, batch_no, expiry_date, mfg_date, qty, unit_price }]
-- ---------------------------------------------------------------------
drop function if exists public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text);
create or replace function public.record_stock_in(
  p_org uuid, p_date date, p_type public.movement_type, p_lines jsonb,
  p_party text default null, p_reference text default null, p_note text default null,
  p_party_id uuid default null, p_paid numeric default null)
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
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;

  if p_party_id is not null then
    select name into v_name from public.parties
     where id = p_party_id and org_id = p_org and kind = (case when p_type = 'purchase' then 'supplier' else 'customer' end)::public.party_kind;
    if not found then raise exception 'INVALID_PARTY'; end if;
  end if;

  if p_type = 'purchase' then
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
    values (p_org, v_batch.id, p_date, p_type, v_qty, v_rate, v_purchase, v_name,
            nullif(trim(p_reference), ''), nullif(trim(p_note), ''));

    if p_type = 'purchase' and v_rate is not null then
      v_total := v_total + round(v_qty * v_rate, 2);
      -- remember the latest purchase rate on the product
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
      insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, purchase_id, note)
      values (p_org, p_date, 'purchase', -v_paid, p_party_id, v_purchase, nullif(trim(p_reference), ''));
    end if;
  end if;
  return v_purchase;
end $$;
grant execute on function public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Sale with rates, discount, payment and FEFO batch allocation.  p_lines:
-- [{ product_id, qty, unit_price, batch_id|null }]
-- Returns the new sale id.
-- ---------------------------------------------------------------------
create or replace function public.record_sale(
  p_org uuid, p_date date, p_lines jsonb,
  p_party_id uuid default null, p_customer_name text default null,
  p_discount numeric default 0, p_paid numeric default null, p_note text default null)
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
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;

  if p_party_id is not null then
    select name into v_name from public.parties where id = p_party_id and org_id = p_org and kind = 'customer';
    if not found then raise exception 'INVALID_PARTY'; end if;
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
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, unit_cost, sale_id, party, reference)
      values (p_org, b.id, p_date, 'sale', -v_take, v_rate, b.cost, v_sale, v_name, 'INV-' || v_no);
      v_need := v_need - v_take;
    end loop;

    if v_need > 0 then
      raise exception 'INSUFFICIENT_STOCK' using detail = format('Short by %s for product %s', v_need, l->>'product_id');
    end if;
  end loop;

  if v_disc < 0 or v_disc > v_sub then raise exception 'INVALID_DISCOUNT'; end if;
  v_total := v_sub - v_disc;
  v_paid := coalesce(p_paid, v_total);
  if v_paid < 0 or v_paid > v_total then raise exception 'INVALID_PAID'; end if;
  if v_paid < v_total and p_party_id is null then raise exception 'CREDIT_NEEDS_PARTY'; end if;

  update public.sales set subtotal = v_sub, discount = v_disc, total = v_total, paid = v_paid where id = v_sale;
  if v_paid > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, sale_id, note)
    values (p_org, p_date, 'sale', v_paid, p_party_id, v_sale, 'INV-' || v_no);
  end if;
  return v_sale;
end $$;
grant execute on function public.record_sale(uuid, date, jsonb, uuid, text, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Khata payment: money received from a customer / paid to a supplier
-- ---------------------------------------------------------------------
create or replace function public.record_party_payment(
  p_org uuid, p_party uuid, p_date date, p_amount numeric, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_kind public.party_kind; v_id uuid;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select kind into v_kind from public.parties where id = p_party and org_id = p_org;
  if not found then raise exception 'INVALID_PARTY'; end if;
  insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, note)
  values (p_org, p_date,
          case when v_kind = 'customer' then 'receipt' else 'payment' end::public.cash_kind,
          case when v_kind = 'customer' then p_amount else -p_amount end,
          p_party, nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.record_party_payment(uuid, uuid, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Khata ledger for one party, with running balance
-- ---------------------------------------------------------------------
create or replace function public.party_ledger(p_party uuid)
returns table (entry_date date, kind text, ref text, note text, bill numeric, paid numeric, balance numeric, doc_id uuid, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with rows as (
    select p.created_at::date as entry_date, 'opening'::text as kind, null::text as ref, null::text as note,
           p.opening_balance as bill, 0::numeric as paid, null::uuid as doc_id, p.created_at, 0 as ord
    from public.parties p where p.id = p_party and p.opening_balance <> 0
    union all
    select s.sale_date, 'sale', 'INV-' || s.invoice_no, s.note, s.total, s.paid, s.id, s.created_at, 1
    from public.sales s where s.party_id = p_party
    union all
    select u.purchase_date, 'purchase', coalesce(u.reference, 'PUR-' || u.purchase_no), u.note, u.total, u.paid, u.id, u.created_at, 1
    from public.purchases u where u.party_id = p_party
    union all
    select c.entry_date, c.kind::text, null, c.note, 0, abs(c.amount), c.id, c.created_at, 2
    from public.cash_entries c where c.party_id = p_party and c.kind in ('receipt', 'payment')
  )
  select entry_date, kind, ref, note, bill, paid,
         -- opening balance always comes first, then entries by date
         sum(bill - paid) over (order by (ord <> 0), entry_date, ord, created_at rows unbounded preceding) as balance,
         doc_id, created_at
  from rows
  order by (ord <> 0), entry_date, ord, created_at;
$$;
grant execute on function public.party_ledger(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Roznamcha: opening / in / out / closing cash per day
-- ---------------------------------------------------------------------
create or replace function public.cash_days(p_org uuid, p_from date, p_to date)
returns table (day date, opening numeric, cash_in numeric, cash_out numeric, closing numeric)
language sql stable security invoker set search_path = public as $$
  with base as (
    select coalesce(sum(amount), 0) as amt from public.cash_entries where org_id = p_org and entry_date < p_from
  ),
  d as (
    select entry_date as day,
           coalesce(sum(amount) filter (where amount > 0), 0)  as cin,
           coalesce(-sum(amount) filter (where amount < 0), 0) as cout
    from public.cash_entries
    where org_id = p_org and entry_date between p_from and p_to
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
grant execute on function public.cash_days(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Sales & profit
-- ---------------------------------------------------------------------
create or replace function public.sales_days(p_org uuid, p_from date, p_to date)
returns table (day date, invoices int, sales numeric, discount numeric, cost numeric, profit numeric, received numeric)
language sql stable security invoker set search_path = public as $$
  select s.sale_date,
         count(*)::int,
         sum(s.total),
         sum(s.discount),
         coalesce(sum((select sum(-m.qty * coalesce(m.unit_cost, 0)) from public.stock_movements m where m.sale_id = s.id)), 0),
         sum(s.total) - coalesce(sum((select sum(-m.qty * coalesce(m.unit_cost, 0)) from public.stock_movements m where m.sale_id = s.id)), 0),
         sum(s.paid)
  from public.sales s
  where s.org_id = p_org and s.sale_date between p_from and p_to
  group by s.sale_date
  order by s.sale_date;
$$;
grant execute on function public.sales_days(uuid, date, date) to authenticated;

create or replace function public.product_sales(p_org uuid, p_from date, p_to date)
returns table (product_id uuid, qty numeric, revenue numeric, cost numeric, profit numeric)
language sql stable security invoker set search_path = public as $$
  select b.product_id,
         sum(-m.qty),
         sum(round(-m.qty * m.unit_price, 2)),
         sum(round(-m.qty * coalesce(m.unit_cost, 0), 2)),
         sum(round(-m.qty * m.unit_price, 2)) - sum(round(-m.qty * coalesce(m.unit_cost, 0), 2))
  from public.stock_movements m
  join public.batches b on b.id = m.batch_id
  where m.org_id = p_org and m.sale_id is not null and m.movement_date between p_from and p_to
  group by b.product_id;
$$;
grant execute on function public.product_sales(uuid, date, date) to authenticated;

-- One row of money figures for the dashboard
create or replace function public.money_summary(p_org uuid, p_today date)
returns table (today_sales numeric, today_profit numeric, today_received numeric, month_sales numeric, month_profit numeric,
               cash_in_hand numeric, receivable numeric, payable numeric, stock_value numeric, today_expenses numeric)
language sql stable security invoker set search_path = public as $$
  with t as (select * from public.sales_days(p_org, p_today, p_today)),
       m as (select * from public.sales_days(p_org, date_trunc('month', p_today)::date, p_today))
  select coalesce((select sum(sales) from t), 0),
         coalesce((select sum(profit) from t), 0),
         coalesce((select sum(amount) from public.cash_entries where org_id = p_org and entry_date = p_today and amount > 0), 0),
         coalesce((select sum(sales) from m), 0),
         coalesce((select sum(profit) from m), 0),
         coalesce((select sum(amount) from public.cash_entries where org_id = p_org), 0),
         coalesce((select sum(balance) from public.party_balances where org_id = p_org and kind = 'customer' and balance > 0), 0),
         coalesce((select sum(balance) from public.party_balances where org_id = p_org and kind = 'supplier' and balance > 0), 0),
         coalesce((select sum(stock_value) from public.product_stock where org_id = p_org), 0),
         coalesce((select -sum(amount) from public.cash_entries where org_id = p_org and entry_date = p_today and kind = 'expense'), 0);
$$;
grant execute on function public.money_summary(uuid, date) to authenticated;
