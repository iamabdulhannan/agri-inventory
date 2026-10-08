-- =====================================================================
-- Exact loose sales from any bag size.
-- 10 kg from a 60 kg bag is 0.1666... bag, which did not fit in 3 decimals.
-- Stock quantities now keep 6 decimals, and a sale never leaves a
-- millionth of a bag behind (rounding dust is absorbed).
-- Run once in Supabase -> SQL Editor (after 010). Safe to run again.
-- =====================================================================

-- the stock views depend on stock_movements.qty: drop, widen, recreate
drop view if exists public.expiry_alerts;
drop view if exists public.product_stock;
drop view if exists public.batch_stock;

alter table public.stock_movements alter column qty type numeric(16, 6);

create view public.batch_stock with (security_invoker = true) as
select b.id, b.org_id, b.product_id, b.batch_no, b.mfg_date, b.expiry_date, b.created_at,
       coalesce(sum(m.qty), 0)::numeric(16, 6) as qty,
       -- average purchase rate of this batch
       round(sum(m.qty * m.unit_price) filter (where m.type = 'purchase' and m.unit_price is not null)
             / nullif(sum(m.qty) filter (where m.type = 'purchase' and m.unit_price is not null), 0), 2) as avg_cost
from public.batches b
left join public.stock_movements m on m.batch_id = b.id
group by b.id;

create view public.product_stock with (security_invoker = true) as
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
       coalesce(sum(greatest(bs.qty, 0) * coalesce(bs.avg_cost, p.purchase_price)), 0)::numeric(14, 2) as stock_value
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

grant select on public.batch_stock, public.product_stock, public.expiry_alerts to authenticated;

-- ---------------------------------------------------------------------
-- Sale (same as 010) + rounding dust absorbed
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
  v_loose boolean;
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
