-- =====================================================================
-- Edit stock-in entries (owner / admin only):
--   * update_purchase      : change a whole purchase (header, lines, payment)
--   * edit_stock_in_line   : change one opening-stock / manual stock-in line
-- Stock already sold can never be edited away (checked when saving), and
-- khata / roznamcha follow automatically.
-- Run once in Supabase -> SQL Editor (after 007). Safe to run again.
-- =====================================================================

-- Internal: find or create the batch for a line. An existing batch may only
-- get a new expiry when nothing else uses it.
create or replace function public._batch_for(p_org uuid, p_product uuid, p_batch_no text, p_expiry date, p_mfg date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_no text;
  b    public.batches;
begin
  if p_expiry is null then raise exception 'EXPIRY_REQUIRED'; end if;
  if p_mfg is not null and p_mfg > p_expiry then raise exception 'INVALID_DATE'; end if;
  if not exists (select 1 from public.products where id = p_product and org_id = p_org) then raise exception 'NOT_FOUND'; end if;
  v_no := coalesce(nullif(trim(p_batch_no), ''), 'EXP-' || to_char(p_expiry, 'YYYY-MM-DD'));

  select * into b from public.batches where org_id = p_org and product_id = p_product and batch_no = v_no for update;
  if not found then
    insert into public.batches (org_id, product_id, batch_no, mfg_date, expiry_date)
    values (p_org, p_product, v_no, p_mfg, p_expiry) returning * into b;
  elsif b.expiry_date <> p_expiry then
    if exists (select 1 from public.stock_movements where batch_id = b.id) then
      raise exception 'BATCH_EXPIRY_MISMATCH' using detail = format('Batch %s already has entries with expiry %s', v_no, b.expiry_date);
    end if;
    update public.batches set expiry_date = p_expiry, mfg_date = p_mfg where id = b.id;
  elsif p_mfg is not null and b.mfg_date is distinct from p_mfg then
    update public.batches set mfg_date = p_mfg where id = b.id;
  end if;
  return b.id;
end $$;
revoke execute on function public._batch_for(uuid, uuid, text, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Edit a whole purchase. Same arguments as record_stock_in (purchase).
-- ---------------------------------------------------------------------
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
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, purchase_id, note, created_by, created_by_name)
    values (p_org, p_date, 'purchase', -v_paid, p_party_id, p_purchase, nullif(trim(p_reference), ''), coalesce(v_by, auth.uid()), v_by_name);
  end if;

  -- batches that this purchase created and no longer uses
  delete from public.batches b
   where b.id = any(coalesce(v_old, '{}')) and not exists (select 1 from public.stock_movements m where m.batch_id = b.id);
  return p_purchase;
end $$;
grant execute on function public.update_purchase(uuid, uuid, date, jsonb, text, text, text, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Edit one stock-in line that is not part of an invoice
-- (opening stock, manual purchase entry, manual customer return).
-- ---------------------------------------------------------------------
create or replace function public.edit_stock_in_line(
  p_org uuid, p_movement uuid, p_date date, p_qty numeric, p_rate numeric,
  p_batch_no text, p_expiry date, p_mfg date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m       public.stock_movements;
  b       public.batches;
  v_no    text;
  v_batch uuid;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  select * into m from public.stock_movements where id = p_movement and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if m.type not in ('purchase', 'return_in') or m.purchase_id is not null or m.sale_id is not null or m.return_id is not null then
    raise exception 'EDIT_VIA_INVOICE';
  end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QTY'; end if;
  if p_rate is not null and p_rate < 0 then raise exception 'INVALID_PRICE'; end if;
  if p_expiry is null then raise exception 'EXPIRY_REQUIRED'; end if;
  if p_mfg is not null and p_mfg > p_expiry then raise exception 'INVALID_DATE'; end if;

  set constraints public.stock_movements_balance deferred;

  select * into b from public.batches where id = m.batch_id for update;
  v_no := coalesce(nullif(trim(p_batch_no), ''), 'EXP-' || to_char(p_expiry, 'YYYY-MM-DD'));
  if b.batch_no = v_no then
    -- same batch: its expiry may change only if no other entry uses it
    if b.expiry_date <> p_expiry then
      if exists (select 1 from public.stock_movements where batch_id = b.id and id <> m.id) then
        raise exception 'BATCH_EXPIRY_MISMATCH' using detail = format('Batch %s has other entries with expiry %s', v_no, b.expiry_date);
      end if;
      update public.batches set expiry_date = p_expiry, mfg_date = coalesce(p_mfg, mfg_date) where id = b.id;
    elsif p_mfg is not null and b.mfg_date is distinct from p_mfg then
      update public.batches set mfg_date = p_mfg where id = b.id;
    end if;
    v_batch := b.id;
  else
    v_batch := public._batch_for(p_org, b.product_id, v_no, p_expiry, p_mfg);
  end if;

  update public.stock_movements
     set batch_id = v_batch, movement_date = p_date, qty = p_qty, unit_price = p_rate,
         note = nullif(trim(p_note), '')
   where id = m.id;

  if v_batch <> b.id and not exists (select 1 from public.stock_movements where batch_id = b.id) then
    delete from public.batches where id = b.id;
  end if;
  if m.type = 'purchase' and p_rate is not null and p_rate > 0 then
    update public.products set purchase_price = p_rate where id = b.product_id and org_id = p_org;
  end if;
  return m.id;
end $$;
grant execute on function public.edit_stock_in_line(uuid, uuid, date, numeric, numeric, text, date, date, text) to authenticated;
