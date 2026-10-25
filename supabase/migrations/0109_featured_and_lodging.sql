-- Featured listings + layover spot / hotel owner accounts (Justin, 2026-10-24).
--
-- 1. FRAMEWORK FOR FEATURED LISTINGS (clinics, layover spots, hotels). Built and switched OFF: nothing is offered until
--    app_settings.featured_listings_enabled is true. Price and length live in app_settings so they can change without a
--    release. A featured purchase is paid through Stripe Checkout (Edge Function stripe-featured-checkout); the existing
--    stripe-webhook marks the purchase paid and sets featured_until on the listing.
-- 2. LODGING ACCOUNTS. A third kind of producer profile (is_lodging): someone who runs an equine layover spot, horse
--    motel, RV park with horses, or a hotel with trailer parking, and enters their own listing. A submitted listing is
--    PENDING and invisible to everyone but its owner until RopingTools approves it (and adds its map position).
--    Lodging accounts can never post events.

-- ---- settings (placeholders: Justin picks the real prices) -------------------------------------------------------
insert into public.app_settings (key, value) values
  ('featured_listings_enabled', 'false'::jsonb),
  ('featured_price_clinic_cents', '2500'::jsonb),
  ('featured_price_stop_cents', '2500'::jsonb),
  ('featured_days', '30'::jsonb)
on conflict (key) do nothing;

-- ---- profiles ----------------------------------------------------------------------------------------------------
alter table public.producer_profiles
  add column is_lodging boolean not null default false,
  add constraint producer_profiles_one_kind check (not (is_clinician and is_lodging));

drop function public.create_producer_profile(text, text, text, text, text, uuid, boolean);

create or replace function public.create_producer_profile(
  p_org_name text,
  p_contact_name text,
  p_contact_info text,
  p_affiliation text,
  p_verification_doc_path text,
  p_claim_identity_id uuid default null,
  p_is_clinician boolean default false,
  p_is_lodging boolean default false
)
returns public.producer_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.producer_profiles;
  target_identity_id uuid;
begin
  if coalesce(p_is_clinician, false) and coalesce(p_is_lodging, false) then
    raise exception 'Choose one kind of profile.';
  end if;

  insert into public.producer_profiles (id, org_name, contact_name, contact_info, affiliation, verification_doc_path, is_clinician, is_lodging)
  values (auth.uid(), p_org_name, p_contact_name, p_contact_info, p_affiliation, p_verification_doc_path,
          coalesce(p_is_clinician, false), coalesce(p_is_lodging, false))
  returning * into result;

  if p_claim_identity_id is not null then
    update public.producer_identities
    set claimed_by = auth.uid()
    where id = p_claim_identity_id and claimed_by is null
    returning id into target_identity_id;
  end if;

  if target_identity_id is null then
    insert into public.producer_identities (org_name, claimed_by)
    values (p_org_name, auth.uid())
    returning id into target_identity_id;
  end if;

  return result;
end;
$$;

grant execute on function public.create_producer_profile(text, text, text, text, text, uuid, boolean, boolean) to authenticated;

-- A lodging account cannot post events; the kind rule from 0107 is unchanged otherwise.
create or replace function public.force_event_clinic_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clinician boolean;
  lodging boolean;
begin
  if new.producer_id is null then
    return new;
  end if;
  select is_clinician, is_lodging into clinician, lodging from public.producer_profiles where id = new.producer_id;
  if clinician is null then
    return new;
  end if;
  if lodging then
    raise exception 'Layover spot and hotel accounts list their spots, not events.';
  end if;
  new.is_clinic := clinician;
  if clinician and (new.divisions is null or coalesce(array_length(new.divisions, 1), 0) = 0) then
    new.divisions := array[19]::numeric(3,1)[];
  end if;
  return new;
end;
$$;

-- ---- featured ----------------------------------------------------------------------------------------------------
alter table public.events add column featured_until timestamptz;

alter table public.layover_spots
  add column featured_until timestamptz,
  add column owner_id uuid references auth.users(id) on delete set null,
  add column review_status text not null default 'approved' check (review_status in ('pending', 'approved', 'rejected'));

