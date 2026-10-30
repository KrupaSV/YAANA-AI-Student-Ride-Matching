-- Allow empty USN while registration_mode is testing.
-- Existing student USNs are not rewritten. RLS stays enabled.
--
-- Run this once in the Supabase SQL editor after
-- 20261030190000_registration_mode.sql.

alter table public.profiles alter column usn drop not null;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%usn%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', constraint_row.conname);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  domain_allowed boolean;
  usn_value text;
begin
  if not public.is_valid_email_format(new.email) then
    raise exception 'Enter a valid email address';
  end if;

  domain_allowed := public.email_domain_allowed(new.email);
  if not domain_allowed then
    raise exception 'Registration is limited to approved college email domains';
  end if;

  usn_value := nullif(upper(trim(coalesce(new.raw_user_meta_data ->> 'usn', ''))), '');

  insert into public.profiles (id, full_name, usn, student_email, verification_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    usn_value,
    new.email,
    case
      when new.email_confirmed_at is not null then 'verified'
      else 'pending'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
