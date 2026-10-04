-- =====================================================================
-- OPTIONAL test data: stock for every product so you can try the dashboard,
-- expiry alerts and reports. Run AFTER products.sql.
--
-- What it creates (dates are relative to today):
--   * one batch per product (batch no. DEMO-001, DEMO-002, ...) purchased 45 days ago
--   * sales to farmers spread over the last 40 days (incl. today)
--   * some batches EXPIRING within 60 days, a few ALREADY EXPIRED
--   * a few products left with NO stock (to see "Low stock")
--   * one damaged entry and one customer return
--
-- Runs only once per organization. To remove it later, run the
-- "remove sample stock" block at the bottom.
-- =====================================================================
do $$
declare
  v_email text := 'iamabdalhannan@gmail.com';   -- <== the email you sign in with
  v_org   uuid;
  v_owner uuid;
  v_today date;
  p       record;
  n       int := 0;
  v_batch uuid;
  v_qty   numeric;
  v_exp   date;
  v_sold  numeric;
  v_sale  numeric;
  d       int;
  farmers text[] := array['Muhammad Aslam', 'Ghulam Rasool', 'Riaz Ahmad', 'Allah Ditta',
                          'Muhammad Akram', 'Bashir Ahmad', 'Nazir Hussain', 'Abdul Sattar'];
begin
  select m.org_id into v_org
  from public.memberships m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(trim(v_email));
  if v_org is null then
    raise exception 'No organization found for %. Use the exact email you sign in with.', v_email;
  end if;
  raise notice 'Organization: % (%)', (select name from public.organizations where id = v_org), v_org;
  if exists (select 1 from public.batches where org_id = v_org and batch_no like 'DEMO-%') then
    raise notice 'Sample stock already exists for this organization. Nothing added.';
    return;
  end if;
  if not exists (select 1 from public.products where org_id = v_org) then
    raise exception 'No products found. Run products.sql first.';
  end if;

  select user_id into v_owner from public.memberships where org_id = v_org and role = 'owner' limit 1;
  v_today := public.org_today(v_org);

  for p in
    select pr.*, co.name as company_name
    from public.products pr left join public.companies co on co.id = pr.company_id
    where pr.org_id = v_org and pr.is_active
    order by pr.name, pr.pack_unit, pr.pack_size
  loop
    n := n + 1;
    continue when n % 17 = 0;                 -- leave a few products without stock

    v_qty := case
      when p.pack_unit = 'kg' and p.pack_size >= 25 then 40 + (n % 5) * 20   -- 50 kg bags
      when p.pack_type = 'gallon'                  then 6 + n % 6
      when p.pack_type = 'bag'                     then 15 + n % 10
      else 20 + (n % 7) * 10 end;

    v_exp := case
      when n % 13 = 0         then v_today - (5 + n % 15)          -- already expired
      when n % 13 in (1, 2, 3) then v_today + (10 + (n * 7) % 50)  -- expiring within 60 days
      else v_today + 240 + (n * 37) % 480 end;                     -- 8 to 24 months

    insert into public.batches (org_id, product_id, batch_no, mfg_date, expiry_date)
    values (v_org, p.id, 'DEMO-' || lpad(n::text, 3, '0'), v_exp - 730, v_exp)
    returning id into v_batch;

    insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, party, reference, created_by)
    values (v_org, v_batch, v_today - 45, 'purchase', v_qty, p.company_name,
            'INV-' || to_char(v_today - 45, 'YYMMDD') || '-' || n, v_owner);

    -- restock some products 10 days ago (so this month's reports show stock coming in too)
    if n % 4 = 0 and v_exp > v_today then
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, party, reference, created_by)
      values (v_org, v_batch, v_today - 10, 'purchase', ceil(v_qty / 2), p.company_name,
              'INV-' || to_char(v_today - 10, 'YYMMDD') || '-' || n, v_owner);
    end if;

    -- sales on several days, never more than ~60% of the first purchase, never after expiry
    v_sold := 0;
    foreach d in array array[40, 33, 26, 19, 12, 6, 2, 0] loop
      continue when (n + d) % 3 = 0;
      continue when v_today - d > v_exp;
      v_sale := greatest(1, floor(v_qty * (1 + (n + d) % 4) * 0.04));
      exit when v_sold + v_sale > v_qty * 0.6;
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, party, created_by)
      values (v_org, v_batch, v_today - d, 'sale', -v_sale, farmers[1 + (n + d) % 8], v_owner);
      v_sold := v_sold + v_sale;
    end loop;

    -- a damaged bottle and a customer return for variety
    if n = 5 then
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, note, created_by)
      values (v_org, v_batch, v_today - 15, 'damaged', -1, 'Bottle leaked in store', v_owner);
    elsif n = 8 and v_sold > 0 then
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, party, note, created_by)
      values (v_org, v_batch, v_today - 1, 'return_in', 1, farmers[3], 'Extra quantity returned', v_owner);
    end if;
  end loop;

  raise notice 'Sample stock added: % batches, % entries.',
    (select count(*) from public.batches where org_id = v_org and batch_no like 'DEMO-%'),
    (select count(*) from public.stock_movements m join public.batches b on b.id = m.batch_id
      where b.org_id = v_org and b.batch_no like 'DEMO-%');
end $$;

-- ---------------------------------------------------------------------
-- Result: which organization was filled, and what it now contains
-- ---------------------------------------------------------------------
select u.email as signed_in_email,
       o.name  as organization,
       (select count(*) from public.companies c where c.org_id = o.id)  as companies,
       (select count(*) from public.products p where p.org_id = o.id)   as products,
       (select count(*) from public.batches b where b.org_id = o.id)    as batches,
       (select count(*) from public.stock_movements s where s.org_id = o.id) as stock_entries
from auth.users u
join public.memberships m on m.user_id = u.id
join public.organizations o on o.id = m.org_id
where lower(u.email) = lower('iamabdalhannan@gmail.com');   -- <== same email as above

-- ---------------------------------------------------------------------
-- To REMOVE the sample stock later, run only this (uncomment first):
-- ---------------------------------------------------------------------
-- delete from public.stock_movements where batch_id in (
--   select b.id from public.batches b
--   join public.memberships m on m.org_id = b.org_id join auth.users u on u.id = m.user_id
--   where lower(u.email) = 'iamabdalhannan@gmail.com' and b.batch_no like 'DEMO-%');
-- delete from public.batches b using public.memberships m, auth.users u
--   where m.org_id = b.org_id and u.id = m.user_id
--     and lower(u.email) = 'iamabdalhannan@gmail.com' and b.batch_no like 'DEMO-%';
