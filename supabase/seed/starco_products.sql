-- =====================================================================
-- Starco International · NET RATE LIST 01-SEP-2026
-- 157 products for organization 1bce58f6-5c65-41e8-93f3-bd3ebb0adaeb (company "Starco")
--
-- * "Net rate" is the dealer price (cash, taxes included), so it is saved as the
--   PURCHASE RATE. MRP (sale price) is left empty for you to set.
-- * Active ingredient and carton packing are in each product's note (searchable).
-- * Run in Supabase -> SQL Editor (after migration 005). Safe to run again:
--   no duplicates, and existing Starco products get their purchase rate updated.
-- =====================================================================
do $$
declare
  v_org uuid := '1bce58f6-5c65-41e8-93f3-bd3ebb0adaeb';
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    raise exception 'Organization % not found', v_org;
  end if;

  perform public.seed_categories(v_org);
  insert into public.categories (org_id, name, name_ur) values (v_org, 'Seed Treatment', 'بیج کی دوا')
  on conflict do nothing;
  insert into public.companies (org_id, name) values (v_org, 'Starco')
  on conflict do nothing;

  create temp table _rate (name text, category text, size numeric, unit public.pack_unit,
                           ptype public.pack_type, rate numeric, note text) on commit drop;
  insert into _rate values
  ('Abamectin 1.8% EC', 'Insecticide', 500, 'ml', 'bottle', 660, 'Starco net rate 01-Sep-2026 · SR 1 · Active: Abamectin 1.8% EC · Packing: 20 per carton'),
  ('Acephate 75% SP', 'Insecticide', 250, 'g', 'packet', 640, 'Starco net rate 01-Sep-2026 · SR 2 · Active: Acephate 75% SP · Packing: 20 per carton'),
  ('Acephate 75% SP', 'Insecticide', 400, 'g', 'packet', 990, 'Starco net rate 01-Sep-2026 · SR 3 · Active: Acephate 75% SP · Packing: 20 per carton'),
  ('Acetamiprid 20% SP', 'Insecticide', 250, 'g', 'packet', 460, 'Starco net rate 01-Sep-2026 · SR 4 · Active: Acetamiprid 20% SP · Packing: 20 per carton'),
  ('Alcon 20% SC', 'Insecticide', 80, 'ml', 'bottle', 580, 'Starco net rate 01-Sep-2026 · SR 5 · Active: Chlorantraniliprole 20% SC · Packing: 20 per carton'),
  ('Alligro 10% SC (Kanzo AG)', 'Insecticide', 150, 'ml', 'bottle', 625, 'Starco net rate 01-Sep-2026 · SR 6 · Active: Emamectin Benzoate + Lufenuron 10% SC · Packing: 20 per carton'),
  ('Bectal 1.9% EC', 'Insecticide', 200, 'ml', 'bottle', 365, 'Starco net rate 01-Sep-2026 · SR 7 · Active: Emamectin Benzoate 1.9% EC · Packing: 20 per carton'),
  ('Bectal 1.9% EC', 'Insecticide', 400, 'ml', 'bottle', 650, 'Starco net rate 01-Sep-2026 · SR 8 · Active: Emamectin Benzoate 1.9% EC · Packing: 20 per carton'),
  ('Bectal 1.9% EC', 'Insecticide', 1, 'l', 'bottle', 1475, 'Starco net rate 01-Sep-2026 · SR 9 · Active: Emamectin Benzoate 1.9% EC · Packing: 12 per carton'),
  ('Bectal 5% WDG', 'Insecticide', 150, 'g', 'packet', 580, 'Starco net rate 01-Sep-2026 · SR 10 · Active: Emamectin Benzoate 5% WDG · Packing: 30 per carton'),
  ('Bectal 5% WDG', 'Insecticide', 75, 'g', 'packet', 320, 'Starco net rate 01-Sep-2026 · SR 11 · Active: Emamectin Benzoate 5% WDG · Packing: 50 per carton'),
  ('Buprofezin 25% WP', 'Insecticide', 900, 'g', 'packet', 1150, 'Starco net rate 01-Sep-2026 · SR 12 · Active: Buprofezin 25% WP · Packing: 12 per carton'),
  ('Ceedo 20% SC', 'Insecticide', 100, 'ml', 'bottle', 250, 'Starco net rate 01-Sep-2026 · SR 13 · Active: Clothianidin 20% SC · Packing: 20 per carton'),
  ('Ceedo 20% SC', 'Insecticide', 150, 'ml', 'bottle', 360, 'Starco net rate 01-Sep-2026 · SR 14 · Active: Clothianidin 20% SC · Packing: 20 per carton'),
  ('Chlorfenapyr 36% SC', 'Insecticide', 200, 'ml', 'bottle', 1190, 'Starco net rate 01-Sep-2026 · SR 15 · Active: Chlorfenapyr 36% SC · Packing: 20 per carton'),
  ('Contest 70% WS (Kanzo AG)', 'Insecticide', 50, 'g', 'packet', 350, 'Starco net rate 01-Sep-2026 · SR 16 · Active: Thiamethoxam 70% WS · Packing: 20 per carton'),
  ('Cypermethrin 10% EC', 'Insecticide', 800, 'ml', 'bottle', 950, 'Starco net rate 01-Sep-2026 · SR 17 · Active: Cypermethrin 10% EC · Packing: 12 per carton'),
  ('Diafenthiuron 50% SC', 'Insecticide', 400, 'ml', 'bottle', 1520, 'Starco net rate 01-Sep-2026 · SR 18 · Active: Diafenthiuron 50% SC · Packing: 20 per carton'),
  ('Dimethoate 40% EC', 'Insecticide', 400, 'ml', 'bottle', 780, 'Starco net rate 01-Sep-2026 · SR 19 · Active: Dimethoate 40% EC · Packing: 20 per carton'),
  ('Dinotefuran 20% SG', 'Insecticide', 100, 'g', 'packet', 375, 'Starco net rate 01-Sep-2026 · SR 20 · Active: Dinotefuran 20% SG · Packing: 50 per carton'),
  ('Da Sheng 10% SC', 'Insecticide', 180, 'ml', 'bottle', 850, 'Starco net rate 01-Sep-2026 · SR 21 · Active: Chlorantraniliprole + Lufenuron 10% SC · Packing: 50 per carton'),
  ('Feedclo 40% EC', 'Insecticide', 250, 'ml', 'bottle', 490, 'Starco net rate 01-Sep-2026 · SR 22 · Active: Chlorpyrifos 40% EC · Packing: 20 per carton'),
  ('Feedclo 40% EC', 'Insecticide', 1, 'l', 'bottle', 1550, 'Starco net rate 01-Sep-2026 · SR 23 · Active: Chlorpyrifos 40% EC · Packing: 12 per carton'),
  ('Fentore 5% SC', 'Insecticide', 480, 'ml', 'bottle', 790, 'Starco net rate 01-Sep-2026 · SR 24 · Active: Fipronil 5% SC · Packing: 20 per carton'),
  ('Fenmol 10% EC', 'Insecticide', 500, 'ml', 'bottle', 815, 'Starco net rate 01-Sep-2026 · SR 25 · Active: Bifenthrin 10% EC · Packing: 20 per carton'),
  ('Fenmol 10% EC', 'Insecticide', 1, 'l', 'bottle', 1575, 'Starco net rate 01-Sep-2026 · SR 26 · Active: Bifenthrin 10% EC · Packing: 12 per carton'),
  ('Fipronil 80% WDG', 'Insecticide', 30, 'g', 'packet', 850, 'Starco net rate 01-Sep-2026 · SR 27 · Active: Fipronil 80% WDG · Packing: 50 per carton'),
  ('Leera 80% WDG', 'Insecticide', 150, 'g', 'packet', 1160, 'Starco net rate 01-Sep-2026 · SR 28 · Active: Diafenthiuron 80% WDG · Packing: 20 per carton'),
  ('Lijing 60% WG', 'Insecticide', 100, 'g', 'packet', 980, 'Starco net rate 01-Sep-2026 · SR 29 · Active: Pymetrozine 40% + Dinotefuran 20% · Packing: 50 per carton'),
  ('Imidacloprid 25% WP', 'Insecticide', 200, 'g', 'packet', 425, 'Starco net rate 01-Sep-2026 · SR 30 · Active: Imidacloprid 25% WP · Packing: 20 per carton'),
  ('Jet-50', 'Insecticide', 120, 'g', 'packet', 1550, 'Starco net rate 01-Sep-2026 · SR 31 · Active: Flonicamid 50% WDG · Packing: 20 per carton'),
  ('Karant 2.5% EC', 'Insecticide', 250, 'ml', 'bottle', 300, 'Starco net rate 01-Sep-2026 · SR 32 · Active: Lambda Cyhalothrin 2.5% EC · Packing: 20 per carton'),
  ('Karant 2.5% EC', 'Insecticide', 500, 'ml', 'bottle', 500, 'Starco net rate 01-Sep-2026 · SR 33 · Active: Lambda Cyhalothrin 2.5% EC · Packing: 20 per carton'),
  ('Karant 2.5% EC', 'Insecticide', 1, 'l', 'bottle', 950, 'Starco net rate 01-Sep-2026 · SR 34 · Active: Lambda Cyhalothrin 2.5% EC · Packing: 12 per carton'),
  ('Karant 10% WDG', 'Insecticide', 160, 'g', 'packet', 650, 'Starco net rate 01-Sep-2026 · SR 35 · Active: Lambda Cyhalothrin 10% WDG · Packing: 20 per carton'),
  ('Nitenpyram 50% WDG', 'Insecticide', 50, 'g', 'packet', 450, 'Starco net rate 01-Sep-2026 · SR 36 · Active: Nitenpyram 50% WDG · Packing: 50 per carton'),
  ('Pattren 10% WDG', 'Insecticide', 350, 'g', 'packet', 650, 'Starco net rate 01-Sep-2026 · SR 37 · Active: Chlorfenapyr 10% WDG · Packing: 20 per carton'),
  ('Pillar 3% SC', 'Insecticide', 400, 'ml', 'bottle', 490, 'Starco net rate 01-Sep-2026 · SR 38 · Active: Emamectin + Lufenuron 3% SC · Packing: 20 per carton'),
  ('Pillar 3% SC', 'Insecticide', 1, 'l', 'bottle', 1200, 'Starco net rate 01-Sep-2026 · SR 39 · Active: Emamectin + Lufenuron 3% SC · Packing: 12 per carton'),
  ('Pyriproxyfen 10.8% EC', 'Insecticide', 500, 'ml', 'bottle', 820, 'Starco net rate 01-Sep-2026 · SR 40 · Active: Pyriproxyfen 10.8% EC · Packing: 20 per carton'),
  ('Rexicon 11.6% SC', 'Insecticide', 100, 'ml', 'bottle', 599, 'Starco net rate 01-Sep-2026 · SR 41 · Active: Emamectin + Chlorantraniliprole 11.6% SC · Packing: 20 per carton'),
  ('Roodosh 5% EC', 'Insecticide', 200, 'ml', 'bottle', 325, 'Starco net rate 01-Sep-2026 · SR 42 · Active: Lufenuron 5% EC · Packing: 20 per carton'),
  ('Roodosh 5% EC', 'Insecticide', 400, 'ml', 'bottle', 575, 'Starco net rate 01-Sep-2026 · SR 43 · Active: Lufenuron 5% EC · Packing: 20 per carton'),
  ('Roodosh 5% EC', 'Insecticide', 1, 'l', 'bottle', 1300, 'Starco net rate 01-Sep-2026 · SR 44 · Active: Lufenuron 5% EC · Packing: 12 per carton'),
  ('Shiding 21% EC', 'Insecticide', 800, 'ml', 'bottle', 1250, 'Starco net rate 01-Sep-2026 · SR 45 · Active: Lambda Cyhalothrin + Triazophos 21% EC · Packing: 12 per carton'),
  ('To Go 30% SC', 'Insecticide', 50, 'ml', 'bottle', 850, 'Starco net rate 01-Sep-2026 · SR 46 · Active: Chlorantraniliprole + Methoxyfenozide 30% SC · Packing: 40 per carton'),
  ('Triazophos 40% EC', 'Insecticide', 1, 'l', 'bottle', 2250, 'Starco net rate 01-Sep-2026 · SR 47 · Active: Triazophos 40% EC · Packing: 12 per carton'),
  ('Trigel 25% WG', 'Insecticide', 72, 'g', 'packet', 285, 'Starco net rate 01-Sep-2026 · SR 48 · Active: Thiamethoxam 25% WG · Packing: 40 per carton'),
  ('Yupu 45% WG', 'Insecticide', 40, 'g', 'packet', 650, 'Starco net rate 01-Sep-2026 · SR 49 · Active: Emamectin 5% + Lufenuron 40% · Packing: 20 per carton'),
  ('Valor 12% SC', 'Insecticide', 500, 'ml', 'bottle', 950, 'Starco net rate 01-Sep-2026 · SR 50 · Active: Abamectin + Thiamethoxam 12% SC · Packing: 20 per carton'),
  ('Xerox Super', 'Insecticide', 800, 'ml', 'bottle', 1360, 'Starco net rate 01-Sep-2026 · SR 51 · Active: Abamectin + Triazophos 20% EC · Packing: 12 per carton'),
  ('Chisel 36% WP', 'Fungicide', 1, 'kg', 'packet', 1480, 'Starco net rate 01-Sep-2026 · SR 53 · Active: Cymoxanil + Chlorothalonil 36% WP · Packing: 10 per carton'),
  ('Cymoxanil + Mancozeb 72% WP', 'Fungicide', 600, 'g', 'packet', 1180, 'Starco net rate 01-Sep-2026 · SR 54 · Active: Cymoxanil + Mancozeb 72% WP · Packing: 15 per carton'),
  ('Dimethomorph + Mancozeb 50% WP', 'Fungicide', 1, 'kg', 'packet', 1650, 'Starco net rate 01-Sep-2026 · SR 55 · Active: Dimethomorph + Mancozeb 50% WP · Packing: 10 per carton'),
  ('Finer 50% SC', 'Fungicide', 120, 'ml', 'bottle', 750, 'Starco net rate 01-Sep-2026 · SR 56 · Active: Azoxystrobin + Tebuconazole 50% SC · Packing: 20 per carton'),
  ('Fosetyl Aluminium 80% SP', 'Fungicide', 250, 'g', 'packet', 425, 'Starco net rate 01-Sep-2026 · SR 57 · Active: Fosetyl Aluminium 80% SP · Packing: 20 per carton'),
  ('Fosetyl Aluminium 80% SP', 'Fungicide', 1, 'kg', 'packet', 1500, 'Starco net rate 01-Sep-2026 · SR 58 · Active: Fosetyl Aluminium 80% SP · Packing: 10 per carton'),
  ('Metalaxyl + Mancozeb 72% WP', 'Fungicide', 250, 'g', 'packet', 500, 'Starco net rate 01-Sep-2026 · SR 59 · Active: Metalaxyl + Mancozeb 72% WP · Packing: 20 per carton'),
  ('Metalaxyl + Mancozeb 72% WP', 'Fungicide', 1, 'kg', 'packet', 1825, 'Starco net rate 01-Sep-2026 · SR 60 · Active: Metalaxyl + Mancozeb 72% WP · Packing: 10 per carton'),
  ('Paston 50% SC', 'Fungicide', 250, 'ml', 'bottle', 750, 'Starco net rate 01-Sep-2026 · SR 61 · Active: Sulphur 35% + Chlorothalonil 15% · Packing: 20 per carton'),
  ('Pivot 18.7% WG', 'Fungicide', 250, 'g', 'packet', 750, 'Starco net rate 01-Sep-2026 · SR 62 · Active: Pyraclostrobin + Dimethomorph 18.7% WG · Packing: 30 per carton'),
  ('Pivot 18.7% WG', 'Fungicide', 1, 'kg', 'packet', 2250, 'Starco net rate 01-Sep-2026 · SR 63 · Active: Pyraclostrobin + Dimethomorph 18.7% WG · Packing: 15 per carton'),
  ('Copstar 47% WP', 'Fungicide', 250, 'g', 'packet', 840, 'Starco net rate 01-Sep-2026 · SR 64 · Active: Kasugamycin + Copper Oxychloride 47% WP · Packing: 20 per carton'),
  ('Pyrazole 45% WP', 'Fungicide', 100, 'g', 'packet', 425, 'Starco net rate 01-Sep-2026 · SR 65 · Active: Pyraclostrobin + Tebuconazole 45% WP · Packing: 50 per carton'),
  ('Recado 32.5% SC', 'Fungicide', 200, 'ml', 'bottle', 850, 'Starco net rate 01-Sep-2026 · SR 66 · Active: Azoxystrobin + Difenoconazole · Packing: 20 per carton'),
  ('Maidian 56% SC', 'Fungicide', 250, 'ml', 'bottle', 575, 'Starco net rate 01-Sep-2026 · SR 67 · Active: Azoxystrobin + Chlorothalonil 56% SC · Packing: 20 per carton'),
  ('Safeer 80% WG', 'Fungicide', 25, 'kg', 'bag', 18750, 'Starco net rate 01-Sep-2026 · SR 68 · Active: Sulphur 80% WG · Packing: 1 per carton'),
  ('Safeer 80% WG', 'Fungicide', 10, 'kg', 'bag', 7500, 'Starco net rate 01-Sep-2026 · SR 69 · Active: Sulphur 80% WG · Packing: 1 per carton'),
  ('Safeer 80% WG', 'Fungicide', 2, 'kg', 'packet', 1550, 'Starco net rate 01-Sep-2026 · SR 70 · Active: Sulphur 80% WG · Packing: 8 per carton'),
  ('Safeer 80% WG', 'Fungicide', 1, 'kg', 'packet', 800, 'Starco net rate 01-Sep-2026 · SR 71 · Active: Sulphur 80% WG · Packing: 12 per carton'),
  ('Success 72% WP', 'Fungicide', 1, 'kg', 'packet', 2250, 'Starco net rate 01-Sep-2026 · SR 72 · Active: Chlorothalonil 64% + Metalaxyl 8% · Packing: 8 per carton'),
  ('Thiophanate Methyl 70% WP', 'Fungicide', 400, 'g', 'packet', 775, 'Starco net rate 01-Sep-2026 · SR 73 · Active: Thiophanate Methyl 70% WP · Packing: 20 per carton'),
  ('Trichlorfon 80% SP', 'Insecticide', 250, 'g', 'packet', 725, 'Starco net rate 01-Sep-2026 · SR 74 · Active: Trichlorfon 80% SP · Packing: 20 per carton'),
  ('Acetochlor 50% EC', 'Herbicide', 100, 'ml', 'bottle', 210, 'Starco net rate 01-Sep-2026 · SR 76 · Active: Acetochlor 50% EC · Packing: 70 per carton'),
  ('Acetochlor 50% EC', 'Herbicide', 1, 'l', 'bottle', 1150, 'Starco net rate 01-Sep-2026 · SR 77 · Active: Acetochlor 50% EC · Packing: 12 per carton'),
  ('Acord 10% WP', 'Herbicide', 100, 'g', 'packet', 400, 'Starco net rate 01-Sep-2026 · SR 78 · Active: Pyrazosulfuron-ethyl 10% WP · Packing: 12 per carton'),
  ('Bromoxynil + MCPA 40% EC', 'Herbicide', 400, 'ml', 'bottle', 775, 'Starco net rate 01-Sep-2026 · SR 79 · Active: Bromoxynil + MCPA 40% EC · Packing: 20 per carton'),
  ('Bromoxynil + MCPA 40% EC', 'Herbicide', 800, 'ml', 'bottle', 1380, 'Starco net rate 01-Sep-2026 · SR 80 · Active: Bromoxynil + MCPA 40% EC · Packing: 12 per carton'),
  ('Banca 30% WDG', 'Herbicide', 100, 'g', 'packet', 699, 'Starco net rate 01-Sep-2026 · SR 81 · Active: Bispyribac Sodium + Bensulfuron 30% WDG · Packing: 20 per carton'),
  ('Butachlor 60% EC', 'Herbicide', 800, 'ml', 'bottle', 975, 'Starco net rate 01-Sep-2026 · SR 82 · Active: Butachlor 60% EC · Packing: 12 per carton'),
  ('Dhawa 55% SC', 'Herbicide', 1, 'l', 'bottle', 1300, 'Starco net rate 01-Sep-2026 · SR 83 · Active: Mesotrione + Atrazine 55% SC · Packing: 12 per carton'),
  ('Dubaltic', 'Herbicide', 600, 'ml', 'bottle', 2050, 'Starco net rate 01-Sep-2026 · SR 84 · Active: (Rimsulfuron 2.5% + Quizalofop-p-ethyl 8.5%) + Bentazone 48% SL · Packing: 10 per carton'),
  ('Dormal 75% WDG', 'Herbicide', 20, 'g', 'packet', 700, 'Starco net rate 01-Sep-2026 · SR 85 · Active: Halosulfuron Methyl 75% WG · Packing: 80 per carton'),
  ('Full Control 50% WP', 'Herbicide', 500, 'g', 'packet', 975, 'Starco net rate 01-Sep-2026 · SR 86 · Active: Mesotrione + Atrazine 50% WP · Packing: 20 per carton'),
  ('Full Control 50% WP', 'Herbicide', 1, 'kg', 'packet', 1775, 'Starco net rate 01-Sep-2026 · SR 87 · Active: Mesotrione + Atrazine 50% WP · Packing: 10 per carton'),
  ('Full Clear 50% EC', 'Herbicide', 800, 'ml', 'bottle', 1660, 'Starco net rate 01-Sep-2026 · SR 88 · Active: Oxyfluorfen 4.76% + Metolachlor 28.57% + Pendimethalin 14.28% · Packing: 12 per carton'),
  ('Gazonner 15% EC', 'Herbicide', 400, 'ml', 'bottle', 960, 'Starco net rate 01-Sep-2026 · SR 89 · Active: Quizalofop-p-ethyl 15% EC · Packing: 20 per carton'),
  ('Gazonner 15% EC', 'Herbicide', 500, 'ml', 'bottle', 1200, 'Starco net rate 01-Sep-2026 · SR 90 · Active: Quizalofop-p-ethyl 15% EC · Packing: 20 per carton'),
  ('Atrazine 38% SC', 'Herbicide', 500, 'ml', 'bottle', 560, 'Starco net rate 01-Sep-2026 · SR 91 · Active: Atrazine 38% SC · Packing: 20 per carton'),
  ('Goulati 20% SL', 'Herbicide', 1, 'l', 'bottle', 1150, 'Starco net rate 01-Sep-2026 · SR 92 · Active: Paraquat 20% SL · Packing: 12 per carton'),
  ('Jhurloo 48% SL', 'Herbicide', 1, 'l', 'bottle', 1050, 'Starco net rate 01-Sep-2026 · SR 93 · Active: Glyphosate 48% SL · Packing: 12 per carton'),
  ('Manyu 27% FS', 'Seed Treatment', 70, 'ml', 'bottle', 475, 'Starco net rate 01-Sep-2026 · SR 94 · Active: Difenoconazole 2.2% + Fludioxonil 2.2% + Thiamethoxam 22.6% · Packing: 20 per carton'),
  ('Meta Fin Super 28.6% WDG', 'Herbicide', 14, 'g', 'packet', 160, 'Starco net rate 01-Sep-2026 · SR 95 · Active: Meta Fin Super 28.6% WDG · Packing: 20 per carton'),
  ('Pendimethalin 33% EC', 'Herbicide', 1, 'l', 'bottle', 1350, 'Starco net rate 01-Sep-2026 · SR 96 · Active: Pendimethalin 33% EC · Packing: 12 per carton'),
  ('Ridge 30% SC', 'Herbicide', 35, 'ml', 'bottle', 850, 'Starco net rate 01-Sep-2026 · SR 97 · Active: Topramezone 30% SC · Packing: 40 per carton'),
  ('S-Metolachlor 96% EC', 'Herbicide', 800, 'ml', 'bottle', 1900, 'Starco net rate 01-Sep-2026 · SR 98 · Active: S-Metolachlor 96% EC · Packing: 12 per carton'),
  ('Sulfosulfuron 75% WG (with 500 ml adjuvant)', 'Herbicide', 13.5, 'g', 'packet', 650, 'Starco net rate 01-Sep-2026 · SR 99 · Active: Sulfosulfuron 75% WG (with 500 ml adjuvant) · Packing: 20 per carton'),
  ('Tri Ultra 25% OD', 'Herbicide', 360, 'ml', 'bottle', 950, 'Starco net rate 01-Sep-2026 · SR 100 · Active: Tri Ultra 25% OD · Packing: 20 per carton'),
  ('Walter Super 48% SC', 'Herbicide', 350, 'ml', 'bottle', 650, 'Starco net rate 01-Sep-2026 · SR 101 · Active: Walter Super 48% SC · Packing: 20 per carton'),
  ('Strength 42% EC', 'Herbicide', 800, 'ml', 'bottle', 1290, 'Starco net rate 01-Sep-2026 · SR 102 · Active: Pendimethalin + Acetochlor 42% EC · Packing: 12 per carton'),
  ('Yi Nong Le 20% WP', 'Herbicide', 350, 'g', 'packet', 850, 'Starco net rate 01-Sep-2026 · SR 103 · Active: Bensulfuron + Acetochlor 20% WP · Packing: 12 per carton'),
  ('Alcon 0.4% G (Kanzo AG)', 'Insecticide', 4, 'kg', 'bag', 800, 'Starco net rate 01-Sep-2026 · SR 105 · Active: Chlorantraniliprole 0.4% G · Packing: 4 per carton'),
  ('Fentral 1.6% GR', 'Insecticide', 6, 'kg', 'bag', 1250, 'Starco net rate 01-Sep-2026 · SR 106 · Active: Chlorantraniliprole + Clothianidin 1.6% GR · Packing: 3 per carton'),
  ('Cartap 4% G', 'Insecticide', 9, 'kg', 'bag', 2550, 'Starco net rate 01-Sep-2026 · SR 107 · Active: Cartap 4% G · Packing: 2 per carton'),
  ('Furex Plus 1.6% GR', 'Insecticide', 6, 'kg', 'bag', 1250, 'Starco net rate 01-Sep-2026 · SR 108 · Active: Chlorantraniliprole + Clothianidin 1.6% GR · Packing: 3 per carton'),
  ('Gladiator 0.35% GR', 'Insecticide', 8, 'kg', 'bag', 1250, 'Starco net rate 01-Sep-2026 · SR 109 · Active: Fipronil 0.3% + Emamectin Benzoate 0.05% · Packing: 2 per carton'),
  ('Monomehypo 5% GR', 'Insecticide', 7, 'kg', 'bag', 1100, 'Starco net rate 01-Sep-2026 · SR 110 · Active: Monomehypo 5% GR · Packing: 3 per carton'),
  ('Spectral 0.69% G', 'Insecticide', 7, 'kg', 'bag', 999, 'Starco net rate 01-Sep-2026 · SR 111 · Active: Chlorantraniliprole + Thiamethoxam 0.69% G · Packing: 3 per carton'),
  ('Bandhu 5% W/V', 'Micronutrient', 500, 'ml', 'bottle', 350, 'Starco net rate 01-Sep-2026 · SR 113 · Active: Boron 5% W/V · Packing: 20 per carton'),
  ('Bandhu 5% W/V', 'Micronutrient', 1, 'l', 'bottle', 650, 'Starco net rate 01-Sep-2026 · SR 114 · Active: Boron 5% W/V · Packing: 12 per carton'),
  ('Barlas (Bio Stimulant)', 'Growth Regulator', 500, 'ml', 'bottle', 625, 'Starco net rate 01-Sep-2026 · SR 115 · Active: Barlas (Bio Stimulant) · Packing: 20 per carton'),
  ('Barlas (Bio Stimulant)', 'Growth Regulator', 1, 'l', 'bottle', 1200, 'Starco net rate 01-Sep-2026 · SR 116 · Active: Barlas (Bio Stimulant) · Packing: 12 per carton'),
  ('Barlas (Bio Stimulant)', 'Growth Regulator', 20, 'l', 'can', 23000, 'Starco net rate 01-Sep-2026 · SR 117 · Active: Barlas (Bio Stimulant) · Packing: can'),
  ('Chunari 10% W/W', 'Micronutrient', 5, 'kg', 'bag', 1440, 'Starco net rate 01-Sep-2026 · SR 118 · Active: Crop supplement: Zinc 7% + Fe 2% + Cu 1% · Packing: 3 per carton'),
  ('Chunari 10% W/W', 'Micronutrient', 4, 'kg', 'bag', 1150, 'Starco net rate 01-Sep-2026 · SR 119 · Active: Crop supplement: Zinc 7% + Fe 2% + Cu 1% · Packing: 4 per carton'),
  ('Fojiko 13.5% W/V', 'Fertilizer', 200, 'l', 'drum', 29500, 'Starco net rate 01-Sep-2026 · SR 120 · Active: Humic Acid 10 + 3.5% W/V · Packing: drum'),
  ('Fojiko 13.5% W/V', 'Fertilizer', 20, 'l', 'can', 2990, 'Starco net rate 01-Sep-2026 · SR 121 · Active: Humic Acid 10 + 3.5% W/V · Packing: can'),
  ('Fojiko 13.5% W/V', 'Fertilizer', 10, 'l', 'can', 1600, 'Starco net rate 01-Sep-2026 · SR 122 · Active: Humic Acid 10 + 3.5% W/V · Packing: can'),
  ('Fojiko 13.5% W/V', 'Fertilizer', 5, 'l', 'can', 950, 'Starco net rate 01-Sep-2026 · SR 123 · Active: Humic Acid 10 + 3.5% W/V · Packing: can'),
  ('Fellas 30% W/V', 'Fertilizer', 200, 'l', 'drum', 110000, 'Starco net rate 01-Sep-2026 · SR 124 · Active: NPK 10:10:10 · Packing: drum'),
  ('Fellas 30% W/V', 'Fertilizer', 5, 'l', 'can', 3300, 'Starco net rate 01-Sep-2026 · SR 125 · Active: NPK 10:10:10 · Packing: can'),
  ('Lassa 8:8:6', 'Fertilizer', 500, 'ml', 'bottle', 350, 'Starco net rate 01-Sep-2026 · SR 126 · Active: NPK 8:8:6 · Packing: 20 per carton'),
  ('Lassa 8:8:6', 'Fertilizer', 1, 'l', 'bottle', 675, 'Starco net rate 01-Sep-2026 · SR 127 · Active: NPK 8:8:6 · Packing: 12 per carton'),
  ('Lekophos 20% W/V', 'Fertilizer', 200, 'l', 'drum', 105000, 'Starco net rate 01-Sep-2026 · SR 128 · Active: Phosphorus 20% W/V · Packing: drum'),
  ('Lekophos 20% W/V', 'Fertilizer', 20, 'l', 'can', 10500, 'Starco net rate 01-Sep-2026 · SR 129 · Active: Phosphorus 20% W/V · Packing: can'),
  ('Lekophos 20% W/V', 'Fertilizer', 10, 'l', 'can', 5500, 'Starco net rate 01-Sep-2026 · SR 130 · Active: Phosphorus 20% W/V · Packing: can'),
  ('Lekophos 20% W/V', 'Fertilizer', 5, 'l', 'can', 2900, 'Starco net rate 01-Sep-2026 · SR 131 · Active: Phosphorus 20% W/V · Packing: can'),
  ('Nolan 20% W/V', 'Fertilizer', 200, 'l', 'drum', 62500, 'Starco net rate 01-Sep-2026 · SR 132 · Active: Nitrogen 20% W/V · Packing: drum'),
  ('Nolan 20% W/V', 'Fertilizer', 20, 'l', 'can', 6500, 'Starco net rate 01-Sep-2026 · SR 133 · Active: Nitrogen 20% W/V · Packing: can'),
  ('Nolan 20% W/V', 'Fertilizer', 10, 'l', 'can', 3500, 'Starco net rate 01-Sep-2026 · SR 134 · Active: Nitrogen 20% W/V · Packing: can'),
  ('Nolan 20% W/V', 'Fertilizer', 5, 'l', 'can', 1850, 'Starco net rate 01-Sep-2026 · SR 135 · Active: Nitrogen 20% W/V · Packing: 4 per carton'),
  ('NPK 15:17:17', 'Fertilizer', 25, 'kg', 'bag', 12500, 'Starco net rate 01-Sep-2026 · SR 136 · Active: NPK 15:17:17 · Packing: bag'),
  ('NPK 15:17:17', 'Fertilizer', 1, 'kg', 'packet', 650, 'Starco net rate 01-Sep-2026 · SR 137 · Active: NPK 15:17:17 · Packing: 10 per carton'),
  ('Palab 30% W/V', 'Fertilizer', 200, 'l', 'drum', 95000, 'Starco net rate 01-Sep-2026 · SR 138 · Active: Potash 30% W/V · Packing: drum'),
  ('Palab 30% W/V', 'Fertilizer', 20, 'l', 'can', 9750, 'Starco net rate 01-Sep-2026 · SR 139 · Active: Potash 30% W/V · Packing: can'),
  ('Palab 30% W/V', 'Fertilizer', 10, 'l', 'can', 5000, 'Starco net rate 01-Sep-2026 · SR 140 · Active: Potash 30% W/V · Packing: can'),
  ('Palab 30% W/V', 'Fertilizer', 5, 'l', 'can', 2500, 'Starco net rate 01-Sep-2026 · SR 141 · Active: Potash 30% W/V · Packing: can'),
  ('Palab 30% W/V (Low pH)', 'Fertilizer', 1, 'l', 'bottle', 925, 'Starco net rate 01-Sep-2026 · SR 142 · Active: Potash 30% W/V (low pH) · Packing: 12 per carton'),
  ('Shandy 40+7% W/W', 'Fertilizer', 8, 'kg', 'bag', 1900, 'Starco net rate 01-Sep-2026 · SR 143 · Active: Humic Acid 40 + 7% W/W · Packing: bag'),
  ('Singhar', 'Micronutrient', 1, 'kg', 'packet', 425, 'Starco net rate 01-Sep-2026 · SR 144 · Active: Plant nutrient · Packing: 15 per carton'),
  ('Singhar', 'Micronutrient', 10, 'kg', 'bag', 3050, 'Starco net rate 01-Sep-2026 · SR 145 · Active: Plant nutrient · Packing: bag'),
  ('Skoging 25% W/W', 'Fertilizer', 25, 'kg', 'bag', 1750, 'Starco net rate 01-Sep-2026 · SR 146 · Active: Organic Matter 25% W/W · Packing: bag'),
  ('Vamica 21% W/W', 'Micronutrient', 4, 'kg', 'bag', null, 'Starco net rate 01-Sep-2026 · SR 147 · Active: Zinc 21% W/W · Packing: 4 per carton'),
  ('Zamda 10% W/V', 'Micronutrient', 200, 'l', 'drum', 49000, 'Starco net rate 01-Sep-2026 · SR 148 · Active: Zinc 10% W/V · Packing: drum'),
  ('Zamda 10% W/V', 'Micronutrient', 20, 'l', 'can', 4950, 'Starco net rate 01-Sep-2026 · SR 149 · Active: Zinc 10% W/V · Packing: can'),
  ('Zamda 10% W/V', 'Micronutrient', 5, 'l', 'can', 1500, 'Starco net rate 01-Sep-2026 · SR 150 · Active: Zinc 10% W/V · Packing: can'),
  ('Ammonium Sulphate', 'Fertilizer', 50, 'kg', 'bag', null, 'Starco net rate 01-Sep-2026 · SR 152 · Active: Ammonium Sulphate · Packing: bag'),
  ('MAP 12-61', 'Fertilizer', 25, 'kg', 'bag', null, 'Starco net rate 01-Sep-2026 · SR 153 · Active: Mono Ammonium Phosphate 12-61-0 · Packing: bag'),
  ('MAP 12-61', 'Fertilizer', 10, 'kg', 'bag', null, 'Starco net rate 01-Sep-2026 · SR 154 · Active: Mono Ammonium Phosphate 12-61-0 · Packing: bag'),
  ('Nitro Potash 13-0-44', 'Fertilizer', 25, 'kg', 'bag', null, 'Starco net rate 01-Sep-2026 · SR 155 · Active: Potassium Nitrate 13-0-44 · Packing: bag'),
  ('SOP 50%', 'Fertilizer', 25, 'kg', 'bag', 10500, 'Starco net rate 01-Sep-2026 · SR 156 · Active: Sulphate of Potash 50% · Packing: bag'),
  ('SOP 50%', 'Fertilizer', 10, 'kg', 'bag', 4250, 'Starco net rate 01-Sep-2026 · SR 157 · Active: Sulphate of Potash 50% · Packing: bag'),
  ('SOP 50% Granular', 'Fertilizer', 25, 'kg', 'bag', 10800, 'Starco net rate 01-Sep-2026 · SR 158 · Active: Sulphate of Potash 50% granular · Packing: bag'),
  ('SOP 50% Granular', 'Fertilizer', 10, 'kg', 'bag', 4350, 'Starco net rate 01-Sep-2026 · SR 159 · Active: Sulphate of Potash 50% granular · Packing: bag'),
  ('Sulphur Bentonite 90% W/W', 'Fertilizer', 10, 'kg', 'bag', null, 'Starco net rate 01-Sep-2026 · SR 160 · Active: Sulphur Bentonite 90% W/W · Packing: bag'),
  ('Urea Phosphate 17-44', 'Fertilizer', 10, 'kg', 'bag', 6500, 'Starco net rate 01-Sep-2026 · SR 161 · Active: NP 17-44 · Packing: bag'),
  ('Urea Phosphate 17-44', 'Fertilizer', 25, 'kg', 'bag', 16500, 'Starco net rate 01-Sep-2026 · SR 162 · Active: NP 17-44 · Packing: bag');

  -- new products
  insert into public.products (org_id, name, category_id, company_id, pack_size, pack_unit, pack_type, purchase_price, notes)
  select v_org, r.name, c.id, co.id, r.size, r.unit, r.ptype, coalesce(r.rate, 0), r.note
  from _rate r
  join public.categories c on c.org_id = v_org and c.name = r.category
  join public.companies co on co.org_id = v_org and co.name = 'Starco'
  on conflict do nothing;

  -- products that already existed: bring the purchase rate up to this list
  update public.products p
     set purchase_price = r.rate
    from _rate r, public.companies co
   where co.org_id = v_org and co.name = 'Starco' and p.company_id = co.id and p.org_id = v_org
     and lower(trim(p.name)) = lower(trim(r.name)) and p.pack_size = r.size and p.pack_unit = r.unit
     and r.rate is not null and p.purchase_price is distinct from r.rate;
end $$;

-- Result
select co.name as company,
       count(p.*) as products,
       count(p.*) filter (where p.purchase_price > 0) as with_purchase_rate
from public.companies co
left join public.products p on p.company_id = co.id
where co.org_id = '1bce58f6-5c65-41e8-93f3-bd3ebb0adaeb' and co.name = 'Starco'
group by co.name;
