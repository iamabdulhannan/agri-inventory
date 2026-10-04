-- =====================================================================
-- Customer returns against a sale invoice.
-- Stock goes back to the batch it was sold from; the value is credited to
-- the customer's khata or refunded in cash; profit reports net it off.
-- Run once in Supabase -> SQL Editor (after 005). Safe to run again.
-- =====================================================================

create table if not exists public.sale_returns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  sale_id         uuid not null references public.sales (id) on delete cascade,
  return_date     date not null,
  party_id        uuid,
  total           numeric(12, 2) not null default 0,   -- value of goods returned
  refund          numeric(12, 2) not null default 0,   -- cash given back now (rest is credited to khata)
  note            text,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now(),
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict,
  check (total >= 0 and refund >= 0 and refund <= total)
);
create index if not exists sale_returns_sale_idx on public.sale_returns (sale_id);
create index if not exists sale_returns_org_date_idx on public.sale_returns (org_id, return_date);
create index if not exists sale_returns_party_idx on public.sale_returns (party_id);

alter table public.stock_movements add column if not exists return_id uuid references public.sale_returns (id) on delete cascade;
alter table public.cash_entries    add column if not exists return_id uuid references public.sale_returns (id) on delete cascade;
create index if not exists movements_return_idx on public.stock_movements (return_id);

drop trigger if exists sale_returns_created_by_name on public.sale_returns;
create trigger sale_returns_created_by_name before insert on public.sale_returns
  for each row execute function public.set_created_by_name();

alter table public.sale_returns enable row level security;
drop policy if exists sale_returns_select on public.sale_returns;
drop policy if exists sale_returns_insert on public.sale_returns;
drop policy if exists sale_returns_delete on public.sale_returns;
create policy sale_returns_select on public.sale_returns for select to authenticated using (public.is_member(org_id));
create policy sale_returns_insert on public.sale_returns for insert to authenticated with check (public.is_member(org_id));
create policy sale_returns_delete on public.sale_returns for delete to authenticated using (public.is_admin(org_id));
grant select, insert, delete on public.sale_returns to authenticated;

-- lines of a return are removed with the whole return (like invoice lines)
drop policy if exists movements_delete on public.stock_movements;
create policy movements_delete on public.stock_movements for delete to authenticated
  using (public.is_admin(org_id) and sale_id is null and purchase_id is null and return_id is null);

-- ---------------------------------------------------------------------
-- What can still be returned from an invoice, per batch
-- ---------------------------------------------------------------------
create or replace function public.sale_returnable(p_sale uuid)
returns table (batch_id uuid, product_id uuid, batch_no text, expiry_date date,
               sold numeric, returned numeric, remaining numeric, rate numeric, unit_cost numeric)
language sql stable security invoker set search_path = public as $$
  with sold as (
    select m.batch_id, sum(-m.qty) as sold, sum(-m.qty * m.unit_price) as amount, max(m.unit_cost) as unit_cost
    from public.stock_movements m where m.sale_id = p_sale group by m.batch_id
  ),
  ret as (
    select m.batch_id, sum(m.qty) as returned
    from public.stock_movements m join public.sale_returns r on r.id = m.return_id
    where r.sale_id = p_sale group by m.batch_id
  )
  select s.batch_id, b.product_id, b.batch_no, b.expiry_date,
         s.sold, coalesce(r.returned, 0), s.sold - coalesce(r.returned, 0),
         round(s.amount / nullif(s.sold, 0), 2), s.unit_cost
  from sold s
  join public.batches b on b.id = s.batch_id
  left join ret r on r.batch_id = s.batch_id
  order by b.product_id, b.expiry_date;
$$;
grant execute on function public.sale_returnable(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Record a return.  p_lines: [{ batch_id, qty }]
-- p_refund: cash given back now. Default: walk-in = full value, khata customer = 0 (credit to khata).
-- ---------------------------------------------------------------------
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
    insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, unit_cost, return_id, party, reference, note)
    values (p_org, r.batch_id, p_date, 'return_in', v_qty, r.rate, r.unit_cost, v_ret,
            coalesce((select name from public.parties where id = v_sale.party_id), v_sale.customer_name),
            'INV-' || v_sale.invoice_no, nullif(trim(p_note), ''));
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

-- ---------------------------------------------------------------------
-- Khata: returns lower what the customer owes (minus any cash refunded)
-- ---------------------------------------------------------------------
create or replace view public.party_balances with (security_invoker = true) as
select p.*,
       (p.opening_balance
        + coalesce((select sum(s.total - s.paid) from public.sales s where s.party_id = p.id), 0)
        + coalesce((select sum(u.total - u.paid) from public.purchases u where u.party_id = p.id), 0)
        - coalesce((select sum(abs(c.amount)) from public.cash_entries c
                    where c.party_id = p.id and c.kind in ('receipt', 'payment')), 0)
        - coalesce((select sum(r.total - r.refund) from public.sale_returns r where r.party_id = p.id), 0))::numeric(14, 2) as balance,
       greatest(
         (select max(s.sale_date) from public.sales s where s.party_id = p.id),
         (select max(u.purchase_date) from public.purchases u where u.party_id = p.id),
         (select max(c.entry_date) from public.cash_entries c where c.party_id = p.id),
         (select max(r.return_date) from public.sale_returns r where r.party_id = p.id)) as last_activity
