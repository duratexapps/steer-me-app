-- Trailer parking on layover spots and hotels. A hotel can only be listed if it has parking for horse trailers, and every
-- owner-listed hotel must say whether that parking is secure. A parking lot that is not secure is shown to ropers as such.
-- Existing curated stops have no parking data (null) and show nothing.

alter table public.layover_spots
  add column if not exists trailer_parking boolean,
  add column if not exists parking_secure boolean,
  add column if not exists parking_detail text;

drop function if exists public.submit_layover_listing(text, text, text, text, text, text, text, boolean, boolean, text, boolean, text, text);

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
  p_notes text,
  p_trailer_parking boolean default null,
  p_parking_secure boolean default null,
  p_parking_detail text default null
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
  if p_kind = 'hotel' then
    if p_trailer_parking is distinct from true then
      raise exception 'Hotels can be listed only if they have parking for horse trailers.';
    end if;
    if p_parking_secure is null then
      raise exception 'Say whether the trailer parking is secure.';
    end if;
  end if;
  if (select count(*) from public.layover_spots where owner_id = auth.uid()) >= 25 then
    raise exception 'You have reached the limit of 25 listings. Email ropingtools@duratex-ie.com to add more.';
  end if;

  insert into public.layover_spots
    (name, kind, state, city, address, phone, website, has_stalls, has_pens, housing_detail, rv_hookups, rv_detail, notes,
     trailer_parking, parking_secure, parking_detail,
     verification, source_name, source_url, verified_on, owner_id, review_status, active)
  values
    (btrim(p_name), p_kind, upper(btrim(p_state)), btrim(p_city), nullif(btrim(p_address), ''), nullif(btrim(p_phone), ''),
     nullif(btrim(p_website), ''), coalesce(p_has_stalls, false), coalesce(p_has_pens, false), nullif(btrim(p_housing_detail), ''),
     coalesce(p_rv_hookups, false), nullif(btrim(p_rv_detail), ''), nullif(btrim(p_notes), ''),
     p_trailer_parking, p_parking_secure, nullif(btrim(p_parking_detail), ''),
     'unverified', 'Submitted by the owner', coalesce(nullif(btrim(p_website), ''), 'https://steerme.ropingtools.com'), current_date,
     auth.uid(), 'pending', true)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_layover_listing(text, text, text, text, text, text, text, boolean, boolean, text, boolean, text, text, boolean, boolean, text) to authenticated;
