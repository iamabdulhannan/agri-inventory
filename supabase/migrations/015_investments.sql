-- =====================================================================
-- Investments: people who put capital into the shop.
--   * investor: name, profit share % (losses come out of his capital)
--   * capital in / out through cash or a bank account
--   * his stock: exact quantities and purchase rates (a purchase can be
--     split: e.g. 60 bottles his, 40 the shop's)
--   * his stock sells FIRST; every sale of that product is matched to
--     his lots automatically, so his profit is known day by day
--   * withdraw profit any time; when his stock is sold, settle in one go:
--     reinvest everything / withdraw profit, keep capital / withdraw all
-- Owner/admin only. Run once in Supabase -> SQL Editor (after 014).
-- Safe to run again.
-- =====================================================================

create table if not exists public.investors (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  phone         text,
  profit_share  numeric(5, 2) not null default 50 check (profit_share between 0 and 100),  -- investor's % of profit
  note          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, id)
);

-- money and profit movements of an investor
--   deposit (+capital, cash in) | profit (+/- his booked share) | reinvest (profit -> capital)
--   withdraw_profit (cash out of profit) | withdraw_capital (cash out of capital)
create table if not exists public.investor_entries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  investor_id    uuid not null,
  entry_date     date not null,
  kind           text not null check (kind in ('deposit', 'profit', 'reinvest', 'withdraw_profit', 'withdraw_capital')),
  amount         numeric(14, 2) not null,
  settlement_id  uuid,
  cash_entry_id  uuid references public.cash_entries (id) on delete cascade,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at     timestamptz not null default now(),
  foreign key (org_id, investor_id) references public.investors (org_id, id) on delete restrict
);
create index if not exists investor_entries_idx on public.investor_entries (investor_id);

-- his stock: product, quantity and purchase rate (cost per pack)
create table if not exists public.investor_lots (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  investor_id  uuid not null,
  product_id   uuid not null,
  qty          numeric(16, 6) not null check (qty > 0),
  unit_cost    numeric(12, 2) not null check (unit_cost >= 0),
  entry_date   date not null,
  purchase_id  uuid references public.purchases (id) on delete cascade,
  note         text,
  created_by_name text,
  created_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, investor_id) references public.investors (org_id, id) on delete restrict,
  foreign key (org_id, product_id) references public.products (org_id, id) on delete restrict
);
create index if not exists investor_lots_product_idx on public.investor_lots (product_id);
create index if not exists investor_lots_investor_idx on public.investor_lots (investor_id);

-- profit bookings (each withdrawal / settlement books the profit made since the last one)
create table if not exists public.investor_settlements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  investor_id    uuid not null,
  entry_date     date not null,
  mode           text not null,
  gross_profit   numeric(14, 2) not null,     -- profit on his stock since the last booking
  share_pct      numeric(5, 2) not null,
  investor_profit numeric(14, 2) not null,    -- his part (a loss is all his)
  shop_profit    numeric(14, 2) not null,
  created_by_name text,
  created_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, investor_id) references public.investors (org_id, id) on delete restrict
);
do $$ begin
  alter table public.investor_entries add constraint investor_entries_settlement_fk
    foreign key (settlement_id) references public.investor_settlements (id) on delete cascade;
exception when duplicate_object then null; end $$;

