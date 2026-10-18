-- =====================================================================
-- Offline mode
--   * every change made offline gets an id on the device; offline_apply()
--     runs it exactly once (a retry after a lost connection returns the
--     first result instead of saving it again: no duplicates)
--   * each device reserves a block of invoice numbers, so receipts printed
--     offline already carry their final number
--   * a change that can't be applied (e.g. not enough stock any more) is
--     returned as an error and nothing of it is saved; the device keeps it
--     in "Needs attention"
-- Run once in Supabase -> SQL Editor (after 018). Safe to run again.
-- =====================================================================

-- changes already applied, by their device id
create table if not exists public.client_ops (
  id          uuid primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  device_id   text,
  fn          text not null,
  result      jsonb,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  applied_at  timestamptz not null default now()
);
create index if not exists client_ops_org_idx on public.client_ops (org_id, applied_at desc);
alter table public.client_ops enable row level security;
drop policy if exists client_ops_select on public.client_ops;
drop policy if exists client_ops_insert on public.client_ops;
create policy client_ops_select on public.client_ops for select to authenticated using (public.is_member(org_id));
create policy client_ops_insert on public.client_ops for insert to authenticated with check (public.is_member(org_id));
grant select, insert on public.client_ops to authenticated;

-- invoice numbers kept by a device
create table if not exists public.invoice_reservations (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  invoice_no  int not null,
  device_id   text not null,
  reserved_by uuid default auth.uid(),
  reserved_at timestamptz not null default now(),
  used_at     timestamptz,
  primary key (org_id, invoice_no)
);
alter table public.invoice_reservations enable row level security;
drop policy if exists invoice_reservations_select on public.invoice_reservations;
create policy invoice_reservations_select on public.invoice_reservations for select to authenticated using (public.is_member(org_id));
grant select on public.invoice_reservations to authenticated;

create or replace function public.reserve_invoice_numbers(p_org uuid, p_device text, p_count int default 50)
returns int[] language plpgsql security definer set search_path = public as $$
declare v_end int; v_start int; v_nos int[];
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_count is null or p_count < 1 or p_count > 200 then raise exception 'INVALID_AMOUNT'; end if;
  if coalesce(trim(p_device), '') = '' then raise exception 'INVALID_TYPE'; end if;
  update public.organizations set invoice_seq = invoice_seq + p_count where id = p_org returning invoice_seq into v_end;
  v_start := v_end - p_count + 1;
  insert into public.invoice_reservations (org_id, invoice_no, device_id)
  select p_org, n, p_device from generate_series(v_start, v_end) n;
  select array_agg(n order by n) into v_nos from generate_series(v_start, v_end) n;
  return v_nos;
end $$;
grant execute on function public.reserve_invoice_numbers(uuid, text, int) to authenticated;

-- numbers this device still has (after a reinstall the device can ask again)
create or replace function public.my_reserved_invoices(p_org uuid, p_device text)
returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(invoice_no order by invoice_no), '{}')
  from public.invoice_reservations
  where org_id = p_org and device_id = p_device and used_at is null and public.is_member(p_org);
$$;
grant execute on function public.my_reserved_invoices(uuid, text) to authenticated;

create or replace function public._use_reserved_invoice(p_org uuid, p_no int)
returns int language plpgsql security definer set search_path = public as $$
begin
  if p_no is null then return null; end if;
  update public.invoice_reservations set used_at = now()
   where org_id = p_org and invoice_no = p_no and used_at is null;
  if not found then raise exception 'INVALID_INVOICE_NO' using detail = format('Invoice number %s is not reserved or already used', p_no); end if;
  return p_no;
end $$;

