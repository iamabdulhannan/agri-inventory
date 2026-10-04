-- =====================================================================
-- OWNER forgot password (no email needed)
--
-- 1. Put the owner's email and a new password below (at least 6 characters).
-- 2. Run in Supabase -> SQL Editor -> New query.
-- 3. Sign in to the app with the new password.
-- =====================================================================
do $$
declare
  v_email    text := 'iamabdalhannan@gmail.com';   -- <== owner email
  v_password text := 'CHANGE-ME-123';              -- <== new password
  v_user     uuid;
begin
  if length(v_password) < 6 or v_password = 'CHANGE-ME-123' then
    raise exception 'Set a new password (at least 6 characters) in v_password first.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(v_email));
  if v_user is null then raise exception 'No account with email %', v_email; end if;

  update auth.users
     set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_user;

  -- sign out everywhere
  delete from auth.sessions where user_id = v_user;
  delete from auth.refresh_tokens where user_id = v_user::text;
end $$;

-- Result
select email, 'password changed - sign in with the new password' as status, updated_at
from auth.users
where lower(email) = lower('iamabdalhannan@gmail.com');   -- <== same email as above
