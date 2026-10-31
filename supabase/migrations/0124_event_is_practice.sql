-- Practices (Justin, 2026-10-31): open practices and practice nights at arenas. A flier is helpful but not required; a
-- practice only needs a contact and/or a time and place. Like clinics (0106) they are NOT jackpots: no classes, no
-- partner matching, no attendance. A practice is kept out of the main Events list and shows only under its own
-- "Practices" chip. Practices keep the one-placeholder divisions array (same convention as clinics and round-robin
-- ropings), so every existing constraint and query keeps working.

alter table public.events
  add column is_practice boolean not null default false,
  add constraint events_not_clinic_and_practice check (not (is_clinic and is_practice));

create index events_is_practice_idx on public.events (event_date) where is_practice;

-- An instructor's events are always clinics, so a clinician can never file one as a practice. Same body as 0109 plus
-- that rule.
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
  if clinician then
    new.is_practice := false;
  end if;
  if clinician and (new.divisions is null or coalesce(array_length(new.divisions, 1), 0) = 0) then
    new.divisions := array[19]::numeric(3,1)[];
  end if;
  return new;
end;
$$;
