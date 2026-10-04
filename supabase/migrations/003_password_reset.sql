-- =====================================================================
-- Password reset without email.
-- The shop owner (or an admin, for staff) sets a new password for a member
-- from Settings -> Members. Run once in Supabase -> SQL Editor.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.admin_reset_password(p_org uuid, p_user uuid, p_password text)
returns void
language plpgsql security definer
set search_path = public, extensions, auth
as $$
declare
  v_me   public.member_role;
  v_them public.member_role;
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  if p_user = auth.uid() then raise exception 'USE_PROFILE'; end if;  -- own password: Settings -> My profile

  select role into v_me   from public.memberships where org_id = p_org and user_id = auth.uid();
  select role into v_them from public.memberships where org_id = p_org and user_id = p_user;
  if v_me is null or v_them is null then raise exception 'NOT_ALLOWED'; end if;

  -- owner: anyone in the shop; admin: staff only; staff: nobody
  if not (v_me = 'owner' or (v_me = 'admin' and v_them = 'staff')) then
    raise exception 'NOT_ALLOWED';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;

  -- sign the member out on every device so the old password stops working everywhere
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
end $$;

revoke execute on function public.admin_reset_password(uuid, uuid, text) from public, anon;
grant  execute on function public.admin_reset_password(uuid, uuid, text) to authenticated;
