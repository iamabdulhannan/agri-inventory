-- =====================================================================
-- Sell bags loose by weight (e.g. 12.5 kg from a 50 kg bag).
-- Stock stays in bags (12.5 kg = 0.25 bag); the line is only marked
-- "loose" so receipts and returns show it in kg with a per-kg rate.
-- Run once in Supabase -> SQL Editor (after 009). Safe to run again.
-- =====================================================================
alter table public.stock_movements add column if not exists loose boolean not null default false;

-- ---------------------------------------------------------------------
-- Sale: p_lines [{ product_id, qty (bags), unit_price (per bag), batch_id|null, loose? }]
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
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, unit_cost, sale_id, party, reference, loose)
      values (p_org, b.id, p_date, 'sale', -v_take, v_rate, b.cost, v_sale, v_name, 'INV-' || v_no, v_loose);
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
-- What can still be returned from an invoice (now also says if it was sold loose)
-- ---------------------------------------------------------------------
drop function if exists public.sale_returnable(uuid);
create or replace function public.sale_returnable(p_sale uuid)
returns table (batch_id uuid, product_id uuid, batch_no text, expiry_date date,
               sold numeric, returned numeric, remaining numeric, rate numeric, unit_cost numeric, loose boolean)
language sql stable security invoker set search_path = public as $$
  with sold as (
    select m.batch_id, sum(-m.qty) as sold, sum(-m.qty * m.unit_price) as amount, max(m.unit_cost) as unit_cost, bool_or(m.loose) as loose
    from public.stock_movements m where m.sale_id = p_sale group by m.batch_id
  ),
  ret as (
    select m.batch_id, sum(m.qty) as returned
    from public.stock_movements m join public.sale_returns r on r.id = m.return_id
    where r.sale_id = p_sale group by m.batch_id
  )
  select s.batch_id, b.product_id, b.batch_no, b.expiry_date,
         s.sold, coalesce(r.returned, 0), s.sold - coalesce(r.returned, 0),
         round(s.amount / nullif(s.sold, 0), 2), s.unit_cost, s.loose
  from sold s
  join public.batches b on b.id = s.batch_id
  left join ret r on r.batch_id = s.batch_id
  order by b.product_id, b.expiry_date;
$$;
grant execute on function public.sale_returnable(uuid) to authenticated;

-- returned stock keeps the loose flag of the sale
create or replace function public.record_sale_return(
  p_org uuid, p_sale uuid, p_date date, p_lines jsonb, p_refund numeric default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sale   public.sales;
  v_ret    uuid;
  l        jsonb;
  r        record;
  v_qty    numeric;
  v_factor numeric;   -- invoice discount shared over its items
  v_total  numeric := 0;
  v_refund numeric;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  select * into v_sale from public.sales where id = p_sale and org_id = p_org for update;
  if not found then raise exception 'INVALID_INVOICE'; end if;
  if p_date is null or p_date > public.org_today(p_org) or p_date < v_sale.sale_date then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;
  v_factor := case when v_sale.subtotal > 0 then v_sale.total / v_sale.subtotal else 1 end;

  insert into public.sale_returns (org_id, sale_id, return_date, party_id, note)
  values (p_org, p_sale, p_date, v_sale.party_id, nullif(trim(p_note), ''))
  returning id into v_ret;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l->>'qty')::numeric;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then raise exception 'INVALID_QTY'; end if;
    select * into r from public.sale_returnable(p_sale) x where x.batch_id = (l->>'batch_id')::uuid;
    if not found then raise exception 'INVALID_RETURN_LINE'; end if;
    if v_qty > r.remaining then
      raise exception 'RETURN_TOO_MUCH' using detail = format('Only %s left to return for batch %s', r.remaining, r.batch_no);
    end if;
    insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, unit_cost, return_id, party, reference, note, loose)
    values (p_org, r.batch_id, p_date, 'return_in', v_qty, r.rate, r.unit_cost, v_ret,
            coalesce((select name from public.parties where id = v_sale.party_id), v_sale.customer_name),
            'INV-' || v_sale.invoice_no, nullif(trim(p_note), ''), coalesce(r.loose, false));
    v_total := v_total + round(v_qty * r.rate * v_factor, 2);
  end loop;

  if v_total = 0 and not exists (select 1 from public.stock_movements where return_id = v_ret) then
    raise exception 'NO_LINES';
  end if;

  v_refund := coalesce(p_refund, case when v_sale.party_id is null then v_total else 0 end);
  if v_refund < 0 or v_refund > v_total then raise exception 'INVALID_REFUND'; end if;
  if v_refund < v_total and v_sale.party_id is null then raise exception 'CREDIT_NEEDS_PARTY'; end if;

  update public.sale_returns set total = v_total, refund = v_refund where id = v_ret;
  if v_refund > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, return_id, note)
    values (p_org, p_date, 'cash_out', -v_refund, v_sale.party_id, v_ret, 'Refund · return of INV-' || v_sale.invoice_no);
  end if;
  return v_ret;
end $$;
grant execute on function public.record_sale_return(uuid, uuid, date, jsonb, numeric, text) to authenticated;
