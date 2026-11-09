-- =====================================================================
-- 020: users can delete their own account from inside the app
-- (required by Google Play and the App Store for apps with sign-up)
--
-- * A shop where the user is the only member is deleted with all its records.
--   If the year lock or a booked investor settlement stops that, the shop is left
--   with no members, so nobody can open it again (RLS is by membership).
-- * A shop that has other members keeps its records; the user only leaves it.
--   The owner of such a shop must remove the team (or make another owner) first.
-- * Entries the user made stay in the shops, with "created by" cleared.
-- =====================================================================

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  m  record;
begin
  if me is null then raise exception 'NOT_ALLOWED'; end if;

  -- the owner of a shop with a team can't leave it without an owner
  if exists (
    select 1 from public.memberships mm
     where mm.user_id = me and mm.role = 'owner'
       and exists (select 1 from public.memberships o where o.org_id = mm.org_id and o.user_id <> me)
       and not exists (select 1 from public.memberships o where o.org_id = mm.org_id and o.user_id <> me and o.role = 'owner')
  ) then
    raise exception 'OWNER_HAS_TEAM' using hint = 'Remove the team members of your shop first.';
  end if;

  for m in
    select mm.org_id from public.memberships mm
     where mm.user_id = me
       and not exists (select 1 from public.memberships o where o.org_id = mm.org_id and o.user_id <> me)
  loop
    begin
      -- unlock the books, then remove stock entries in one statement so the
      -- "stock can't go below zero" check sees an empty batch, then the shop
      update public.organizations set locked_until = null where id = m.org_id and locked_until is not null;
      delete from public.stock_movements where org_id = m.org_id;
      delete from public.organizations where id = m.org_id;
    exception when others then
      -- kept, but without members it can no longer be opened by anyone
      null;
    end;
  end loop;

  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
