-- =====================================================================
-- Note printed at the bottom of every receipt (in Urdu).
-- Empty = the standard note. Run once in Supabase -> SQL Editor. Safe to run again.
-- =====================================================================
alter table public.organizations add column if not exists receipt_note text;
