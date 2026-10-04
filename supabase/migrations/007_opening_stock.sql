-- =====================================================================
-- Opening stock: stock already on the shelf when you start using the app
-- (single entry or bulk import). Rates are kept for stock value and profit,
-- but no purchase invoice, no cash (roznamcha) and no khata entry is made.
-- Run once in Supabase -> SQL Editor (after 006). Safe to run again.
-- =====================================================================

drop function if exists public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text, uuid, numeric);
drop function if exists public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text, uuid, numeric, boolean);

create or replace function public.record_stock_in(
  p_org uuid, p_date date, p_type public.movement_type, p_lines jsonb,
  p_party text default null, p_reference text default null, p_note text default null,
  p_party_id uuid default null, p_paid numeric default null, p_opening boolean default false)
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
      insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, purchase_id, note)
      values (p_org, p_date, 'purchase', -v_paid, p_party_id, v_purchase, nullif(trim(p_reference), ''));
    end if;
  end if;
  return v_purchase;
end $$;
grant execute on function public.record_stock_in(uuid, date, public.movement_type, jsonb, text, text, text, uuid, numeric, boolean) to authenticated;