-- which part of each sale / write-off came from his stock (filled automatically)
create table if not exists public.investor_alloc (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  investor_id   uuid not null,
  lot_id        uuid not null references public.investor_lots (id) on delete cascade,
  movement_id   uuid not null references public.stock_movements (id) on delete cascade,
  product_id    uuid not null,
  alloc_date    date not null,
  kind          text not null,                -- sale | return | return_out | damaged | expired | adjustment
  qty           numeric(16, 6) not null,      -- packs out of his lot (negative = came back)
  unit_price    numeric(12, 2) not null,      -- what one pack brought in
  unit_cost     numeric(12, 2) not null,      -- his purchase rate
  sale_id       uuid,
  settlement_id uuid references public.investor_settlements (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists investor_alloc_lot_idx on public.investor_alloc (lot_id);
create index if not exists investor_alloc_inv_idx on public.investor_alloc (investor_id, settlement_id);
create index if not exists investor_alloc_sale_idx on public.investor_alloc (sale_id);

alter table public.cash_entries add column if not exists investor_id uuid;
do $$ begin
  alter table public.cash_entries add constraint cash_entries_investor_fk
    foreign key (org_id, investor_id) references public.investors (org_id, id) on delete restrict;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- RLS: investor figures are for owner/admin only; writes go through functions
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['investors', 'investor_entries', 'investor_lots', 'investor_settlements', 'investor_alloc'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_admin(org_id))', t);
  end loop;
  drop policy if exists investors_insert on public.investors;
  drop policy if exists investors_update on public.investors;
  create policy investors_insert on public.investors for insert to authenticated with check (public.is_admin(org_id));
  create policy investors_update on public.investors for update to authenticated using (public.is_admin(org_id)) with check (public.is_admin(org_id));
end $$;
grant select, insert, update on public.investors to authenticated;
grant select on public.investor_entries, public.investor_lots, public.investor_settlements, public.investor_alloc to authenticated;

-- ---------------------------------------------------------------------
-- Matching stock that goes out to investor lots (his stock first)
-- ---------------------------------------------------------------------
create or replace function public.lot_left(p_lot uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select l.qty - coalesce((select sum(a.qty) from public.investor_alloc a where a.lot_id = l.id), 0)
  from public.investor_lots l where l.id = p_lot;
$$;

create or replace function public.alloc_investor_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_product uuid;
  v_need    numeric;
  v_take    numeric;
  v_left    numeric;
  v_sale    uuid;
  l         record;
  a         record;
begin
  select product_id into v_product from public.batches where id = new.batch_id;
  -- nothing to do unless an investor owns some of this product
  if not exists (select 1 from public.investor_lots where product_id = v_product) then return null; end if;

  if new.qty < 0 then
    -- stock going out: his lots first, oldest lot first
    v_need := -new.qty;
    for l in select * from public.investor_lots where product_id = v_product order by entry_date, created_at for update loop
      exit when v_need <= 0.000001;
      v_left := public.lot_left(l.id);
      continue when v_left <= 0.000001;
      v_take := least(v_need, v_left);
      insert into public.investor_alloc (org_id, investor_id, lot_id, movement_id, product_id, alloc_date, kind, qty, unit_price, unit_cost, sale_id)
      values (new.org_id, l.investor_id, l.id, new.id, v_product, new.movement_date, new.type::text, v_take,
              case when new.type = 'sale' then coalesce(new.unit_price, 0)
                   when new.type = 'return_out' then l.unit_cost      -- back to the supplier at cost: no profit, no loss
                   else 0 end,                                        -- damaged / expired / count shortage: a loss
              l.unit_cost, new.sale_id);
      v_need := v_need - v_take;
    end loop;
  elsif new.return_id is not null then
    -- a customer returned goods from an invoice: undo his part of that sale first
    select sale_id into v_sale from public.sale_returns where id = new.return_id;
    v_need := new.qty;
    for a in
      select lot_id, investor_id, unit_price, unit_cost, sum(qty) as net
      from public.investor_alloc
      where sale_id = v_sale and product_id = v_product
      group by lot_id, investor_id, unit_price, unit_cost
      having sum(qty) > 0
    loop
      exit when v_need <= 0.000001;
      v_take := least(v_need, a.net);
      insert into public.investor_alloc (org_id, investor_id, lot_id, movement_id, product_id, alloc_date, kind, qty, unit_price, unit_cost, sale_id)
      values (new.org_id, a.investor_id, a.lot_id, new.id, v_product, new.movement_date, 'return', -v_take, a.unit_price, a.unit_cost, v_sale);
      v_need := v_need - v_take;
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists stock_movements_investor on public.stock_movements;
create trigger stock_movements_investor after insert on public.stock_movements
  for each row execute function public.alloc_investor_stock();

-- profit already booked (withdrawn / settled) can't be undone by voiding the invoice
create or replace function public.guard_settled_alloc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.settlement_id is not null then
    raise exception 'INVESTOR_SETTLED' using detail = 'This sale is part of an investor settlement';
  end if;
  return old;
end $$;
drop trigger if exists investor_alloc_guard on public.investor_alloc;
create trigger investor_alloc_guard before delete on public.investor_alloc
  for each row execute function public.guard_settled_alloc();

-- ---------------------------------------------------------------------
-- Figures
-- ---------------------------------------------------------------------
-- his part of a profit: share % of a profit, all of a loss
create or replace function public._investor_part(p_gross numeric, p_share numeric)
returns numeric language sql immutable as $$
  select round(case when p_gross > 0 then p_gross * p_share / 100 else p_gross end, 2);
$$;

-- one row per investor with everything the page needs
create or replace function public.investor_summary(p_org uuid)
returns table (
  investor_id uuid, capital numeric, profit_balance numeric, open_gross numeric, open_profit numeric,
  equity numeric, stock_cost numeric, available numeric, units_left numeric, products_left int,
  total_gross numeric, total_paid_out numeric)
language sql stable security invoker set search_path = public as $$
  with e as (
    select investor_id,
           coalesce(sum(amount) filter (where kind = 'deposit'), 0)
             + coalesce(sum(amount) filter (where kind = 'reinvest'), 0)
             - coalesce(sum(amount) filter (where kind = 'withdraw_capital'), 0) as capital,
           coalesce(sum(amount) filter (where kind = 'profit'), 0)
             - coalesce(sum(amount) filter (where kind = 'reinvest'), 0)
             - coalesce(sum(amount) filter (where kind = 'withdraw_profit'), 0) as profit_balance,
           coalesce(sum(amount) filter (where kind in ('withdraw_profit', 'withdraw_capital')), 0) as paid_out
    from public.investor_entries where org_id = p_org group by investor_id
  ),
  a as (
    select investor_id,
           coalesce(sum(round(qty * (unit_price - unit_cost), 2)) filter (where settlement_id is null), 0) as open_gross,
           coalesce(sum(round(qty * (unit_price - unit_cost), 2)), 0) as total_gross
    from public.investor_alloc where org_id = p_org group by investor_id
  ),
  l as (
    select l.investor_id,
           sum(greatest(public.lot_left(l.id), 0) * l.unit_cost) as stock_cost,
           sum(greatest(public.lot_left(l.id), 0)) as units_left,
           count(*) filter (where public.lot_left(l.id) > 0.000001)::int as products_left
    from public.investor_lots l where l.org_id = p_org group by l.investor_id
  )
  select i.id,
         coalesce(e.capital, 0), coalesce(e.profit_balance, 0),
         coalesce(a.open_gross, 0), public._investor_part(coalesce(a.open_gross, 0), i.profit_share),
         coalesce(e.capital, 0) + coalesce(e.profit_balance, 0) + public._investor_part(coalesce(a.open_gross, 0), i.profit_share),
         round(coalesce(l.stock_cost, 0), 2),
         round(coalesce(e.capital, 0) + coalesce(e.profit_balance, 0) + public._investor_part(coalesce(a.open_gross, 0), i.profit_share)
               - coalesce(l.stock_cost, 0), 2),
         coalesce(l.units_left, 0), coalesce(l.products_left, 0),
         coalesce(a.total_gross, 0), coalesce(e.paid_out, 0)
  from public.investors i
  left join e on e.investor_id = i.id
  left join a on a.investor_id = i.id
  left join l on l.investor_id = i.id
  where i.org_id = p_org;
$$;
grant execute on function public.investor_summary(uuid) to authenticated;

-- his stock, product by product
create or replace view public.investor_lot_status with (security_invoker = true) as
select l.id, l.org_id, l.investor_id, l.product_id, l.qty, l.unit_cost, l.entry_date, l.purchase_id, l.note, l.created_at,
       p.name as product_name, p.name_ur as product_name_ur, p.pack_size, p.pack_unit, p.pack_type, co.name as company_name,
       coalesce(sum(a.qty), 0)                                           as sold,
       l.qty - coalesce(sum(a.qty), 0)                                   as left_qty,
       coalesce(sum(round(a.qty * a.unit_price, 2)), 0)                  as revenue,
       coalesce(sum(round(a.qty * (a.unit_price - a.unit_cost), 2)), 0) as gross_profit,
       max(a.alloc_date)                                                 as last_sale
from public.investor_lots l
join public.products p on p.id = l.product_id
left join public.companies co on co.id = p.company_id
left join public.investor_alloc a on a.lot_id = l.id
group by l.id, p.id, co.name;
grant select on public.investor_lot_status to authenticated;

-- his profit day by day
create or replace function public.investor_daily(p_org uuid, p_investor uuid, p_from date, p_to date)
returns table (day date, qty numeric, revenue numeric, cost numeric, gross_profit numeric, investor_profit numeric)
language sql stable security invoker set search_path = public as $$
  select a.alloc_date, sum(a.qty), sum(round(a.qty * a.unit_price, 2)), sum(round(a.qty * a.unit_cost, 2)),
         sum(round(a.qty * (a.unit_price - a.unit_cost), 2)),
         public._investor_part(sum(round(a.qty * (a.unit_price - a.unit_cost), 2)), i.profit_share)
  from public.investor_alloc a join public.investors i on i.id = a.investor_id
  where a.org_id = p_org and a.investor_id = p_investor and a.alloc_date between p_from and p_to
  group by a.alloc_date, i.profit_share
  order by a.alloc_date;
$$;
grant execute on function public.investor_daily(uuid, uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Actions (owner / admin)
-- ---------------------------------------------------------------------
-- money in (capital) or out (capital / profit) of an investor, through cash or an account
create or replace function public._investor_cash(
  p_org uuid, p_investor uuid, p_date date, p_kind text, p_amount numeric, p_account uuid, p_note text, p_settlement uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cash uuid; v_name text; v_id uuid;
begin
  select name into v_name from public.investors where id = p_investor;
  if p_kind in ('deposit', 'withdraw_profit', 'withdraw_capital') then
    insert into public.cash_entries (org_id, entry_date, kind, amount, note, account_id, method, investor_id, created_by_name)
    values (p_org, p_date,
            case when p_kind = 'deposit' then 'cash_in' else 'cash_out' end::public.cash_kind,
            case when p_kind = 'deposit' then p_amount else -p_amount end,
            concat_ws(' · ', case p_kind when 'deposit' then 'Investment' when 'withdraw_profit' then 'Investor profit paid' else 'Investor capital returned' end,
                      v_name, nullif(trim(p_note), '')),
            p_account, public._method_of(p_org, p_account), p_investor, public._who())
    returning id into v_cash;
  end if;
  insert into public.investor_entries (org_id, investor_id, entry_date, kind, amount, settlement_id, cash_entry_id, note, created_by_name)
  values (p_org, p_investor, p_date, p_kind, p_amount, p_settlement, v_cash, nullif(trim(p_note), ''), public._who())
  returning id into v_id;
  return v_id;
end $$;

-- add capital
create or replace function public.investor_deposit(
  p_org uuid, p_investor uuid, p_date date, p_amount numeric, p_account uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists (select 1 from public.investors where id = p_investor and org_id = p_org) then raise exception 'NOT_FOUND'; end if;
  perform public._check_account(p_org, p_account);
  return public._investor_cash(p_org, p_investor, p_date, 'deposit', p_amount, p_account, p_note);
end $$;
grant execute on function public.investor_deposit(uuid, uuid, date, numeric, uuid, text) to authenticated;

-- put stock in his name: from a purchase (split) or from the shop's current stock
create or replace function public.assign_investor_stock(
  p_org uuid, p_investor uuid, p_product uuid, p_qty numeric, p_unit_cost numeric, p_date date,
  p_purchase uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_free numeric; v_avail numeric; v_id uuid;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'INVALID_PRICE'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if not exists (select 1 from public.investors where id = p_investor and org_id = p_org and is_active) then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.investor_lots where product_id = p_product for update;
  -- only the shop's own (unassigned) stock can be put in his name
  select coalesce((select qty from public.product_stock where id = p_product and org_id = p_org), 0)
         - coalesce((select sum(greatest(public.lot_left(id), 0)) from public.investor_lots where product_id = p_product), 0)
    into v_free;
  if p_qty > v_free + 0.000001 then
    raise exception 'INVESTOR_NO_STOCK' using detail = format('Only %s packs of this product are the shop''s own', round(v_free, 3));
  end if;
  -- and only up to the money he has with the shop
  select available into v_avail from public.investor_summary(p_org) where investor_id = p_investor;
  if round(p_qty * p_unit_cost, 2) > coalesce(v_avail, 0) + 0.005 then
    raise exception 'INVESTOR_NO_FUNDS' using detail = format('Available %s', coalesce(v_avail, 0));
  end if;
  insert into public.investor_lots (org_id, investor_id, product_id, qty, unit_cost, entry_date, purchase_id, note, created_by_name)
  values (p_org, p_investor, p_product, p_qty, p_unit_cost, p_date, p_purchase, nullif(trim(p_note), ''), public._who())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.assign_investor_stock(uuid, uuid, uuid, numeric, numeric, date, uuid, text) to authenticated;

-- Book the profit made since the last booking (his share; a loss is all his)
create or replace function public._book_investor_profit(p_org uuid, p_investor uuid, p_date date, p_mode text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_gross numeric; v_share numeric; v_part numeric; v_set uuid;
begin
  select coalesce(sum(round(qty * (unit_price - unit_cost), 2)), 0) into v_gross
  from public.investor_alloc where investor_id = p_investor and settlement_id is null;
  if not exists (select 1 from public.investor_alloc where investor_id = p_investor and settlement_id is null) then return null; end if;
  select profit_share into v_share from public.investors where id = p_investor;
  v_part := public._investor_part(v_gross, v_share);
  insert into public.investor_settlements (org_id, investor_id, entry_date, mode, gross_profit, share_pct, investor_profit, shop_profit, created_by_name)
  values (p_org, p_investor, p_date, p_mode, v_gross, v_share, v_part, v_gross - v_part, public._who())
  returning id into v_set;
  update public.investor_alloc set settlement_id = v_set where investor_id = p_investor and settlement_id is null;
  if v_part <> 0 then
    insert into public.investor_entries (org_id, investor_id, entry_date, kind, amount, settlement_id, note, created_by_name)
    values (p_org, p_investor, p_date, 'profit', v_part, v_set, null, public._who());
  end if;
  return v_set;
end $$;

-- One action for everything:
--   withdraw_some   : take out some of the profit earned so far (any time)
--   reinvest_all    : capital + profit (or minus loss) all stays invested
--   withdraw_profit : profit is paid out, capital stays invested (a loss lowers capital)
--   withdraw_all    : capital + profit paid out (only when his stock is sold)
create or replace function public.settle_investor(
  p_org uuid, p_investor uuid, p_mode text, p_date date, p_account uuid default null,
  p_amount numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; v_set uuid; v_out_profit numeric := 0; v_out_capital numeric := 0;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_mode not in ('withdraw_some', 'reinvest_all', 'withdraw_profit', 'withdraw_all') then raise exception 'INVALID_TYPE'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  perform 1 from public.investors where id = p_investor and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public._check_account(p_org, p_account);

  if p_mode = 'withdraw_all' then
    select * into s from public.investor_summary(p_org) where investor_id = p_investor;
    if s.units_left > 0.000001 then
      raise exception 'INVESTOR_STOCK_LEFT' using detail = format('%s packs of his stock are not sold yet', round(s.units_left, 3));
    end if;
  end if;

  v_set := public._book_investor_profit(p_org, p_investor, p_date, p_mode);
  select * into s from public.investor_summary(p_org) where investor_id = p_investor;

  if p_mode = 'withdraw_some' then
    if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
    if p_amount > s.profit_balance + 0.005 then
      raise exception 'INVESTOR_NO_PROFIT' using detail = format('Profit available %s', greatest(s.profit_balance, 0));
    end if;
    v_out_profit := p_amount;
    perform public._investor_cash(p_org, p_investor, p_date, 'withdraw_profit', p_amount, p_account, p_note, v_set);

  elsif p_mode = 'reinvest_all' then
    if s.profit_balance <> 0 then
      insert into public.investor_entries (org_id, investor_id, entry_date, kind, amount, settlement_id, note, created_by_name)
      values (p_org, p_investor, p_date, 'reinvest', s.profit_balance, v_set, nullif(trim(p_note), ''), public._who());
    end if;

  elsif p_mode = 'withdraw_profit' then
    if s.profit_balance > 0 then
      v_out_profit := s.profit_balance;
      perform public._investor_cash(p_org, p_investor, p_date, 'withdraw_profit', s.profit_balance, p_account, p_note, v_set);
    elsif s.profit_balance < 0 then
      -- a loss comes out of his capital
      insert into public.investor_entries (org_id, investor_id, entry_date, kind, amount, settlement_id, note, created_by_name)
      values (p_org, p_investor, p_date, 'reinvest', s.profit_balance, v_set, 'Loss taken from capital', public._who());
    end if;

  else -- withdraw_all
    if s.profit_balance > 0 then
      v_out_profit := s.profit_balance;
      perform public._investor_cash(p_org, p_investor, p_date, 'withdraw_profit', s.profit_balance, p_account, p_note, v_set);
    elsif s.profit_balance < 0 then
      insert into public.investor_entries (org_id, investor_id, entry_date, kind, amount, settlement_id, note, created_by_name)
      values (p_org, p_investor, p_date, 'reinvest', s.profit_balance, v_set, 'Loss taken from capital', public._who());
    end if;
    v_out_capital := greatest(s.capital + least(s.profit_balance, 0), 0);
    if v_out_capital > 0 then
      perform public._investor_cash(p_org, p_investor, p_date, 'withdraw_capital', v_out_capital, p_account, p_note, v_set);
    end if;
  end if;

  return jsonb_build_object('settlement_id', v_set, 'profit_paid', v_out_profit, 'capital_paid', v_out_capital);
end $$;
grant execute on function public.settle_investor(uuid, uuid, text, date, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Year lock and audit trail cover investments too
-- ---------------------------------------------------------------------
do $$
declare t text[]; u text;
begin
  foreach t slice 1 in array array[['investor_entries', 'entry_date'], ['investor_lots', 'entry_date'], ['investor_settlements', 'entry_date']]
  loop
    execute format('drop trigger if exists %I on public.%I', t[1] || '_period_lock', t[1]);
    execute format('create trigger %I before insert or update or delete on public.%I
                    for each row execute function public.check_period_lock(%L)', t[1] || '_period_lock', t[1], t[2]);
  end loop;
  foreach u in array array['investors', 'investor_entries', 'investor_lots', 'investor_settlements']
  loop
    execute format('drop trigger if exists %I on public.%I', u || '_audit', u);
    execute format('create trigger %I after update or delete on public.%I
                    for each row execute function public.audit_row()', u || '_audit', u);
  end loop;
end $$;