drop function if exists public.record_sale(uuid, date, jsonb, uuid, text, numeric, numeric, text, numeric, date, uuid, uuid, numeric);
create or replace function public.record_sale(
  p_org uuid, p_date date, p_lines jsonb,
  p_party_id uuid default null, p_customer_name text default null,
  p_discount numeric default 0, p_paid numeric default null, p_note text default null,
  p_markup numeric default 0, p_due_date date default null, p_account uuid default null,
  p_advance uuid default null, p_advance_amount numeric default 0, p_invoice_no int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l       jsonb;
  b       record;
  v_sale  uuid;
  v_no    int;
  v_name  text := nullif(trim(p_customer_name), '');
  v_need  numeric;
  v_take  numeric;
  v_rate  numeric;
  v_sub   numeric := 0;
  v_disc  numeric := coalesce(p_discount, 0);
  v_total numeric;
  v_paid  numeric;
  v_loose boolean;
  v_mark  numeric := coalesce(p_markup, 0);
  v_adv   numeric := coalesce(p_advance_amount, 0);
  v_left  numeric;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;

  if p_party_id is not null then
    select name into v_name from public.parties where id = p_party_id and org_id = p_org and kind = 'customer';
    if not found then raise exception 'INVALID_PARTY'; end if;
  end if;
  perform public._check_account(p_org, p_account);
  if v_mark < 0 then raise exception 'INVALID_AMOUNT'; end if;
  -- paying (part of) the bill from the customer's crop advance
  if v_adv < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_adv > 0 then
    if p_party_id is null or p_advance is null then raise exception 'INVALID_ADVANCE'; end if;
    perform 1 from public.crop_advances where id = p_advance and org_id = p_org and party_id = p_party_id and not is_closed for update;
    if not found then raise exception 'INVALID_ADVANCE'; end if;
    v_left := public.advance_balance(p_advance);
    if v_adv > v_left then raise exception 'ADVANCE_TOO_MUCH' using detail = format('Only %s left in this advance', v_left); end if;
  end if;

  -- a device may use one of its reserved invoice numbers (offline sales print the final number)
  v_no := coalesce(public._use_reserved_invoice(p_org, p_invoice_no), public.next_doc_no(p_org, 'invoice'));
  insert into public.sales (org_id, invoice_no, sale_date, party_id, customer_name, note)
  values (p_org, v_no, p_date, p_party_id, v_name, nullif(trim(p_note), ''))
  returning id into v_sale;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_need := (l->>'qty')::numeric;
    v_rate := (l->>'unit_price')::numeric;
    if v_need is null or v_need <= 0 then raise exception 'INVALID_QTY'; end if;
    if v_rate is null or v_rate < 0 then raise exception 'INVALID_PRICE'; end if;
    v_sub := v_sub + round(v_need * v_rate, 2);
    -- a bag sold by weight (kg): qty is still in bags (e.g. 0.25), the flag only changes how it is shown
    v_loose := coalesce((l->>'loose')::boolean, false)
               and exists (select 1 from public.products where id = (l->>'product_id')::uuid and org_id = p_org and pack_type = 'bag');

    perform 1 from public.batches where org_id = p_org and product_id = (l->>'product_id')::uuid for update;

    for b in
      select bs.id, bs.qty, bs.expiry_date, coalesce(bs.avg_cost, p.purchase_price, 0) as cost
      from public.batch_stock bs join public.products p on p.id = bs.product_id
      where bs.org_id = p_org
        and bs.product_id = (l->>'product_id')::uuid
        and bs.qty > 0
        and (nullif(l->>'batch_id', '') is null or bs.id = (l->>'batch_id')::uuid)
        and bs.expiry_date >= p_date                     -- never sell expired stock
      order by bs.expiry_date, bs.created_at
    loop
      exit when v_need <= 0;
      v_take := least(v_need, b.qty);
      -- loose sales leave rounding dust (10 kg of a 60 kg bag = 0.166667): never leave a millionth of a bag behind
      if b.qty - v_take < 0.00001 then v_take := b.qty; end if;
      insert into public.stock_movements (org_id, batch_id, movement_date, type, qty, unit_price, unit_cost, sale_id, party, reference, loose)
      values (p_org, b.id, p_date, 'sale', -v_take, v_rate, b.cost, v_sale, v_name, 'INV-' || v_no, v_loose);
      v_need := v_need - v_take;
      if v_need < 0.00001 then v_need := 0; end if;
    end loop;

    if v_need > 0 then
      raise exception 'INSUFFICIENT_STOCK' using detail = format('Short by %s for product %s', v_need, l->>'product_id');
    end if;
  end loop;

  if v_disc < 0 or v_disc > v_sub then raise exception 'INVALID_DISCOUNT'; end if;
  v_total := v_sub - v_disc + round(v_mark, 2);
  if v_adv > v_total then raise exception 'ADVANCE_TOO_MUCH'; end if;
  v_paid := coalesce(p_paid, v_total - v_adv);
  if v_paid < 0 or v_paid + v_adv > v_total then raise exception 'INVALID_PAID'; end if;
  if v_paid + v_adv < v_total and p_party_id is null then raise exception 'CREDIT_NEEDS_PARTY'; end if;

  update public.sales
     set subtotal = v_sub, discount = v_disc, markup = round(v_mark, 2), total = v_total, paid = v_paid,
         advance_used = v_adv, advance_id = case when v_adv > 0 then p_advance end,
         due_date = case when v_paid + v_adv < v_total then p_due_date end
   where id = v_sale;
  if v_paid > 0 then
    insert into public.cash_entries (org_id, entry_date, kind, amount, party_id, sale_id, note, account_id, method)
    values (p_org, p_date, 'sale', v_paid, p_party_id, v_sale, 'INV-' || v_no, p_account, public._method_of(p_org, p_account));
  end if;
  if v_adv > 0 then
    insert into public.advance_entries (org_id, advance_id, entry_date, kind, amount, sale_id, note)
    values (p_org, p_advance, p_date, 'use', v_adv, v_sale, 'INV-' || v_no);
  end if;
  return v_sale;
end $$;
grant execute on function public.record_sale(uuid, date, jsonb, uuid, text, numeric, numeric, text, numeric, date, uuid, uuid, numeric, int) to authenticated;

-- Roznamcha cash in / cash out / expense (so they can be saved offline too)
create or replace function public.add_cash_entry(
  p_org uuid, p_date date, p_kind text, p_amount numeric, p_note text default null, p_account uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_kind not in ('cash_in', 'cash_out', 'expense') then raise exception 'INVALID_TYPE'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_date is null or p_date > public.org_today(p_org) then raise exception 'INVALID_DATE'; end if;
  perform public._check_account(p_org, p_account);
  insert into public.cash_entries (org_id, entry_date, kind, amount, note, account_id, method)
  values (p_org, p_date, p_kind::public.cash_kind, case when p_kind = 'cash_in' then p_amount else -p_amount end,
          nullif(trim(p_note), ''), p_account, public._method_of(p_org, p_account))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_cash_entry(uuid, date, text, numeric, text, uuid) to authenticated;

-- Apply one change made on a device, exactly once.
-- Returns {"ok": true, "result": ...} or {"ok": false, "error": "...", "detail": "..."} (nothing saved).
create or replace function public.offline_apply(p_org uuid, p_op uuid, p_fn text, p_args jsonb, p_device text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_done jsonb;
  v_res  jsonb;
  v_sql  text;
  k      text;
  v      jsonb;
  parts  text[] := array[]::text[];
  v_detail text;
begin
  if not public.is_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_op is null then raise exception 'INVALID_TYPE'; end if;
  if p_fn not in ('record_sale', 'record_stock_in', 'record_party_payment', 'add_cash_entry', 'record_cheque') then
    raise exception 'NOT_ALLOWED' using detail = 'Not allowed offline: ' || coalesce(p_fn, '');
  end if;
  -- the same change sent twice at the same moment waits here
  perform pg_advisory_xact_lock(hashtextextended(p_op::text, 0));
  select result into v_done from public.client_ops where id = p_op;
  if found then return jsonb_build_object('ok', true, 'result', v_done, 'again', true); end if;

  -- named arguments as quoted literals (Postgres turns them into the right types)
  for k, v in select * from jsonb_each(coalesce(p_args, '{}'::jsonb) - 'p_org') loop
    if k !~ '^p_[a-z_]+$' then raise exception 'INVALID_TYPE' using detail = 'Bad argument ' || k; end if;
    parts := parts || format('%I => %s', k,
      case jsonb_typeof(v)
        when 'null' then 'null'
        when 'string' then quote_literal(v #>> '{}')
        when 'object' then quote_literal(v::text)
        when 'array' then quote_literal(v::text)
        else quote_literal(v::text) end);
  end loop;
  v_sql := format('select to_jsonb(public.%I(p_org => %L%s))', p_fn, p_org,
                  case when array_length(parts, 1) > 0 then ', ' || array_to_string(parts, ', ') else '' end);

  begin
    execute v_sql into v_res;
  exception when others then
    -- nothing of this change is kept; the device shows it in "Needs attention"
    get stacked diagnostics v_detail = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'detail', nullif(v_detail, ''), 'code', sqlstate);
  end;
  insert into public.client_ops (id, org_id, device_id, fn, result) values (p_op, p_org, p_device, p_fn, v_res);
  return jsonb_build_object('ok', true, 'result', v_res);
end $$;
grant execute on function public.offline_apply(uuid, uuid, text, jsonb, text) to authenticated;
