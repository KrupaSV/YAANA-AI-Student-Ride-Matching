-- YAANA 2.0 data layer.
-- Run this once in the Supabase SQL editor. It extends the existing
-- profiles, trips, ride_requests, driver_applications, and auto_bookings
-- tables. It does not delete student rows.
-- Row Level Security stays enabled.

create table if not exists public.allowed_email_domains (
  domain text primary key,
  created_at timestamptz not null default now(),
  constraint allowed_email_domains_exact check (domain = lower(domain) and domain !~ '\s')
);

insert into public.allowed_email_domains (domain)
values ('dsu.edu.in')
on conflict (domain) do nothing;

alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists verification_status text not null default 'pending';
alter table public.profiles add column if not exists max_detour_km numeric not null default 5;
alter table public.profiles add column if not exists reduced_motion boolean not null default false;
alter table public.profiles add column if not exists compact_cards boolean not null default false;
alter table public.profiles add column if not exists notify_trip_updates boolean not null default true;
alter table public.profiles add column if not exists notify_match_updates boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.trips add column if not exists updated_at timestamptz not null default now();
alter table public.trips add column if not exists route_geometry jsonb;
alter table public.trips add column if not exists distance_km numeric;
alter table public.trips add column if not exists duration_min numeric;
alter table public.trips add column if not exists preferences text;
alter table public.trips add column if not exists owner_display_name text;
alter table public.trips add column if not exists seats_taken integer not null default 0;

alter table public.ride_requests add column if not exists message text;
alter table public.ride_requests add column if not exists updated_at timestamptz not null default now();
alter table public.ride_requests add column if not exists requester_name text;
alter table public.ride_requests add column if not exists reviewed_at timestamptz;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.profiles (id, full_name, usn, student_email, verification_status)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  coalesce(users.raw_user_meta_data ->> 'usn', ''),
  users.email,
  case
    when users.email_confirmed_at is not null
      and lower(split_part(users.email, '@', 2)) in (select domain from public.allowed_email_domains)
      then 'verified'
    when lower(split_part(users.email, '@', 2)) in (select domain from public.allowed_email_domains)
      then 'pending'
    else 'unverified'
  end
from auth.users as users
where not exists (
  select 1 from public.profiles as profiles where profiles.id = users.id
);

update public.profiles as profiles
set
  student_email = users.email,
  verification_status = case
    when users.email_confirmed_at is not null
      and lower(split_part(users.email, '@', 2)) in (select domain from public.allowed_email_domains)
      then 'verified'
    when lower(split_part(users.email, '@', 2)) in (select domain from public.allowed_email_domains)
      then 'pending'
    else 'unverified'
  end
from auth.users as users
where profiles.id = users.id;

update public.trips as trips
set seats_taken = coalesce((
  select count(*)::integer
  from public.ride_requests as requests
  where requests.trip_id = trips.id
    and requests.status = 'accepted'
), 0);

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select con.conname
    from pg_constraint as con
    join pg_class as rel on rel.oid = con.conrelid
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'trips'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.trips drop constraint %I', constraint_row.conname);
  end loop;

  for constraint_row in
    select con.conname
    from pg_constraint as con
    join pg_class as rel on rel.oid = con.conrelid
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'ride_requests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.ride_requests drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles
  add constraint profiles_verification_status_check
  check (verification_status in ('unverified', 'pending', 'verified'));

alter table public.profiles drop constraint if exists profiles_max_detour_km_check;
alter table public.profiles
  add constraint profiles_max_detour_km_check
  check (max_detour_km >= 0.5 and max_detour_km <= 30);

alter table public.trips drop constraint if exists trips_status_check;
alter table public.trips
  add constraint trips_status_check
  check (status in ('open', 'full', 'cancelled', 'completed'));

alter table public.trips drop constraint if exists trips_distance_km_check;
alter table public.trips
  add constraint trips_distance_km_check
  check (distance_km is null or distance_km >= 0);

alter table public.trips drop constraint if exists trips_seats_taken_check;
alter table public.trips
  add constraint trips_seats_taken_check
  check (seats_taken >= 0);