-- A submitted listing has no map position until it is approved; an approved one always does.
alter table public.layover_spots alter column lat drop not null, alter column lng drop not null;
alter table public.layover_spots
  add constraint layover_spots_approved_needs_coords check (review_status <> 'approved' or (lat is not null and lng is not null));

-- A hotel (with trailer parking) is a kind of stop.
alter table public.layover_spots drop constraint layover_spots_kind_check;
alter table public.layover_spots
  add constraint layover_spots_kind_check
  check (kind in ('fairgrounds', 'equestrian_center', 'boarding_barn', 'arena', 'campground', 'hotel'));

-- Members see approved, active spots; an owner also sees their own (pending included). Writes only through the RPC.
drop policy "layover_spots_read_members" on public.layover_spots;
create policy "layover_spots_read_members" on public.layover_spots for select to authenticated
  using ((active and review_status = 'approved') or owner_id = auth.uid());

create table public.featured_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('event', 'layover_spot')),
  target_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  days integer not null check (days > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.featured_purchases enable row level security;
create policy "featured_purchases_select_own" on public.featured_purchases for select to authenticated using (user_id = auth.uid());

-- What the app needs to know about featuring (the switch and the prices), without exposing app_settings itself.
create or replace function public.get_featured_pricing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', coalesce((select (value)::text = 'true' from public.app_settings where key = 'featured_listings_enabled'), false),
    'clinic_cents', coalesce((select (value)::text::integer from public.app_settings where key = 'featured_price_clinic_cents'), 2500),
    'stop_cents', coalesce((select (value)::text::integer from public.app_settings where key = 'featured_price_stop_cents'), 2500),
    'days', coalesce((select (value)::text::integer from public.app_settings where key = 'featured_days'), 30)
  );
$$;
grant execute on function public.get_featured_pricing() to authenticated;

-- ---- lodging owners submit a listing ------------------------------------------------------------------------------
create or replace function public.submit_layover_listing(
  p_name text,
  p_kind text,
  p_city text,
  p_state text,
  p_address text,
  p_phone text,
  p_website text,
  p_has_stalls boolean,
  p_has_pens boolean,
  p_housing_detail text,
  p_rv_hookups boolean,
  p_rv_detail text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if not exists (select 1 from public.producer_profiles where id = auth.uid() and is_lodging) then
    raise exception 'Set up a layover spot or hotel profile first.';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_city), '') is null or upper(btrim(coalesce(p_state, ''))) !~ '^[A-Z]{2}$' then
    raise exception 'Enter the name, the city and a two-letter state.';
  end if;
  if p_kind not in ('fairgrounds', 'equestrian_center', 'boarding_barn', 'arena', 'campground', 'hotel') then
    raise exception 'Choose what kind of place this is.';
  end if;
  if (select count(*) from public.layover_spots where owner_id = auth.uid()) >= 25 then
    raise exception 'You have reached the limit of 25 listings. Email ropingtools@duratex-ie.com to add more.';
  end if;

  insert into public.layover_spots
    (name, kind, state, city, address, phone, website, has_stalls, has_pens, housing_detail, rv_hookups, rv_detail, notes,
     verification, source_name, source_url, verified_on, owner_id, review_status, active)
  values
    (btrim(p_name), p_kind, upper(btrim(p_state)), btrim(p_city), nullif(btrim(p_address), ''), nullif(btrim(p_phone), ''),
     nullif(btrim(p_website), ''), coalesce(p_has_stalls, false), coalesce(p_has_pens, false), nullif(btrim(p_housing_detail), ''),
     coalesce(p_rv_hookups, false), nullif(btrim(p_rv_detail), ''), nullif(btrim(p_notes), ''),
     'unverified', 'Submitted by the owner', coalesce(nullif(btrim(p_website), ''), 'https://steerme.ropingtools.com'), current_date,
     auth.uid(), 'pending', true)
  returning id into new_id;

  return new_id;
end;
$$;
grant execute on function public.submit_layover_listing(text, text, text, text, text, text, text, boolean, boolean, text, boolean, text, text) to authenticated;
