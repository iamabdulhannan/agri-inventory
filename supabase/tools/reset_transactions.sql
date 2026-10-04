-- =====================================================================
-- FRESH START for one organization: deletes ALL transactions.
--
-- Deleted: sale invoices, purchases, khata payments, roznamcha entries
--          (expenses, cash in/out), every stock entry and batch.
--          Stock becomes 0; invoice and purchase numbers restart at 1.
-- Kept:    products (with purchase rate / MRP), categories, companies,
--          customers & suppliers (with opening balances), members, settings.
--
-- THIS CANNOT BE UNDONE. Check the organization id below, then run in
-- Supabase -> SQL Editor -> New query.
-- =====================================================================
do $$
declare
  v_org uuid := '1bce58f6-5c65-41e8-93f3-bd3ebb0adaeb';   -- <== organization to reset
  v_name text;
begin
  select name into v_name from public.organizations where id = v_org;
  if v_name is null then raise exception 'Organization % not found', v_org; end if;

  raise notice 'Resetting "%": % sales, % purchases, % cash entries, % stock entries, % batches',
    v_name,
    (select count(*) from public.sales where org_id = v_org),
    (select count(*) from public.purchases where org_id = v_org),
    (select count(*) from public.cash_entries where org_id = v_org),
    (select count(*) from public.stock_movements where org_id = v_org),
    (select count(*) from public.batches where org_id = v_org);

  delete from public.cash_entries    where org_id = v_org;
  delete from public.stock_movements where org_id = v_org;   -- all at once, so no batch is ever negative
  delete from public.sales           where org_id = v_org;
  delete from public.purchases       where org_id = v_org;
  delete from public.batches         where org_id = v_org;
  update public.organizations set invoice_seq = 0, purchase_seq = 0 where id = v_org;
end $$;

-- Result: everything below should be 0, products / customers / suppliers unchanged
select o.name as organization,
       (select count(*) from public.sales s where s.org_id = o.id)            as sales,
       (select count(*) from public.purchases p where p.org_id = o.id)        as purchases,
       (select count(*) from public.cash_entries c where c.org_id = o.id)     as cash_entries,
       (select count(*) from public.stock_movements m where m.org_id = o.id)  as stock_entries,
       (select count(*) from public.batches b where b.org_id = o.id)          as batches,
       (select count(*) from public.products p where p.org_id = o.id)         as products_kept,
       (select count(*) from public.parties p where p.org_id = o.id)          as customers_suppliers_kept
from public.organizations o
where o.id = '1bce58f6-5c65-41e8-93f3-bd3ebb0adaeb';   -- <== same id as above
