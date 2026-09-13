-- Real producer identity, independent of having a login. Almost every event
-- on Steer Me today (253 of 254 as of this migration) is admin-posted from a
-- flier with only a free-text external_producer_name - producer_profiles
-- can't hold these because its id is a hard FK to auth.users (a real
-- account is required to exist there). Ratings were previously scoped only
-- to a single event (event_ratings.event_id), so a producer's reputation
-- died with that event's 30-day soft-delete cycle and never carried to
-- their next posting. This table is the stable identity both problems were
-- missing - a producer_profiles account can later "claim" one via
-- claimed_by, at which point their event history and rating already exist
-- and just start counting toward a real account.
create table public.producer_identities (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  contact_info text,
  -- WSTR/USTRC/ACTRA/WTRC etc. show up as external_producer_name on many
  -- qualifiers that are actually run by different local producers who just
  -- co-brand with the sanctioning body - discovered during the 2026-09-13
  -- backfill (e.g. "WSTR" attached to both a Jett Sharp-run qualifier and a
  -- separate Walt Eddy/John English-run one). A sanctioning body isn't the
  -- accountable party a roper is actually rating, so it's flagged here
  -- rather than treated as a normal producer identity - UI should not
  -- surface a reputation score for one of these, and backfill/future
  -- posting should attribute the event to the real local producer instead
  -- whenever that's discoverable, not to the sanctioning body.
  is_sanctioning_body boolean not null default false,
  claimed_by uuid references auth.users(id) on delete set null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.producer_identities is
  'A real, stable producer identity that events attribute reputation to - '
  'exists independently of a producer_profiles account so admin-posted/'
  'externally-sourced producers (the current majority) can still build a '
  'rating that survives event soft-deletion and carries to their next '
  'posting. claimed_by is set once a real producer signs up and claims it '
  'via claim_producer_identity().';
comment on column public.producer_identities.claimed_by is
  'auth.users id of the producer_profiles account that claimed this '
  'identity, if any. NULL means unclaimed - the producer has no login, '
  'reputation still accrues, just not manageable by anyone yet.';

create trigger producer_identities_set_updated_at
  before update on public.producer_identities
  for each row execute function public.set_updated_at();

alter table public.producer_identities enable row level security;

-- Public reputation - anyone (including anonymous browse, matching
-- events_select's own "published" branch) can see a producer's identity
-- and, via the view below, their rating. No direct insert/update policy for
-- authenticated users - creation is service-role only (admin backfill/flier
-- posting) or via the claim function below, keeping this the same
-- structural pattern as producer_profiles' own "no client DELETE" note.
create policy "producer_identities_select_all" on public.producer_identities
  for select using (true);

alter table public.events
  add column producer_identity_id uuid references public.producer_identities(id);

comment on column public.events.producer_identity_id is
  'The stable producer identity this event counts toward for reputation, '
  'independent of producer_id (which requires a real producer_profiles '
  'account) and external_producer_name (free text, no identity). Set at '
  'post time going forward; backfilled for existing events in a follow-up '
  'data migration, not this schema one.';

-- Same "not enough ratings yet" 3-count threshold as event_rating_summary
-- (Producer Guidelines section 3), rolled up across every event ever
-- attributed to this producer identity regardless of whether those events
-- are still 'published' or have since been soft-deleted to 'removed' by
-- the 30-day cleanup - that's the whole point, the rating outlives the
-- event.
create view public.producer_rating_summary
with (security_invoker = false) as
select
  e.producer_identity_id,
  case when count(r.*) >= 3 then round(avg(r.stars)::numeric, 1) else null end as avg_stars,
  count(r.*) as rating_count
from public.event_ratings r
join public.events e on e.id = r.event_id
where e.producer_identity_id is not null
group by e.producer_identity_id;

grant select on public.producer_rating_summary to authenticated;

-- Lets a signed-up producer attach their real account to an existing
-- unclaimed identity (e.g. one backfilled from their own past flier
-- postings) without needing broad UPDATE access to producer_identities.
-- SECURITY DEFINER so it can check/set claimed_by despite the table having
-- no client update policy at all. Silently no-ops (returns false) rather
-- than erroring on an already-claimed identity, so the caller can show a
-- plain "already claimed" message.
create or replace function public.claim_producer_identity(p_identity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.producer_profiles where id = auth.uid()) then
    raise exception 'A producer profile is required before claiming a producer identity';
  end if;

  update public.producer_identities
  set claimed_by = auth.uid()
  where id = p_identity_id and claimed_by is null;

  return found;
end;
$$;

grant execute on function public.claim_producer_identity(uuid) to authenticated;
