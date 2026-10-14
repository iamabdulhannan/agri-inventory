-- =====================================================================
-- Correct the rates (and discount / markup) of a saved invoice.
-- Stock does not change. Totals, cash received, khata, profit and the
-- investors' share follow. Owner / admin only; every change is in the
-- audit trail; locked years can't be changed.
-- Walk-in invoice : paid = new total (the cash entry follows).
-- Khata customer  : what he already paid stays; if the new total is lower
--                   than that, the extra becomes a payment on his khata.
-- Run once in Supabase -> SQL Editor (after 016). Safe to run again.
-- =====================================================================
create or replace function public.correct_sale_rates(
  p_org uuid, p_sale uuid, p_lines jsonb, p_discount numeric default null, p_markup numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s        public.sales;
  l        jsonb;
  v_rate   numeric;
  v_sub    numeric := 0;
  v_disc   numeric;
  v_mark   numeric;
  v_total  numeric;
  v_adv    numeric;
  v_paid   numeric;
  v_extra  numeric := 0;
  v_cash   public.cash_entries;
  v_before numeric;
  v_settled boolean;
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  select * into s from public.sales where id = p_sale and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.sale_returns where sale_id = p_sale) then raise exception 'SALE_HAS_RETURNS'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'NO_LINES'; end if;
  v_before := s.total;

  -- new rate per pack for each product (and loose / full bags separately)
  for l in select * from jsonb_array_elements(p_lines) loop
    v_rate := (l->>'unit_price')::numeric;
    if v_rate is null or v_rate < 0 then raise exception 'INVALID_PRICE'; end if;
    update public.stock_movements m
       set unit_price = v_rate
      from public.batches b
     where m.sale_id = p_sale and b.id = m.batch_id
       and b.product_id = (l->>'product_id')::uuid
       and m.loose = coalesce((l->>'loose')::boolean, false)
       and m.unit_price is distinct from v_rate;
  end loop;

  -- totals from the lines (each product line rounded like a new sale)
  select coalesce(sum(round(q * r, 2)), 0) into v_sub
  from (select sum(-m.qty) as q, m.unit_price as r
        from public.stock_movements m join public.batches b on b.id = m.batch_id
        where m.sale_id = p_sale
        group by b.product_id, m.loose, m.unit_price) x;
  v_disc := coalesce(p_discount, s.discount);
  v_mark := coalesce(p_markup, s.markup);
  if v_disc < 0 or v_disc > v_sub then raise exception 'INVALID_DISCOUNT'; end if;
  if v_mark < 0 then raise exception 'INVALID_AMOUNT'; end if;
  v_total := v_sub - v_disc + round(v_mark, 2);

  -- paid from a crop advance can't be more than the bill
  v_adv := least(s.advance_used, v_total);
  if v_adv < s.advance_used then
    update public.advance_entries set amount = v_adv where sale_id = p_sale and kind = 'use' and v_adv > 0;
    delete from public.advance_entries where sale_id = p_sale and kind = 'use' and v_adv = 0;
  end if;

  if s.party_id is null then
    v_paid := v_total;                                  -- walk-in: always paid in full
  else
    v_paid := least(s.paid, v_total - v_adv);
    v_extra := s.paid - v_paid;                         -- paid more than the corrected bill
  end if;

  update public.sales
     set subtotal = v_sub, discount = v_disc, markup = round(v_mark, 2), total = v_total,
         paid = v_paid, advance_used = v_adv,
         due_date = case when v_paid + v_adv < v_total then due_date end
   where id = p_sale;

  -- the money received for this invoice
  select * into v_cash from public.cash_entries where sale_id = p_sale and kind = 'sale' limit 1;
  if v_paid > 0 and v_cash.id is not null then
    update public.cash_entries set amount = v_paid where id = v_cash.id and amount <> v_paid;
  elsif v_paid > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, sale_id, note, method)
    values (p_org, s.sale_date, 'sale', v_paid, s.party_id, p_sale, 'INV-' || s.invoice_no, 'cash');
  elsif v_cash.id is not null then
    delete from public.cash_entries where id = v_cash.id;
  end if;
  -- khata customer paid more than the corrected bill: the extra stays with him as a payment on his khata
  if v_extra > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, note, account_id, method)
    values (p_org, s.sale_date, 'receipt', v_extra, s.party_id, 'INV-' || s.invoice_no || ' correction',
            v_cash.account_id, coalesce(v_cash.method, 'cash'));
  end if;

  -- investors (migration 015): their share of this invoice uses the corrected rates (unless already settled)
  if to_regclass('public.investor_alloc') is not null then
    execute 'select exists (select 1 from public.investor_alloc where sale_id = $1 and settlement_id is not null)' into v_settled using p_sale;
    if v_settled then raise exception 'INVESTOR_SETTLED'; end if;
    execute 'update public.investor_alloc a set unit_price = m.unit_price
               from public.stock_movements m
              where a.movement_id = m.id and m.sale_id = $1 and a.unit_price is distinct from m.unit_price' using p_sale;
  end if;

  return jsonb_build_object('total_before', v_before, 'total', v_total, 'paid', v_paid, 'to_khata', v_extra);
end $$;
grant execute on function public.correct_sale_rates(uuid, uuid, jsonb, numeric, numeric) to authenticated;
