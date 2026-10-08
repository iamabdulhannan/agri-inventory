-- =====================================================================
-- Year-end audit (FBR tax year July-June):
--   * NTN / STRN on the organization (printed on audit reports)
--   * year lock: the owner can lock all entries up to a date
--   * audit trail: every edit and delete is logged and cannot be erased
--   * year_stock / year_report: trading account and P&L for any period
-- Run once in Supabase -> SQL Editor (after 011). Safe to run again.
-- =====================================================================

alter table public.organizations add column if not exists ntn text;
alter table public.organizations add column if not exists strn text;
alter table public.organizations add column if not exists locked_until date;

create or replace function public.is_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                 where org_id = p_org and user_id = auth.uid() and role = 'owner');
$$;

-- ---------------------------------------------------------------------
-- Year lock
-- ---------------------------------------------------------------------
-- Only the owner changes the lock (the SQL editor, without a user, may too)
create or replace function public.guard_org_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.locked_until is distinct from old.locked_until
     and auth.uid() is not null and not public.is_owner(new.id) then
    raise exception 'NOT_ALLOWED';
  end if;
  return new;
end $$;
drop trigger if exists organizations_guard_lock on public.organizations;
create trigger organizations_guard_lock before update on public.organizations
  for each row execute function public.guard_org_lock();

-- Lock entries up to p_until (null = unlock everything). Owner only.
create or replace function public.set_locked_until(p_org uuid, p_until date)
returns date language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_until is not null and p_until >= public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  update public.organizations set locked_until = p_until where id = p_org;
  return p_until;
end $$;
grant execute on function public.set_locked_until(uuid, date) to authenticated;

-- Entries dated on or before locked_until can't be added, changed or deleted.
-- TG_ARGV[0] = the date column of the table.
create or replace function public.check_period_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o       jsonb;
  n       jsonb;
  v_until date;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  -- removing a member only clears created_by: always allowed
  if tg_op = 'UPDATE' and (o - 'created_by') = (n - 'created_by') then return new; end if;
  select locked_until into v_until from public.organizations
   where id = coalesce((n->>'org_id')::uuid, (o->>'org_id')::uuid);
  if v_until is not null and ((o->>tg_argv[0])::date <= v_until or (n->>tg_argv[0])::date <= v_until) then
    raise exception 'PERIOD_LOCKED' using detail = format('Entries up to %s are locked', v_until);
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text[];
begin
  foreach t slice 1 in array array[
    ['stock_movements', 'movement_date'], ['sales', 'sale_date'], ['purchases', 'purchase_date'],
    ['sale_returns', 'return_date'], ['cash_entries', 'entry_date']]
  loop
    execute format('drop trigger if exists %I on public.%I', t[1] || '_period_lock', t[1]);
    execute format('create trigger %I before insert or update or delete on public.%I
                    for each row execute function public.check_period_lock(%L)', t[1] || '_period_lock', t[1], t[2]);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  at         timestamptz not null default clock_timestamp(),
  user_id    uuid,
  user_name  text,
  table_name text not null,
  action     text not null check (action in ('update', 'delete')),
  row_id     uuid,
  old_data   jsonb,
  new_data   jsonb
);
create index if not exists audit_log_org_at_idx on public.audit_log (org_id, at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_admin(org_id));
-- nobody can write, change or erase it: only the trigger below inserts
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o     jsonb := to_jsonb(old);
  n     jsonb;
  v_org uuid;
begin
  if tg_op = 'UPDATE' then
    n := to_jsonb(new);
    -- nothing changed, only the creator was cleared (member removed) or a document counter moved
    if (o - array['created_by', 'invoice_seq', 'purchase_seq']) = (n - array['created_by', 'invoice_seq', 'purchase_seq']) then return null; end if;
    -- filled in by the same save that created the row (e.g. a sale's totals): not an edit
    if (o->>'created_at')::timestamptz = now() then return null; end if;
  end if;
  v_org := case when tg_table_name = 'organizations' then (o->>'id')::uuid else (o->>'org_id')::uuid end;
  -- the whole organization is being deleted
  if not exists (select 1 from public.organizations where id = v_org) then return null; end if;
  insert into public.audit_log (org_id, user_id, user_name, table_name, action, row_id, old_data, new_data)
  values (v_org, auth.uid(), (select full_name from public.profiles where id = auth.uid()),
          tg_table_name, lower(tg_op), (o->>'id')::uuid, o, n);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['stock_movements', 'sales', 'purchases', 'sale_returns', 'cash_entries', 'parties', 'products', 'organizations']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after update or delete on public.%I
                    for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Stock register with values for a period (cost = batch average purchase
-- rate, or the product's purchase rate when the batch has none)
-- ---------------------------------------------------------------------
create or replace function public.year_stock(p_org uuid, p_from date, p_to date)
returns table (product_id uuid, opening_qty numeric, in_qty numeric, out_qty numeric, closing_qty numeric,
               opening_value numeric, closing_value numeric)
language sql stable security invoker set search_path = public as $$
  with b as (
    select bt.id, bt.product_id, coalesce(bs.avg_cost, p.purchase_price, 0) as cost,
           coalesce(sum(m.qty) filter (where m.movement_date < p_from), 0) as q_open,
           coalesce(sum(m.qty) filter (where m.movement_date between p_from and p_to and m.qty > 0), 0) as q_in,
           coalesce(-sum(m.qty) filter (where m.movement_date between p_from and p_to and m.qty < 0), 0) as q_out,
           coalesce(sum(m.qty) filter (where m.movement_date <= p_to), 0) as q_close
    from public.batches bt
    join public.products p on p.id = bt.product_id
    join public.batch_stock bs on bs.id = bt.id
    left join public.stock_movements m on m.batch_id = bt.id
    where bt.org_id = p_org
    group by bt.id, bt.product_id, bs.avg_cost, p.purchase_price
  )
  select product_id, sum(q_open), sum(q_in), sum(q_out), sum(q_close),
         round(sum(greatest(q_open, 0) * cost), 2), round(sum(greatest(q_close, 0) * cost), 2)
  from b group by product_id;
$$;
grant execute on function public.year_stock(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Trading account, profit & loss and position on the last day
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

  select coalesce(sum(amount) filter (where entry_date < p_from), 0),
         coalesce(sum(amount) filter (where entry_date between p_from and p_to and amount > 0), 0),
         coalesce(-sum(amount) filter (where entry_date between p_from and p_to and amount < 0), 0)
    into v_cash_o, v_cash_in, v_cash_out
  from public.cash_entries where org_id = p_org;

  -- khata balances on the last day
  with bal as (
    select p.kind,
           (case when p.created_at::date <= p_to then p.opening_balance else 0 end
            + coalesce((select sum(s.total - s.paid) from public.sales s where s.party_id = p.id and s.sale_date <= p_to), 0)
            + coalesce((select sum(u.total - u.paid) from public.purchases u where u.party_id = p.id and u.purchase_date <= p_to), 0)
            - coalesce((select sum(abs(c.amount)) from public.cash_entries c
                        where c.party_id = p.id and c.kind in ('receipt', 'payment') and c.entry_date <= p_to), 0)
            - coalesce((select sum(x.total - x.refund) from public.sale_returns x where x.party_id = p.id and x.return_date <= p_to), 0)) as balance
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
    'locked_until', (select locked_until from public.organizations where id = p_org));
end $$;
grant execute on function public.year_report(uuid, date, date) to authenticated;
