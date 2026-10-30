-- Additive settings: appearance preference, a departure note, and self-service account deletion.
-- Does not delete existing student rows. Run after 20261026183000_init.sql.

alter table public.profiles add column if not exists theme text not null default 'system';
alter table public.profiles add column if not exists preferred_departure text;

alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('light', 'dark', 'system'));

grant update (theme, preferred_departure) on public.profiles to authenticated;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting an account';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
