-- Temporary registration policy switch for matching tests.
-- testing: any valid email may register; email confirmation is still required.
-- production: only domains in public.allowed_email_domains (dsu.edu.in by default).
-- This does not disable auth, RLS, or confirmation. Existing student rows are not rewritten.
--
-- Enable testing:
--   update public.app_settings set value = 'testing', updated_at = now() where key = 'registration_mode';
-- Restore DSU-only:
--   update public.app_settings set value = 'production', updated_at = now() where key = 'registration_mode';

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint app_settings_key_check check (key = lower(key) and key !~ '\s')
);

insert into public.app_settings (key, value)
values ('registration_mode', 'testing')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
for select to anon, authenticated
using (true);

create or replace function public.registration_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(coalesce(
      (select value from public.app_settings where key = 'registration_mode'),
      'production'
    )) = 'testing' then 'testing'
    else 'production'
  end;
$$;

create or replace function public.is_valid_email_format(email text)
returns boolean
language sql
immutable
as $$
  select email is not null
    and char_length(email) between 6 and 254
    and email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$';
$$;

create or replace function public.email_domain_allowed(email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_valid_email_format(email)
    and (
      public.registration_mode() = 'testing'
      or lower(split_part(email, '@', 2)) in (select domain from public.allowed_email_domains)
    );
$$;

create or replace function public.is_verified_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users as users
    join public.profiles as profiles on profiles.id = users.id
    where users.id = auth.uid()
      and users.email_confirmed_at is not null
      and profiles.verification_status = 'verified'
      and public.email_domain_allowed(users.email)
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  domain_allowed boolean;
begin
  if not public.is_valid_email_format(new.email) then
    raise exception 'Enter a valid email address';
  end if;

  domain_allowed := public.email_domain_allowed(new.email);
  if not domain_allowed then
    raise exception 'Registration is limited to approved college email domains';
  end if;

  insert into public.profiles (id, full_name, usn, student_email, verification_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    upper(coalesce(new.raw_user_meta_data ->> 'usn', '')),
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

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is distinct from new.email_confirmed_at then
    if not public.email_domain_allowed(new.email) then
      perform set_config('yaana.system_update', 'on', true);
      update public.profiles
      set
        student_email = new.email,
        verification_status = 'unverified',
        updated_at = now()
      where id = new.id;
      return new;
    end if;

    perform set_config('yaana.system_update', 'on', true);
    update public.profiles
    set
      student_email = new.email,
      verification_status = 'verified',
      updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.registration_mode() from public;
revoke all on function public.is_valid_email_format(text) from public;
revoke all on function public.email_domain_allowed(text) from public;
grant execute on function public.registration_mode() to anon, authenticated;
grant execute on function public.is_valid_email_format(text) to anon, authenticated;
grant execute on function public.email_domain_allowed(text) to anon, authenticated;
