-- =====================================================================
-- Set or change the promised payment date of a credit invoice
-- (invoices can't be edited directly; this changes only the due date).
-- Run once in Supabase -> SQL Editor (after 013). Safe to run again.
-- =====================================================================
create or replace function public.set_sale_due_date(p_org uuid, p_sale uuid, p_due date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  update public.sales set due_date = p_due
   where id = p_sale and org_id = p_org and party_id is not null;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
grant execute on function public.set_sale_due_date(uuid, uuid, date) to authenticated;
