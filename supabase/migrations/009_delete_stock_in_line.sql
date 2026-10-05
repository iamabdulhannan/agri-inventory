-- =====================================================================
-- Delete one wrong stock-in line (owner / admin).
--   * line of a purchase with other lines -> only that line is removed and
--     the purchase total, paid, khata and roznamcha are recalculated
--   * the only line of a purchase          -> the whole purchase is removed
--   * opening stock / manual stock-in line -> the line is removed
-- Stock already sold cannot be deleted (checked when saving).
-- Run once in Supabase -> SQL Editor (after 008). Safe to run again.
-- =====================================================================
create or replace function public.delete_stock_in_line(p_org uuid, p_movement uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  m       public.stock_movements;
  v_pur   public.purchases;
  v_total numeric;
  v_paid  numeric;
  v_result text := 'line';
begin
  if not public.is_admin(p_org) then raise exception 'NOT_ALLOWED'; end if;
  select * into m from public.stock_movements where id = p_movement and org_id = p_org for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if m.type not in ('purchase', 'return_in') or m.sale_id is not null or m.return_id is not null then
    raise exception 'EDIT_VIA_INVOICE';
  end if;

  set constraints public.stock_movements_balance deferred;

  if m.purchase_id is null then
    delete from public.stock_movements where id = m.id;
  else
    select * into v_pur from public.purchases where id = m.purchase_id for update;
    if (select count(*) from public.stock_movements where purchase_id = v_pur.id) <= 1 then
      delete from public.purchases where id = v_pur.id;          -- its line and cash entry go with it
      v_result := 'purchase';
    else
      delete from public.stock_movements where id = m.id;
      v_total := coalesce((select sum(round(qty * unit_price, 2)) from public.stock_movements
                           where purchase_id = v_pur.id and unit_price is not null), 0);
      v_paid := least(v_pur.paid, v_total);                      -- never paid more than the bill
      update public.purchases set total = v_total, paid = v_paid where id = v_pur.id;
      if v_paid <> v_pur.paid then
        if v_paid > 0 then
          update public.cash_entries set amount = -v_paid where purchase_id = v_pur.id and kind = 'purchase';
        else
          delete from public.cash_entries where purchase_id = v_pur.id and kind = 'purchase';
        end if;
      end if;
    end if;
  end if;

  -- remove the batch if nothing uses it any more
  delete from public.batches b
   where b.id = m.batch_id and not exists (select 1 from public.stock_movements x where x.batch_id = b.id);
  return v_result;
end $$;
grant execute on function public.delete_stock_in_line(uuid, uuid) to authenticated;