from public.parties p;

create or replace function public.party_ledger(p_party uuid)
returns table (entry_date date, kind text, ref text, note text, bill numeric, paid numeric, balance numeric, doc_id uuid, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with rows as (
    select p.created_at::date as entry_date, 'opening'::text as kind, null::text as ref, null::text as note,
           p.opening_balance as bill, 0::numeric as paid, null::uuid as doc_id, p.created_at, 0 as ord
    from public.parties p where p.id = p_party and p.opening_balance <> 0
    union all
    select s.sale_date, 'sale', 'INV-' || s.invoice_no, s.note, s.total, s.paid, s.id, s.created_at, 1
    from public.sales s where s.party_id = p_party
    union all
    select u.purchase_date, 'purchase', coalesce(u.reference, 'PUR-' || u.purchase_no), u.note, u.total, u.paid, u.id, u.created_at, 1
    from public.purchases u where u.party_id = p_party
    union all
    -- return: goods value lowers the balance, cash refunded raises it back
    select r.return_date, 'return', 'INV-' || s.invoice_no, r.note, r.refund, r.total, r.sale_id, r.created_at, 1
    from public.sale_returns r join public.sales s on s.id = r.sale_id where r.party_id = p_party
    union all
    select c.entry_date, c.kind::text, null, c.note, 0, abs(c.amount), c.id, c.created_at, 2
    from public.cash_entries c where c.party_id = p_party and c.kind in ('receipt', 'payment')
  )
  select entry_date, kind, ref, note, bill, paid,
         sum(bill - paid) over (order by (ord <> 0), entry_date, ord, created_at rows unbounded preceding) as balance,
         doc_id, created_at
  from rows
  order by (ord <> 0), entry_date, ord, created_at;
$$;

-- ---------------------------------------------------------------------
-- Sales & profit net of returns
-- ---------------------------------------------------------------------
create or replace function public.sales_days(p_org uuid, p_from date, p_to date)
returns table (day date, invoices int, sales numeric, discount numeric, cost numeric, profit numeric, received numeric)
language sql stable security invoker set search_path = public as $$
  with s as (
    select s.sale_date as d, count(*)::int as inv, sum(s.total) as sales, sum(s.discount) as disc, sum(s.paid) as rec,
           coalesce(sum((select sum(-m.qty * coalesce(m.unit_cost, 0)) from public.stock_movements m where m.sale_id = s.id)), 0) as cost
    from public.sales s
    where s.org_id = p_org and s.sale_date between p_from and p_to
    group by s.sale_date
  ),
  r as (
    select r.return_date as d, sum(r.total) as ret, sum(r.refund) as refund,
           coalesce(sum((select sum(m.qty * coalesce(m.unit_cost, 0)) from public.stock_movements m where m.return_id = r.id)), 0) as ret_cost
    from public.sale_returns r
    where r.org_id = p_org and r.return_date between p_from and p_to
    group by r.return_date
  )
  select coalesce(s.d, r.d),
         coalesce(s.inv, 0),
         coalesce(s.sales, 0) - coalesce(r.ret, 0),
         coalesce(s.disc, 0),
         coalesce(s.cost, 0) - coalesce(r.ret_cost, 0),
         (coalesce(s.sales, 0) - coalesce(r.ret, 0)) - (coalesce(s.cost, 0) - coalesce(r.ret_cost, 0)),
         coalesce(s.rec, 0) - coalesce(r.refund, 0)
  from s full join r on r.d = s.d
  order by 1;
$$;

create or replace function public.product_sales(p_org uuid, p_from date, p_to date)
returns table (product_id uuid, qty numeric, revenue numeric, cost numeric, profit numeric)
language sql stable security invoker set search_path = public as $$
  select b.product_id,
         sum(-m.qty),
         sum(round(-m.qty * m.unit_price, 2)),
         sum(round(-m.qty * coalesce(m.unit_cost, 0), 2)),
         sum(round(-m.qty * m.unit_price, 2)) - sum(round(-m.qty * coalesce(m.unit_cost, 0), 2))
  from public.stock_movements m
  join public.batches b on b.id = m.batch_id
  where m.org_id = p_org and (m.sale_id is not null or m.return_id is not null)
    and m.movement_date between p_from and p_to
  group by b.product_id;
$$;
