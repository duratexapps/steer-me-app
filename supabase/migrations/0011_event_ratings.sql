-- Event ratings. Eligibility (marked attending before the event date, event
-- has passed, within the 30-day window, one rating per athlete per event) is
-- enforced in a single BEFORE INSERT trigger so there's one place to read
-- for the rule and one clear error message per failure, per Producer
-- Guidelines section 3.

create table public.event_ratings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  unique (event_id, athlete_id)
);

alter table public.event_ratings enable row level security;

create policy "event_ratings_select_all" on public.event_ratings
  for select using (auth.role() = 'authenticated');

create policy "event_ratings_insert_own" on public.event_ratings
  for insert with check (athlete_id = auth.uid());

create or replace function public.enforce_rating_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  attended_before boolean;
begin
  select * into ev from public.events where id = new.event_id;

  if ev is null then
    raise exception 'Event not found';
  end if;

  if ev.event_date > current_date then
    raise exception 'You can only rate an event after its date has passed';
  end if;

  if current_date > ev.event_date + 30 then
    raise exception 'The rating window for this event has closed';
  end if;

  select exists (
    select 1 from public.event_attendance
    where event_id = new.event_id
      and athlete_id = new.athlete_id
      and created_at::date <= ev.event_date
  ) into attended_before;

  if not attended_before then
    raise exception 'Only athletes who marked attending before the event date can rate it';
  end if;

  return new;
end;
$$;

create trigger event_ratings_before_insert
  before insert on public.event_ratings
  for each row execute function public.enforce_rating_eligibility();

-- "Not enough ratings yet" below the 3-rating threshold, per Producer
-- Guidelines section 3 - avg_stars is NULL until count >= 3.
create view public.event_rating_summary
with (security_invoker = false) as
select
  event_id,
  case when count(*) >= 3 then round(avg(stars)::numeric, 1) else null end as avg_stars,
  count(*) as rating_count
from public.event_ratings
group by event_id;

grant select on public.event_rating_summary to authenticated;
