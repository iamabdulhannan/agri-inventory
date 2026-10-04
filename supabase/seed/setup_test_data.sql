-- =====================================================================
-- ONE-CLICK TEST SETUP
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
--
--   1. finds your account by email (sign up in the app first)
--   2. repairs your profile + organization membership if missing
--      (creates "abu bakar spray center" with you as Owner)
--   3. adds companies + ~90 market products
--   4. adds sample stock (batches, purchases, sales, expiring items)
--   5. shows a result row with your org_id and the counts
--
-- Safe to run again: nothing is duplicated.
-- To use another email, replace iamabdalhannan@gmail.com everywhere (Cmd+F).
-- =====================================================================

do $$
declare
  v_email   text := 'iamabdalhannan@gmail.com';
  v_orgname text := 'abu bakar spray center';
  v_user    uuid;
  v_org     uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(v_email));
  if v_user is null then
    raise exception 'No account with email %. Sign up in the app first, then run this again.', v_email;
  end if;

  -- profile
  insert into public.profiles (id, full_name, email)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', ''), u.email
  from auth.users u where u.id = v_user
  on conflict (id) do nothing;

  -- organization membership
  select org_id into v_org from public.memberships where user_id = v_user;
  if v_org is null then
    insert into public.organizations (name) values (v_orgname) returning id into v_org;
    insert into public.memberships (org_id, user_id, role) values (v_org, v_user, 'owner');
    perform public.seed_categories(v_org);
  end if;
end $$;

-- ---------------- products ----------------
do $$
declare
  v_email text := 'iamabdalhannan@gmail.com';   -- <== the email you sign in with
  v_org  uuid;
  v_before int;
