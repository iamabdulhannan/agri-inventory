-- =====================================================================
-- One account = one organization.
-- A user who already belongs to an organization cannot create another
-- one or join a second one. Safe to run more than once.
-- =====================================================================

-- Hard guarantee at the table level
create unique index if not exists memberships_one_org_per_user on public.memberships (user_id);

-- Logged-in user without an organization joins one with a code
create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.invites; v_email text;
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'ALREADY_IN_ORG';
  end if;
  select * into v_inv from public.invites
   where code = upper(trim(p_code)) and used_at is null and expires_at > now() for update;
  if not found then raise exception 'INVALID_INVITE'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if v_inv.email is not null and lower(v_inv.email) <> lower(v_email) then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role);
  update public.invites set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

-- Logged-in user without an organization creates one
create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'ALREADY_IN_ORG';
  end if;
  insert into public.organizations (name) values (trim(p_name)) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  perform public.seed_categories(v_org);
  return v_org;
end $$;
