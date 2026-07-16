-- Post a Need becomes a genuine browsable listing rather than a private
-- calculator: an athlete posts the specific event (date, name, producer,
-- optional flier/Facebook link) they need a partner for, and any eligible
-- opposite-position athlete can browse it - not just whoever the poster
-- happens to request. This is also the intended growth channel the user
-- described: a producer who isn't on Steer Me yet still gets their name,
-- flier, and event surfaced to every athlete who sees the post.
--
-- Same broad-SELECT reasoning as event_attendance: rows are only ever
-- displayed by joining through public_profiles, which already filters
-- blocked/suspended users, so a plain authenticated SELECT here is safe -
-- nothing sensitive lives in this table.

create table public.need_posts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  is_goat_roping boolean not null default false,
  division numeric(3,1),
  event_date date not null,
  event_name text not null,
  producer_name text not null,
  flier_path text,
  facebook_link text,
  created_at timestamptz not null default now(),
  constraint need_posts_division_required_unless_goat
    check (is_goat_roping or division is not null)
);

alter table public.need_posts enable row level security;

create policy "need_posts_select_all" on public.need_posts
  for select using (auth.role() = 'authenticated');

create policy "need_posts_insert_own" on public.need_posts
  for insert with check (
    athlete_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and public.has_active_subscription(auth.uid())
  );

create policy "need_posts_delete_own" on public.need_posts
  for delete using (athlete_id = auth.uid());

-- Responding to a posted need still goes through partner_requests (same
-- accept/decline/contact-reveal machinery already built) - this just traces
-- a request back to the specific listing that prompted it, so My Requests
-- and the recipient's incoming-request view can show the event context.
alter table public.partner_requests
  add column need_post_id uuid references public.need_posts(id) on delete set null;

-- goat_roping_interest (migration 0019) is superseded by need_posts with
-- is_goat_roping = true, which carries the same "everyone interested, no
-- classification math" behavior plus the event details this feature adds.
-- No real data ever existed in it beyond already-cleaned-up smoke tests.
drop table public.goat_roping_interest;

insert into storage.buckets (id, name, public)
values ('need-fliers', 'need-fliers', true)
on conflict (id) do nothing;

-- need-fliers: public read (fliers are meant to be seen broadly - that's
-- the point), owner-only write, same per-user-folder convention as avatars.
create policy "need_fliers_public_read"
on storage.objects for select
using (bucket_id = 'need-fliers');

create policy "need_fliers_owner_insert" on storage.objects for insert
with check (bucket_id = 'need-fliers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "need_fliers_owner_delete" on storage.objects for delete
using (bucket_id = 'need-fliers' and (storage.foldername(name))[1] = auth.uid()::text);
