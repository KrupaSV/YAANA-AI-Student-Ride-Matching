-- Optional map appearance. Apply after the trip_matches migration.
begin;

alter table public.profiles
  add column if not exists pickup_character text not null default 'neutral'
  check (pickup_character in ('neutral', 'woman', 'man'));

grant update (pickup_character) on public.profiles to authenticated;

create or replace function public.match_pickup_character(p_match_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select classmate.pickup_character
  from public.trip_matches as ride_match
  join public.profiles as classmate
    on classmate.id = case
      when ride_match.user_a_id = (select auth.uid()) then ride_match.user_b_id
      else ride_match.user_a_id
    end
  where ride_match.id = p_match_id
    and (select auth.uid()) in (ride_match.user_a_id, ride_match.user_b_id);
$$;

revoke execute on function public.match_pickup_character(uuid) from public, anon;
grant execute on function public.match_pickup_character(uuid) to authenticated;

commit;
