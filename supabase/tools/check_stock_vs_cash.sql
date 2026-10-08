-- =====================================================================
-- Why is Stock value different from what was paid for purchases?
-- READ ONLY: changes nothing. Run in Supabase -> SQL Editor.
-- Organization: 1bce58f6-5c65-41e8-93f3-bd3ebb0adaeb (change the id below for another shop).
--
-- Result: one row per product whose stock value is NOT
--   (bought on bills + opening stock - cost of what was sold/removed + returns),
-- with the reason, then the totals at the bottom. Sold stock is not a difference.
-- =====================================================================
with org as (
  select id, name from public.organizations where id = '1bce58f6-5c65-41e8-93f3-bd3ebb0adaeb'
),
mv as (
  select m.*, b.product_id, p.name as product, p.purchase_price as product_rate,
         p.pack_size, p.pack_unit, o.id as oid, o.name as org_name
  from public.stock_movements m
  join public.batches b on b.id = m.batch_id
  join public.products p on p.id = b.product_id
  join org o on o.id = m.org_id
),
per_product as (
  select mv.oid, mv.org_name, mv.product_id, mv.product,
         mv.pack_size || ' ' || mv.pack_unit as pack,
         -- bought with a purchase bill (cash or khata)
         coalesce(sum(round(qty * unit_price, 2)) filter (where type = 'purchase' and purchase_id is not null and unit_price is not null), 0) as billed,
         -- opening stock / manual stock in: no bill
         coalesce(sum(qty * coalesce(unit_price, product_rate, 0)) filter (where qty > 0 and purchase_id is null and return_id is null), 0) as opening_value,
         -- cost of stock that went out (sales, damage, adjustments)
         coalesce(sum(-qty * coalesce(unit_cost, product_rate, 0)) filter (where qty < 0), 0) as cost_out,
         -- cost of stock that came back from customer returns
         coalesce(sum(qty * coalesce(unit_cost, product_rate, 0)) filter (where return_id is not null), 0) as cost_back,
         count(*) filter (where type = 'purchase' and unit_price is null) as lines_without_rate,
         count(*) filter (where qty < 0 and unit_cost is null) as outs_without_cost
  from mv
  group by mv.oid, mv.org_name, mv.product_id, mv.product, mv.pack_size, mv.pack_unit
),
rows as (
  select pp.org_name, pp.product, pp.pack,
         ps.qty as stock_qty,
         ps.stock_value,
         round(pp.billed + pp.opening_value - pp.cost_out + pp.cost_back, 2) as expected_value,
         round(ps.stock_value - (pp.billed + pp.opening_value - pp.cost_out + pp.cost_back), 2) as difference,
         concat_ws(' + ',
           case when pp.lines_without_rate > 0 then pp.lines_without_rate || ' purchase line(s) without rate: add the rate (Edit purchase)' end,
           case when pp.outs_without_cost > 0 then pp.outs_without_cost || ' stock-out line(s) valued at today''s product rate' end
         ) as reason
  from per_product pp
  join public.product_stock ps on ps.id = pp.product_id
)
-- only products where stock value is NOT what was bought minus what went out
select org_name, product, pack, stock_qty, stock_value, expected_value, difference,
       coalesce(nullif(reason, ''), 'rounding of average batch rate (same batch bought at different rates)') as reason
from rows
where abs(difference) >= 1

union all

-- totals per organization
select o.name, '== TOTAL stock value', null, null,
       (select coalesce(sum(stock_value), 0) from public.product_stock where org_id = o.id), null, null, null
from org o
union all
select o.name, '== TOTAL paid for purchases (roznamcha)', null, null, null,
       (select coalesce(-sum(amount), 0) from public.cash_entries where org_id = o.id and kind = 'purchase'), null, null
from org o
union all
select o.name, '== TOTAL of purchase bills', null, null, null,
       (select coalesce(sum(total), 0) from public.purchases where org_id = o.id), null,
       'if different from paid: some bills are on credit'
from org o
union all
select o.name, '== cash ' || c.kind, null, null, null, sum(c.amount), null, 'roznamcha entries by type'
from org o join public.cash_entries c on c.org_id = o.id
group by o.name, c.kind
order by 1, 2;
