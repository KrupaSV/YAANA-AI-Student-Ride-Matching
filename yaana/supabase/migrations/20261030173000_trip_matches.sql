-- Two-way student ride matches.
-- Run after 20261026213000_theme_and_account.sql. Does not delete student rows.

create table if not exists public.trip_matches (
  id uuid primary key default gen_random_uuid(),
  trip_a_id uuid not null references public.trips (id) on delete cascade,
  trip_b_id uuid not null references public.trips (id) on delete cascade,
  user_a_id uuid not null references public.profiles (id) on delete cascade,
  user_b_id uuid not null references public.profiles (id) on delete cascade,
  a_display_name text,
  b_display_name text,
  a_avatar_url text,
  b_avatar_url text,
  score numeric not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  overlap_pct numeric,
  pickup_km numeric,
  destination_km numeric,
  time_difference_min integer,
  status text not null default 'pending',
  response_a text not null default 'pending',
  response_b text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_matches_distinct_trips check (trip_a_id <> trip_b_id),
  constraint trip_matches_distinct_users check (user_a_id <> user_b_id),
  constraint trip_matches_ordered check (trip_a_id < trip_b_id),
  constraint trip_matches_status_check check (status in ('pending', 'confirmed', 'rejected')),
  constraint trip_matches_response_a_check check (response_a in ('pending', 'accepted', 'rejected')),
  constraint trip_matches_response_b_check check (response_b in ('pending', 'accepted', 'rejected'))
);

create unique index if not exists trip_matches_pair_idx
  on public.trip_matches (trip_a_id, trip_b_id);

create index if not exists trip_matches_user_a_idx on public.trip_matches (user_a_id, status);
create index if not exists trip_matches_user_b_idx on public.trip_matches (user_b_id, status);

create or replace function public.fill_trip_match_cards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_a public.profiles%rowtype;
  profile_b public.profiles%rowtype;
begin
  if new.trip_a_id > new.trip_b_id then
    raise exception 'Trip pair must be stored in a stable order';
  end if;

  select * into profile_a from public.profiles where id = new.user_a_id;
  select * into profile_b from public.profiles where id = new.user_b_id;
  new.a_display_name := coalesce(nullif(profile_a.full_name, ''), new.a_display_name, 'Student');
  new.b_display_name := coalesce(nullif(profile_b.full_name, ''), new.b_display_name, 'Student');
  new.a_avatar_url := coalesce(profile_a.avatar_url, new.a_avatar_url);
  new.b_avatar_url := coalesce(profile_b.avatar_url, new.b_avatar_url);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trip_matches_fill on public.trip_matches;
create trigger trip_matches_fill
before insert or update on public.trip_matches
for each row execute function public.fill_trip_match_cards();

create or replace function public.notify_trip_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, title, body, related_id)
    values
      (
        new.user_a_id,
        'trip_match',
        'New ride match',
        coalesce(new.b_display_name, 'A classmate') || ' published a compatible trip. Accept or decline it in Matches.',
        new.id
      ),
      (
        new.user_b_id,
        'trip_match',
        'New ride match',
        coalesce(new.a_display_name, 'A classmate') || ' published a compatible trip. Accept or decline it in Matches.',
        new.id
      );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.notifications (user_id, kind, title, body, related_id)
    values
      (
        new.user_a_id,
        case when new.status = 'confirmed' then 'match_confirmed' when new.status = 'rejected' then 'match_rejected' else 'trip_match' end,
        case when new.status = 'confirmed' then 'Match confirmed' when new.status = 'rejected' then 'Match declined' else 'Match updated' end,
        case
          when new.status = 'confirmed' then 'You both accepted this shared ride.'
          when new.status = 'rejected' then 'This shared ride was declined.'
          else 'A match on your trip was updated.'
        end,
        new.id
      ),
      (
        new.user_b_id,
        case when new.status = 'confirmed' then 'match_confirmed' when new.status = 'rejected' then 'match_rejected' else 'trip_match' end,
        case when new.status = 'confirmed' then 'Match confirmed' when new.status = 'rejected' then 'Match declined' else 'Match updated' end,
        case
          when new.status = 'confirmed' then 'You both accepted this shared ride.'
          when new.status = 'rejected' then 'This shared ride was declined.'
          else 'A match on your trip was updated.'
        end,
        new.id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trip_matches_notify on public.trip_matches;
create trigger trip_matches_notify
after insert or update of status on public.trip_matches
for each row execute function public.notify_trip_match();

create or replace function public.respond_to_trip_match(p_match_id uuid, p_response text)
returns public.trip_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.trip_matches;
  next_status text;
begin
  if auth.uid() is null or not public.is_verified_student() then
    raise exception 'Only a confirmed student can respond to a match';
  end if;
  if p_response not in ('accepted', 'rejected') then
    raise exception 'Choose accept or decline';
  end if;

  select * into match_row from public.trip_matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if match_row.user_a_id <> auth.uid() and match_row.user_b_id <> auth.uid() then
    raise exception 'You can respond only to your own match';
  end if;

  if auth.uid() = match_row.user_a_id then
    match_row.response_a := p_response;
  else
    match_row.response_b := p_response;
  end if;

  if match_row.response_a = 'rejected' or match_row.response_b = 'rejected' then
    next_status := 'rejected';
  elsif match_row.response_a = 'accepted' and match_row.response_b = 'accepted' then
    next_status := 'confirmed';
  else
    next_status := 'pending';
  end if;

  update public.trip_matches
  set
    response_a = match_row.response_a,
    response_b = match_row.response_b,
    status = next_status,
    updated_at = now()
  where id = match_row.id
  returning * into match_row;

  if next_status = 'pending' and p_response = 'accepted' then
    insert into public.notifications (user_id, kind, title, body, related_id)
    values (
      case when auth.uid() = match_row.user_a_id then match_row.user_b_id else match_row.user_a_id end,
      'trip_match',
      'Your match accepted',
      'A classmate accepted this shared ride. Open Matches to confirm or decline.',
      match_row.id
    );
  end if;

  return match_row;
end;
$$;

revoke all on function public.respond_to_trip_match(uuid, text) from public;
grant execute on function public.respond_to_trip_match(uuid, text) to authenticated;

alter table public.trip_matches enable row level security;

revoke all on public.trip_matches from anon, authenticated;
grant select, insert on public.trip_matches to authenticated;

drop policy if exists trip_matches_select on public.trip_matches;
create policy trip_matches_select on public.trip_matches
for select to authenticated
using (user_a_id = auth.uid() or user_b_id = auth.uid());

drop policy if exists trip_matches_insert on public.trip_matches;
create policy trip_matches_insert on public.trip_matches
for insert to authenticated
with check (
  public.is_verified_student()
  and (user_a_id = auth.uid() or user_b_id = auth.uid())
  and exists (select 1 from public.trips where id = trip_a_id and user_id = user_a_id and status = 'open')
  and exists (select 1 from public.trips where id = trip_b_id and user_id = user_b_id and status = 'open')
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.trip_matches;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
