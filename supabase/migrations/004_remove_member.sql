-- =====================================================================
-- Removing a member deletes them completely:
--   * signs them out on every device
--   * deletes their account, profile and membership
--   * keeps their past stock entries, still showing their name
-- Owner can remove anyone (except themselves); admin can remove staff only.
-- Run once in Supabase -> SQL Editor. Safe to run more than once.
-- =====================================================================

-- 1. Remember who made each stock entry, even after the account is gone
alter table public.stock_movements add column if not exists created_by_name text;

update public.stock_movements m
   set created_by_name = coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p
 where p.id = m.created_by and m.created_by_name is null;

create or replace function public.set_created_by_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null and new.created_by_name is null then
    select coalesce(nullif(full_name, ''), email) into new.created_by_name
    from public.profiles where id = new.created_by;
  end if;
  return new;
end $$;
revoke execute on function public.set_created_by_name() from public, anon, authenticated;

drop trigger if exists stock_movements_created_by_name on public.stock_movements;
create trigger stock_movements_created_by_name
  before insert on public.stock_movements
  for each row execute function public.set_created_by_name();

-- 2. Remove a member completely
create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_me   public.member_role;
  v_them public.member_role;
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED'; end if;
  if p_user = auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;

  select role into v_me   from public.memberships where org_id = p_org and user_id = auth.uid();
  select role into v_them from public.memberships where org_id = p_org and user_id = p_user;
  if v_me is null or v_them is null or v_them = 'owner' then raise exception 'NOT_ALLOWED'; end if;
  if not (v_me = 'owner' or (v_me = 'admin' and v_them = 'staff')) then raise exception 'NOT_ALLOWED'; end if;

  -- keep their name on past entries
  update public.stock_movements m
     set created_by_name = coalesce(m.created_by_name, nullif(p.full_name, ''), p.email)
    from public.profiles p
   where p.id = p_user and m.created_by = p_user;

  -- sign out everywhere, then delete the account (profile + membership go with it)
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.users where id = p_user;
end $$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant  execute on function public.remove_member(uuid, uuid) to authenticated;
