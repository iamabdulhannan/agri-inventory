-- =====================================================================
-- OPTIONAL test data: sample purchase rates and MRP for products that
-- have no price yet. Rough estimates only - edit real prices in the app
-- (Products -> Edit). Run after migration 005. Safe to run again.
-- =====================================================================
do $$
declare
  v_email text := 'iamabdalhannan@gmail.com';   -- <== the email you sign in with
  v_org   uuid;
begin
  select m.org_id into v_org
  from public.memberships m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(trim(v_email));
  if v_org is null then raise exception 'No organization found for %', v_email; end if;

  -- purchase rate from a rough price per litre / kg by category, rounded to Rs 5
  update public.products p
     set purchase_price = greatest(5, round(
           (case when p.pack_unit in ('ml', 'l') then
                   case c.name when 'Insecticide' then 1800 when 'Fungicide' then 1500 when 'Herbicide' then 1200
                               when 'Growth Regulator' then 2000 when 'Fertilizer' then 400 else 1000 end
                 else
                   case c.name when 'Insecticide' then 2500 when 'Fungicide' then 1600 when 'Herbicide' then 3000
                               when 'Fertilizer' then 150 when 'Micronutrient' then 450 when 'Seeds' then 250 else 500 end
            end) * (case when p.pack_unit in ('ml', 'g') then p.pack_size / 1000.0 else p.pack_size end) / 5) * 5)
    from public.categories c
   where c.id = p.category_id and p.org_id = v_org and p.purchase_price = 0;

  -- MRP about 25% above purchase, rounded to Rs 10
  update public.products
     set sale_price = round(purchase_price * 1.25 / 10) * 10
   where org_id = v_org and sale_price = 0 and purchase_price > 0;

  -- your example: Emamectin 400 ml bought at 345, sold at 500
  update public.products set purchase_price = 345, sale_price = 500
   where org_id = v_org and name ilike 'Emamectin%' and pack_size = 400 and pack_unit = 'ml';
  update public.products set purchase_price = 190, sale_price = 270
   where org_id = v_org and name ilike 'Emamectin%' and pack_size = 200 and pack_unit = 'ml';

  -- give earlier stock-in entries a purchase rate so stock value and profit work
  update public.stock_movements m
     set unit_price = p.purchase_price
    from public.batches b join public.products p on p.id = b.product_id
   where b.id = m.batch_id and m.org_id = v_org and m.type = 'purchase' and m.unit_price is null;
end $$;

-- Result
select count(*) filter (where purchase_price > 0) as products_with_purchase_rate,
       count(*) filter (where sale_price > 0)     as products_with_mrp,
       count(*)                                   as products
from public.products p
join public.memberships m on m.org_id = p.org_id
join auth.users u on u.id = m.user_id
where lower(u.email) = lower('iamabdalhannan@gmail.com');   -- <== same email as above