begin
  select m.org_id into v_org
  from public.memberships m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(trim(v_email));
  if v_org is null then
    raise exception 'No organization found for %. Use the exact email you sign in with.', v_email;
  end if;
  raise notice 'Organization: % (%)', (select name from public.organizations where id = v_org), v_org;

  -- make sure the default categories exist
  perform public.seed_categories(v_org);

  create temp table _seed (
    company text, name text, name_ur text, category text,
    size numeric, unit public.pack_unit, ptype public.pack_type, min_stock numeric
  ) on commit drop;

  insert into _seed values
  -- ---------------- Bayer ----------------
  ('Bayer', 'Confidor 200 SL',        'کونفیڈور 200 ایس ایل',      'Insecticide', 200, 'ml', 'bottle', 10),
  ('Bayer', 'Confidor 200 SL',        'کونفیڈور 200 ایس ایل',      'Insecticide', 500, 'ml', 'bottle', 5),
  ('Bayer', 'Movento 240 SC',         'موونٹو 240 ایس سی',         'Insecticide', 200, 'ml', 'bottle', 5),
  ('Bayer', 'Belt 480 SC',            'بیلٹ 480 ایس سی',           'Insecticide', 100, 'ml', 'bottle', 5),
  ('Bayer', 'Calypso 480 SC',         'کیلیپسو 480 ایس سی',        'Insecticide', 200, 'ml', 'bottle', 5),
  ('Bayer', 'Decis 2.5 EC',           'ڈیسس 2.5 ای سی',            'Insecticide', 500, 'ml', 'bottle', 5),
  ('Bayer', 'Nativo 75 WG',           'نیٹیوو 75 ڈبلیو جی',        'Fungicide',   100, 'g',  'packet', 10),
  ('Bayer', 'Antracol 70 WP',         'انٹراکول 70 ڈبلیو پی',      'Fungicide',   500, 'g',  'packet', 10),
  ('Bayer', 'Folicur 250 EW',         'فولیکیور 250 ای ڈبلیو',     'Fungicide',   500, 'ml', 'bottle', 5),
  ('Bayer', 'Puma Super 75 EW',       'پوما سپر 75 ای ڈبلیو',      'Herbicide',   500, 'ml', 'bottle', 10),
  ('Bayer', 'Puma Super 75 EW',       'پوما سپر 75 ای ڈبلیو',      'Herbicide',   1,   'l',  'bottle', 5),
  ('Bayer', 'Atlantis 3.6 WG',        'اٹلانٹس 3.6 ڈبلیو جی',      'Herbicide',   160, 'g',  'packet', 10),
  ('Bayer', 'Sencor 70 WP',           'سینکور 70 ڈبلیو پی',        'Herbicide',   250, 'g',  'packet', 5),
  ('Bayer', 'Dekalb DK-6714 Corn',    'ڈیکالب ڈی کے 6714 مکئی',    'Seeds',       10,  'kg', 'bag',    5),

  -- ---------------- Syngenta ----------------
  ('Syngenta', 'Actara 25 WG',          'ایکٹارا 25 ڈبلیو جی',       'Insecticide', 50,  'g',  'packet', 10),
  ('Syngenta', 'Karate 2.5 EC',         'کراٹے 2.5 ای سی',           'Insecticide', 500, 'ml', 'bottle', 5),
  ('Syngenta', 'Karate 2.5 EC',         'کراٹے 2.5 ای سی',           'Insecticide', 1,   'l',  'bottle', 3),
  ('Syngenta', 'Proclaim 1.9 EC',       'پروکلیم 1.9 ای سی',         'Insecticide', 200, 'ml', 'bottle', 10),
  ('Syngenta', 'Proclaim 1.9 EC',       'پروکلیم 1.9 ای سی',         'Insecticide', 400, 'ml', 'bottle', 5),
  ('Syngenta', 'Polo 500 SC',           'پولو 500 ایس سی',           'Insecticide', 400, 'ml', 'bottle', 5),
  ('Syngenta', 'Match 050 EC',          'میچ 050 ای سی',             'Insecticide', 200, 'ml', 'bottle', 5),
  ('Syngenta', 'Virtako 40 WG',         'ورٹاکو 40 ڈبلیو جی',        'Insecticide', 60,  'g',  'packet', 5),
  ('Syngenta', 'Amistar Top 325 SC',    'امیسٹار ٹاپ 325 ایس سی',    'Fungicide',   200, 'ml', 'bottle', 5),
  ('Syngenta', 'Amistar Top 325 SC',    'امیسٹار ٹاپ 325 ایس سی',    'Fungicide',   500, 'ml', 'bottle', 3),
  ('Syngenta', 'Score 250 EC',          'اسکور 250 ای سی',           'Fungicide',   200, 'ml', 'bottle', 5),
  ('Syngenta', 'Ridomil Gold 68 WG',    'ریڈومل گولڈ 68 ڈبلیو جی',   'Fungicide',   500, 'g',  'packet', 5),
  ('Syngenta', 'Tilt 250 EC',           'ٹلٹ 250 ای سی',             'Fungicide',   200, 'ml', 'bottle', 5),
  ('Syngenta', 'Axial 100 EC',          'ایکسیل 100 ای سی',          'Herbicide',   400, 'ml', 'bottle', 5),
  ('Syngenta', 'Dual Gold 960 EC',      'ڈوئل گولڈ 960 ای سی',       'Herbicide',   400, 'ml', 'bottle', 5),
  ('Syngenta', 'Dual Gold 960 EC',      'ڈوئل گولڈ 960 ای سی',       'Herbicide',   800, 'ml', 'bottle', 5),
  ('Syngenta', 'Gramoxone 20 SL',       'گراموکسون 20 ایس ایل',      'Herbicide',   1,   'l',  'bottle', 5),
  ('Syngenta', 'Gramoxone 20 SL',       'گراموکسون 20 ایس ایل',      'Herbicide',   5,   'l',  'gallon', 2),
  ('Syngenta', 'Primextra Gold 720 SC', 'پرائمکسٹرا گولڈ 720 ایس سی', 'Herbicide',  800, 'ml', 'bottle', 5),
  ('Syngenta', 'Isabion',               'آئیسابیون',                 'Growth Regulator', 500, 'ml', 'bottle', 5),
  ('Syngenta', 'Isabion',               'آئیسابیون',                 'Growth Regulator', 1,   'l',  'bottle', 3),
  ('Syngenta', 'NK-8441 Corn',          'این کے 8441 مکئی',          'Seeds',       10,  'kg', 'bag',    5),

  -- ---------------- FMC ----------------
  ('FMC', 'Coragen 20 SC',    'کوراجن 20 ایس سی',     'Insecticide', 100, 'ml', 'bottle', 5),
  ('FMC', 'Steward 150 SC',   'اسٹیورڈ 150 ایس سی',   'Insecticide', 200, 'ml', 'bottle', 5),
  ('FMC', 'Talstar 10 EC',    'ٹالسٹار 10 ای سی',     'Insecticide', 500, 'ml', 'bottle', 5),
  ('FMC', 'Benevia 10 OD',    'بینیویا 10 او ڈی',     'Insecticide', 200, 'ml', 'bottle', 5),
  ('FMC', 'Furadan 3G',       'فیوراڈان 3 جی',        'Insecticide', 10,  'kg', 'bag',    5),
  ('FMC', 'Ferterra 0.4 GR',  'فرٹیرا 0.4 جی آر',     'Insecticide', 4,   'kg', 'bag',    5),

  -- ---------------- Corteva ----------------
  ('Corteva', 'Radiant 120 SC',      'ریڈیئنٹ 120 ایس سی',      'Insecticide', 200, 'ml', 'bottle', 5),
  ('Corteva', 'Tracer 240 SC',       'ٹریسر 240 ایس سی',        'Insecticide', 200, 'ml', 'bottle', 5),
  ('Corteva', 'Lorsban 40 EC',       'لارسبان 40 ای سی',        'Insecticide', 500, 'ml', 'bottle', 5),
  ('Corteva', 'Lorsban 40 EC',       'لارسبان 40 ای سی',        'Insecticide', 1,   'l',  'bottle', 5),
  ('Corteva', 'Transform 50 WG',     'ٹرانسفارم 50 ڈبلیو جی',   'Insecticide', 50,  'g',  'packet', 5),
  ('Corteva', 'Galant Super 108 EC', 'گیلنٹ سپر 108 ای سی',     'Herbicide',   400, 'ml', 'bottle', 5),
  ('Corteva', 'Pioneer 30Y87 Corn',  'پائینیر 30 وائی 87 مکئی', 'Seeds',       10,  'kg', 'bag',    5),
  ('Corteva', 'Pioneer P1543 Corn',  'پائینیر پی 1543 مکئی',    'Seeds',       10,  'kg', 'bag',    5),

  -- ---------------- BASF ----------------
  ('BASF', 'Regent 0.3 GR',     'ریجنٹ 0.3 جی آر',      'Insecticide', 5,   'kg', 'bag',    5),
  ('BASF', 'Cabrio Top 60 WG',  'کیبریو ٹاپ 60 ڈبلیو جی', 'Fungicide', 500, 'g',  'packet', 5),
  ('BASF', 'Stomp 455 CS',      'اسٹومپ 455 سی ایس',     'Herbicide',  1,   'l',  'bottle', 5),

  -- ---------------- UPL ----------------
  ('UPL', 'Ulala 50 WG',  'اولالا 50 ڈبلیو جی', 'Insecticide', 60,  'g', 'packet', 5),
  ('UPL', 'Saaf 75 WP',   'صاف 75 ڈبلیو پی',    'Fungicide',   500, 'g', 'packet', 5),

  -- ---------------- Generic actives (local brands vary) ----------------
  ('Generic', 'Emamectin Benzoate 1.9 EC',  'ایمامیکٹن بینزوایٹ 1.9 ای سی', 'Insecticide', 200, 'ml', 'bottle', 10),
  ('Generic', 'Emamectin Benzoate 1.9 EC',  'ایمامیکٹن بینزوایٹ 1.9 ای سی', 'Insecticide', 400, 'ml', 'bottle', 10),
  ('Generic', 'Imidacloprid 25 WP',         'امیڈاکلوپرڈ 25 ڈبلیو پی',     'Insecticide', 250, 'g',  'packet', 10),
  ('Generic', 'Acetamiprid 20 SP',          'ایسیٹامپرڈ 20 ایس پی',        'Insecticide', 100, 'g',  'packet', 10),
  ('Generic', 'Lambda Cyhalothrin 2.5 EC',  'لیمڈا سائہیلوتھرن 2.5 ای سی', 'Insecticide', 500, 'ml', 'bottle', 5),
  ('Generic', 'Bifenthrin 10 EC',           'بائفینتھرن 10 ای سی',         'Insecticide', 500, 'ml', 'bottle', 5),
  ('Generic', 'Chlorpyrifos 40 EC',         'کلورپائریفاس 40 ای سی',       'Insecticide', 1,   'l',  'bottle', 5),
  ('Generic', 'Chlorpyrifos 40 EC',         'کلورپائریفاس 40 ای سی',       'Insecticide', 5,   'l',  'gallon', 2),
  ('Generic', 'Glyphosate 48 SL',           'گلائفوسیٹ 48 ایس ایل',        'Herbicide',   1,   'l',  'bottle', 5),
  ('Generic', 'Glyphosate 48 SL',           'گلائفوسیٹ 48 ایس ایل',        'Herbicide',   3,   'l',  'gallon', 3),
  ('Generic', 'Glyphosate 48 SL',           'گلائفوسیٹ 48 ایس ایل',        'Herbicide',   5,   'l',  'gallon', 3),
  ('Generic', 'Glyphosate 48 SL',           'گلائفوسیٹ 48 ایس ایل',        'Herbicide',   15,  'l',  'gallon', 1),
  ('Generic', 'Pendimethalin 33 EC',        'پینڈی میتھالین 33 ای سی',     'Herbicide',   1,   'l',  'bottle', 5),
  ('Generic', 'Mancozeb 80 WP',             'مینکوزیب 80 ڈبلیو پی',        'Fungicide',   1,   'kg', 'packet', 10),
  ('Generic', 'Copper Oxychloride 50 WP',   'کاپر آکسی کلورائیڈ 50 ڈبلیو پی', 'Fungicide', 500, 'g', 'packet', 5),
  ('Generic', 'Sulphur 80 WDG',             'سلفر 80 ڈبلیو ڈی جی',         'Fungicide',   1,   'kg', 'packet', 5),
  ('Generic', 'Humic Acid 12% Liquid',      'ہیومک ایسڈ 12% مائع',         'Fertilizer',  1,   'l',  'bottle', 5),
  ('Generic', 'Humic Acid 12% Liquid',      'ہیومک ایسڈ 12% مائع',         'Fertilizer',  5,   'l',  'gallon', 3),
  ('Generic', 'Humic Acid 12% Liquid',      'ہیومک ایسڈ 12% مائع',         'Fertilizer',  15,  'l',  'gallon', 2),
  ('Generic', 'Boron 17%',                  'بوران 17%',                   'Micronutrient', 1, 'kg', 'packet', 10),

  -- ---------------- Fertilizers (50 kg bags) ----------------
  ('Fauji Fertilizer', 'Sona Urea',         'سونا یوریا',        'Fertilizer', 50, 'kg', 'bag', 20),
  ('Fauji Fertilizer', 'Sona DAP',          'سونا ڈی اے پی',     'Fertilizer', 50, 'kg', 'bag', 20),
  ('Fauji Fertilizer', 'Sona SOP (Potash)', 'سونا ایس او پی پوٹاش', 'Fertilizer', 50, 'kg', 'bag', 10),
  ('Engro Fertilizers', 'Engro Urea',       'اینگرو یوریا',      'Fertilizer', 50, 'kg', 'bag', 20),
  ('Engro Fertilizers', 'Engro DAP',        'اینگرو ڈی اے پی',   'Fertilizer', 50, 'kg', 'bag', 20),
  ('Engro Fertilizers', 'Zarkhez NPK',      'زرخیز این پی کے',   'Fertilizer', 50, 'kg', 'bag', 10),
  ('Engro Fertilizers', 'Zingro Zinc 33%',  'زنگرو زنک 33%',     'Micronutrient', 3, 'kg', 'packet', 10),
  ('Fatima Fertilizer', 'Sarsabz Urea',     'سرسبز یوریا',       'Fertilizer', 50, 'kg', 'bag', 20),
  ('Fatima Fertilizer', 'Sarsabz CAN',      'سرسبز کین',         'Fertilizer', 50, 'kg', 'bag', 10),
  ('Fatima Fertilizer', 'Sarsabz NP',       'سرسبز این پی',      'Fertilizer', 50, 'kg', 'bag', 10),

  -- ---------------- Seeds ----------------
  ('Punjab Seed Corporation', 'Wheat Akbar-2019',      'گندم اکبر 2019',       'Seeds', 50, 'kg', 'bag', 10),
  ('Punjab Seed Corporation', 'Wheat Dilkash-2020',    'گندم دلکش 2020',       'Seeds', 50, 'kg', 'bag', 10),
  ('Punjab Seed Corporation', 'Wheat Faisalabad-2008', 'گندم فیصل آباد 2008',  'Seeds', 50, 'kg', 'bag', 10),
  ('Punjab Seed Corporation', 'Rice Super Basmati',    'چاول سپر باسمتی',      'Seeds', 10, 'kg', 'bag', 5),
  ('Punjab Seed Corporation', 'Rice Kissan Basmati',   'چاول کسان باسمتی',     'Seeds', 10, 'kg', 'bag', 5);

  select count(*) into v_before from public.products where org_id = v_org;

  insert into public.companies (org_id, name)
  select distinct v_org, company from _seed
  on conflict do nothing;

  insert into public.products (org_id, name, name_ur, category_id, company_id, pack_size, pack_unit, pack_type, min_stock)
  select v_org, s.name, s.name_ur, c.id, co.id, s.size, s.unit, s.ptype, s.min_stock
  from _seed s
  join public.categories c on c.org_id = v_org and c.name = s.category
  join public.companies co on co.org_id = v_org and co.name = s.company
  on conflict do nothing;

  raise notice 'Added % products (total now %).',
    (select count(*) from public.products where org_id = v_org) - v_before,
    (select count(*) from public.products where org_id = v_org);
end $$;

-- ---------------- sample stock ----------------
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
-- Result
-- ---------------------------------------------------------------------
select u.email as signed_in_email,
       m.role,
       o.name  as organization,
       o.id    as org_id,
       (select count(*) from public.companies c where c.org_id = o.id)       as companies,
       (select count(*) from public.products p where p.org_id = o.id)        as products,
       (select count(*) from public.batches b where b.org_id = o.id)         as batches,
       (select count(*) from public.stock_movements s where s.org_id = o.id) as stock_entries
from auth.users u
join public.memberships m on m.user_id = u.id
join public.organizations o on o.id = m.org_id
where lower(u.email) = lower('iamabdalhannan@gmail.com');