do $$
begin
  if not exists (
    select 1 from public.trips
    where seats_available is null or seats_available < 1 or seats_available > 6
  ) then
    alter table public.trips drop constraint if exists trips_seats_available_check;
    alter table public.trips
      add constraint trips_seats_available_check
      check (seats_available between 1 and 6);
  end if;
end $$;

alter table public.ride_requests drop constraint if exists ride_requests_status_check;
alter table public.ride_requests
  add constraint ride_requests_status_check
  check (status in ('pending', 'accepted', 'rejected', 'cancelled'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trips_user_id_fkey') then
    alter table public.trips
      add constraint trips_user_id_fkey
      foreign key (user_id) references public.profiles (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ride_requests_trip_id_fkey') then
    alter table public.ride_requests
      add constraint ride_requests_trip_id_fkey
      foreign key (trip_id) references public.trips (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ride_requests_requester_id_fkey') then
    alter table public.ride_requests
      add constraint ride_requests_requester_id_fkey
      foreign key (requester_id) references public.profiles (id) on delete cascade;
  end if;
end $$;

create index if not exists trips_departure_idx on public.trips (departure_at);
create index if not exists trips_status_departure_idx on public.trips (status, departure_at);
create index if not exists trips_user_idx on public.trips (user_id);
create index if not exists trips_origin_idx on public.trips (origin_lat, origin_lng);
create index if not exists trips_destination_idx on public.trips (destination_lat, destination_lng);
create index if not exists ride_requests_trip_status_idx on public.ride_requests (trip_id, status);
create index if not exists ride_requests_requester_status_idx on public.ride_requests (requester_id, status);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from public.ride_requests
    where status in ('pending', 'accepted')
    group by trip_id, requester_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate active ride requests exist. Resolve them before migrating.';
  end if;
end $$;

create unique index if not exists ride_requests_one_active
  on public.ride_requests (trip_id, requester_id)
  where status in ('pending', 'accepted');

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
      and lower(split_part(users.email, '@', 2)) in (
        select domain from public.allowed_email_domains
      )
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_domain text;
  domain_allowed boolean;
begin
  email_domain := lower(split_part(new.email, '@', 2));
  select exists (
    select 1 from public.allowed_email_domains where domain = email_domain
  ) into domain_allowed;

  insert into public.profiles (id, full_name, usn, student_email, verification_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    upper(coalesce(new.raw_user_meta_data ->> 'usn', '')),
    new.email,
    case
      when domain_allowed and new.email_confirmed_at is not null then 'verified'
      when domain_allowed then 'pending'
      else 'unverified'
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
declare
  email_domain text;
  domain_allowed boolean;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is distinct from new.email_confirmed_at then
    email_domain := lower(split_part(new.email, '@', 2));
    select exists (
      select 1 from public.allowed_email_domains where domain = email_domain
    ) into domain_allowed;

    perform set_config('yaana.system_update', 'on', true);
    update public.profiles
    set
      student_email = new.email,
      verification_status = case when domain_allowed then 'verified' else 'unverified' end,
      updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('yaana.system_update', true), '') = 'on' then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.usn is distinct from old.usn
    or new.student_email is distinct from old.student_email
    or new.verification_status is distinct from old.verification_status
  then
    raise exception 'You cannot change identity or verification fields';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prepare_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_verified_student() then
    raise exception 'Only a confirmed DSU student can create a trip';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.status := 'open';
    new.seats_taken := 0;
    if new.departure_at <= now() then
      raise exception 'Departure must be in the future';
    end if;
    if new.route_geometry is null then
      raise exception 'A road route is required';
    end if;
    select full_name into new.owner_display_name
    from public.profiles
    where id = auth.uid();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_trip_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('yaana.system_update', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.owner_display_name is distinct from old.owner_display_name
    or new.seats_taken is distinct from old.seats_taken
  then
    raise exception 'You cannot change the trip owner or reserved seats';
  end if;

  if new.status not in ('open', 'cancelled') then
    raise exception 'Seat capacity changes when a request is accepted';
  end if;

  if old.status = 'full' and new.status = 'open' then
    raise exception 'Seats are full';
  end if;

  if new.seats_available < old.seats_taken then
    raise exception 'Seats cannot drop below the accepted requests';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prepare_ride_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_row public.trips;
  owner_notices boolean;
begin
  if auth.uid() is null or not public.is_verified_student() then
    raise exception 'Only a confirmed DSU student can request a seat';
  end if;

  select * into trip_row from public.trips where id = new.trip_id;
  if not found then
    raise exception 'Trip not found';
  end if;
  if trip_row.user_id = auth.uid() then
    raise exception 'You cannot request a seat on your own trip';
  end if;
  if trip_row.status <> 'open' or trip_row.departure_at <= now() then
    raise exception 'This trip is not open';
  end if;

  if new.id is null then
    new.id := gen_random_uuid();
  end if;
  new.requester_id := auth.uid();
  new.status := 'pending';
  new.reviewed_at := null;
  select full_name into new.requester_name from public.profiles where id = auth.uid();

  select notify_trip_updates into owner_notices
  from public.profiles
  where id = trip_row.user_id;

  if coalesce(owner_notices, true) then
    insert into public.notifications (user_id, kind, title, body, related_id)
    values (
      trip_row.user_id,
      'request_received',
      'New seat request',
      coalesce(new.requester_name, 'A student') || ' requested a seat on your trip.',
      new.id
    );
  end if;

  return new;
end;
$$;

create or replace function public.accept_ride_request(p_request_id uuid)
returns public.ride_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.ride_requests;
  trip_row public.trips;
  accepted_count integer;
  wants_notice boolean;
begin
  if auth.uid() is null or not public.is_verified_student() then
    raise exception 'Only a confirmed DSU student can accept a request';
  end if;

  select * into request_row
  from public.ride_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  select * into trip_row
  from public.trips
  where id = request_row.trip_id
  for update;

  if trip_row.user_id <> auth.uid() then
    raise exception 'Only the trip owner can accept this request';
  end if;
  if trip_row.status <> 'open' then
    raise exception 'This trip is not open';
  end if;

  select count(*)::integer into accepted_count
  from public.ride_requests
  where trip_id = trip_row.id
    and status = 'accepted';

  if accepted_count >= trip_row.seats_available then
    perform set_config('yaana.system_update', 'on', true);
    update public.trips
    set status = 'full', seats_taken = accepted_count, updated_at = now()
    where id = trip_row.id;
    raise exception 'No seats left';
  end if;

  update public.ride_requests
  set status = 'accepted', reviewed_at = now(), updated_at = now()
  where id = request_row.id
  returning * into request_row;

  perform set_config('yaana.system_update', 'on', true);
  update public.trips
  set
    seats_taken = accepted_count + 1,
    status = case when accepted_count + 1 >= seats_available then 'full' else 'open' end,
    updated_at = now()
  where id = trip_row.id;

  select notify_match_updates into wants_notice
  from public.profiles
  where id = request_row.requester_id;

  if coalesce(wants_notice, true) then
    insert into public.notifications (user_id, kind, title, body, related_id)
    values (
      request_row.requester_id,
      'request_accepted',
      'Seat accepted',
      'Your seat request was accepted.',
      request_row.id
    );
  end if;

  return request_row;
end;
$$;

create or replace function public.reject_ride_request(p_request_id uuid)
returns public.ride_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.ride_requests;
  trip_owner uuid;
  wants_notice boolean;
begin
  if auth.uid() is null or not public.is_verified_student() then
    raise exception 'Only a confirmed DSU student can reject a request';
  end if;

  select * into request_row from public.ride_requests where id = p_request_id for update;
  if not found or request_row.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  select user_id into trip_owner from public.trips where id = request_row.trip_id;
  if trip_owner <> auth.uid() then
    raise exception 'Only the trip owner can reject this request';
  end if;

  update public.ride_requests
  set status = 'rejected', reviewed_at = now(), updated_at = now()
  where id = request_row.id
  returning * into request_row;

  select notify_match_updates into wants_notice from public.profiles where id = request_row.requester_id;
  if coalesce(wants_notice, true) then
    insert into public.notifications (user_id, kind, title, body, related_id)
    values (request_row.requester_id, 'request_rejected', 'Request declined', 'The trip owner declined this seat request.', request_row.id);
  end if;

  return request_row;
end;
$$;

create or replace function public.cancel_ride_request(p_request_id uuid)
returns public.ride_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.ride_requests;
  trip_row public.trips;
  accepted_count integer;
  previous_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select * into request_row from public.ride_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if request_row.requester_id <> auth.uid() then
    raise exception 'You can cancel only your own request';
  end if;
  if request_row.status not in ('pending', 'accepted') then
    raise exception 'This request is already closed';
  end if;

  previous_status := request_row.status;
  select * into trip_row from public.trips where id = request_row.trip_id for update;

  update public.ride_requests
  set status = 'cancelled', updated_at = now()
  where id = request_row.id
  returning * into request_row;

  if previous_status = 'accepted' then
    select count(*)::integer into accepted_count
    from public.ride_requests
    where trip_id = trip_row.id and status = 'accepted';

    perform set_config('yaana.system_update', 'on', true);
    update public.trips
    set
      seats_taken = accepted_count,
      status = case
        when status = 'cancelled' then 'cancelled'
        when departure_at > now() and accepted_count < seats_available then 'open'
        when accepted_count >= seats_available then 'full'
        else status
      end,
      updated_at = now()
    where id = trip_row.id;
  end if;

  return request_row;
end;
$$;

create or replace function public.cancel_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_row public.trips;
  request_row record;
  wants_notice boolean;
begin
  if auth.uid() is null or not public.is_verified_student() then
    raise exception 'Only a confirmed DSU student can cancel a trip';
  end if;

  select * into trip_row from public.trips where id = p_trip_id for update;
  if not found or trip_row.user_id <> auth.uid() then
    raise exception 'Only the trip owner can cancel this trip';
  end if;
  if trip_row.status = 'cancelled' then
    return trip_row;
  end if;

  perform set_config('yaana.system_update', 'on', true);
  update public.trips
  set status = 'cancelled', updated_at = now()
  where id = trip_row.id
  returning * into trip_row;

  for request_row in
    select * from public.ride_requests
    where trip_id = trip_row.id and status in ('pending', 'accepted')
  loop
    update public.ride_requests
    set status = 'cancelled', updated_at = now()
    where id = request_row.id;

    select notify_match_updates into wants_notice from public.profiles where id = request_row.requester_id;
    if coalesce(wants_notice, true) then
      insert into public.notifications (user_id, kind, title, body, related_id)
      values (request_row.requester_id, 'trip_cancelled', 'Trip cancelled', 'A trip you requested was cancelled by the owner.', request_row.id);
    end if;
  end loop;

  return trip_row;
end;
$$;

create or replace function public.reveal_participant_email(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.ride_requests;
  trip_owner uuid;
  other_id uuid;
  other_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select * into request_row from public.ride_requests where id = p_request_id;
  if not found or request_row.status <> 'accepted' then
    raise exception 'Email is available after a request is accepted';
  end if;

  select user_id into trip_owner from public.trips where id = request_row.trip_id;
  if auth.uid() = trip_owner then
    other_id := request_row.requester_id;
  elsif auth.uid() = request_row.requester_id then
    other_id := trip_owner;
  else
    raise exception 'Only people on this accepted ride can see this email';
  end if;

  select student_email into other_email from public.profiles where id = other_id;
  return other_email;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
after update of email_confirmed_at on auth.users
for each row execute function public.handle_user_confirmed();

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
before update on public.profiles
for each row execute function public.guard_profile_update();

drop trigger if exists trips_prepare on public.trips;
create trigger trips_prepare
before insert on public.trips
for each row execute function public.prepare_trip();

drop trigger if exists trips_guard on public.trips;
create trigger trips_guard
before update on public.trips
for each row execute function public.guard_trip_update();

drop trigger if exists ride_requests_prepare on public.ride_requests;
create trigger ride_requests_prepare
before insert on public.ride_requests
for each row execute function public.prepare_ride_request();

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'trips', 'ride_requests', 'notifications',
        'allowed_email_domains', 'driver_applications', 'auto_bookings'
      )
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end $$;

alter table public.allowed_email_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.ride_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.driver_applications enable row level security;
alter table public.auto_bookings enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.trips from anon, authenticated;
revoke all on public.ride_requests from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.driver_applications from anon, authenticated;
revoke all on public.auto_bookings from anon, authenticated;
revoke all on public.allowed_email_domains from anon, authenticated;

grant select on public.allowed_email_domains to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  full_name, department, transport_preference, avatar_url, max_detour_km,
  reduced_motion, compact_cards, notify_trip_updates, notify_match_updates
) on public.profiles to authenticated;

grant select on public.trips to authenticated;
grant insert (
  user_id, origin_name, destination_name, origin_lat, origin_lng,
  destination_lat, destination_lng, departure_at, transport_mode,
  seats_available, estimated_cost, status, preferences, route_geometry,
  distance_km, duration_min, owner_display_name
) on public.trips to authenticated;
grant update (
  origin_name, destination_name, origin_lat, origin_lng, destination_lat,
  destination_lng, departure_at, transport_mode, seats_available,
  estimated_cost, status, preferences, route_geometry, distance_km, duration_min
) on public.trips to authenticated;

grant select, insert on public.ride_requests to authenticated;
grant select, update (read_at) on public.notifications to authenticated;

grant select, insert on public.driver_applications to authenticated;
grant update (status, admin_notes, reviewed_at) on public.driver_applications to authenticated;
grant select on public.auto_bookings to authenticated;

create policy domains_read on public.allowed_email_domains
for select to anon, authenticated
using (true);

create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());

create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy trips_select on public.trips
for select to authenticated
using (
  public.is_verified_student()
  and (
    user_id = auth.uid()
    or (status in ('open', 'full') and departure_at > now())
  )
);

create policy trips_insert on public.trips
for insert to authenticated
with check (user_id = auth.uid() and public.is_verified_student() and status = 'open');

create policy trips_update_own on public.trips
for update to authenticated
using (user_id = auth.uid() and public.is_verified_student())
with check (user_id = auth.uid());

create policy requests_select on public.ride_requests
for select to authenticated
using (
  requester_id = auth.uid()
  or exists (
    select 1 from public.trips
    where trips.id = ride_requests.trip_id
      and trips.user_id = auth.uid()
  )
);

create policy requests_insert on public.ride_requests
for insert to authenticated
with check (requester_id = auth.uid() and status = 'pending' and public.is_verified_student());

create policy notifications_select on public.notifications
for select to authenticated
using (user_id = auth.uid());

create policy notifications_read on public.notifications
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy driver_applications_own on public.driver_applications
for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy driver_applications_insert on public.driver_applications
for insert to authenticated
with check (user_id = auth.uid() and public.is_verified_student());

create policy driver_applications_review on public.driver_applications
for update to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy auto_bookings_driver on public.auto_bookings
for select to authenticated
using (
  driver_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

revoke all on function public.is_verified_student() from public;
revoke all on function public.accept_ride_request(uuid) from public;
revoke all on function public.reject_ride_request(uuid) from public;
revoke all on function public.cancel_ride_request(uuid) from public;
revoke all on function public.cancel_trip(uuid) from public;
revoke all on function public.reveal_participant_email(uuid) from public;

grant execute on function public.is_verified_student() to authenticated;
grant execute on function public.accept_ride_request(uuid) to authenticated;
grant execute on function public.reject_ride_request(uuid) to authenticated;
grant execute on function public.cancel_ride_request(uuid) to authenticated;
grant execute on function public.cancel_trip(uuid) to authenticated;
grant execute on function public.reveal_participant_email(uuid) to authenticated;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  drop policy if exists avatars_read on storage.objects;
  drop policy if exists avatars_insert on storage.objects;
  drop policy if exists avatars_update on storage.objects;
  drop policy if exists avatars_delete on storage.objects;

  create policy avatars_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

  create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Avatar storage policies were not created. Create a public avatars bucket in Supabase Storage.';
end $$;
