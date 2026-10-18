-- =====================================================================
-- Sales follow corrected purchase rates.
-- A sale keeps the cost of the stock it came from (for profit). When a
-- purchase rate was entered wrong and is corrected later (Edit purchase,
-- edit a stock-in line, or the product's purchase rate for stock that has
-- no rate), the cost of the sales from that stock is now updated too, so
-- profit is right everywhere (reports, dashboard, audit).
-- Locked years are not touched.
-- Run once in Supabase -> SQL Editor (after 017). Safe to run again.
-- =====================================================================

-- cost of a batch: its average purchase rate, or the product's purchase rate when it has none
create or replace function public._refresh_batch_costs(p_batch uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric; v_org uuid; v_lock date;
begin
  select coalesce(bs.avg_cost, p.purchase_price, 0), bs.org_id into v_cost, v_org
  from public.batch_stock bs join public.products p on p.id = bs.product_id
  where bs.id = p_batch;
  if v_org is null then return; end if;
  select locked_until into v_lock from public.organizations where id = v_org;
  update public.stock_movements
     set unit_cost = v_cost
   where batch_id = p_batch
     and (sale_id is not null or return_id is not null)
     and unit_cost is distinct from v_cost
     and (v_lock is null or movement_date > v_lock);
end $$;

-- a purchase line corrected (rate / qty / batch) or removed. New purchases don't rewrite old sales.
create or replace function public.purchase_line_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.type <> 'purchase' then return null; end if;
  if tg_op = 'DELETE' then
    perform public._refresh_batch_costs(old.batch_id);
  elsif new.unit_price is distinct from old.unit_price or new.qty is distinct from old.qty or new.batch_id is distinct from old.batch_id then
    perform public._refresh_batch_costs(old.batch_id);
    if new.batch_id is distinct from old.batch_id then perform public._refresh_batch_costs(new.batch_id); end if;
  end if;
  return null;
end $$;
drop trigger if exists stock_movements_cost_refresh on public.stock_movements;
create trigger stock_movements_cost_refresh after update or delete on public.stock_movements
  for each row execute function public.purchase_line_changed();

-- Edit purchase replaces its lines: refresh the sales of its stock at the end
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
  -- corrected rates reach the sales from this stock
  perform public._refresh_batch_costs(x) from (
    select unnest(coalesce(v_old, '{}')) as x
    union select batch_id from public.stock_movements where purchase_id = p_purchase) y;
  return p_purchase;
end $$;

-- the product's purchase rate changed: stock without its own rate uses it
create or replace function public.product_rate_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if new.purchase_price is distinct from old.purchase_price then
    for b in select bs.id from public.batch_stock bs where bs.product_id = new.id and bs.avg_cost is null loop
      perform public._refresh_batch_costs(b);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists products_cost_refresh on public.products;
create trigger products_cost_refresh after update of purchase_price on public.products
  for each row execute function public.product_rate_changed();

-- one-time repair: bring every past sale in line with the (corrected) purchase rates
do $$
declare b uuid;
begin
  for b in select distinct m.batch_id from public.stock_movements m where m.sale_id is not null or m.return_id is not null loop
    perform public._refresh_batch_costs(b);
  end loop;
end $$;
