-- Favorites: a lightweight "people you've roped with and want to stay in
-- touch with" list, brought back from the original full build's scope but
-- entered through Post a Need's audience picker instead of its own home-tab
-- list. One-directional (favoriting someone doesn't imply they favorited
-- you back) - mirrors the blocks table exactly, including the
-- default-auth.uid() convention from the 0016-0018 bugfix sweep.

create table public.favorites (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  favorite_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_id),
  constraint no_self_favorite check (user_id <> favorite_id)
);

alter table public.favorites enable row level security;

create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);

create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- Post a Need audience targeting: a poster can scope who sees their listing
-- to everyone (today's behavior), everyone on their favorites list, or a
-- hand-picked subset of it.

alter table public.need_posts
  add column visibility text not null default 'everyone'
    check (visibility in ('everyone', 'favorites', 'selected'));

-- Only populated when visibility = 'selected'. Managed exclusively by the
-- need_post's own poster via a join back to need_posts, since there's no
-- direct owner column on this table itself.
create table public.need_post_visible_to (
  need_post_id uuid not null references public.need_posts(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  primary key (need_post_id, athlete_id)
);

alter table public.need_post_visible_to enable row level security;

create policy "need_post_visible_to_owner_manage" on public.need_post_visible_to
  for all using (
    exists (
      select 1 from public.need_posts p
      where p.id = need_post_visible_to.need_post_id and p.athlete_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.need_posts p
      where p.id = need_post_visible_to.need_post_id and p.athlete_id = auth.uid()
    )
  );

-- SECURITY DEFINER helpers, same reasoning as is_blocked_pair (migration
-- 0003): the need_posts visibility policy below needs to check favorites
-- and need_post_visible_to rows belonging to the POSTER, not the viewer
-- running the query, which the owner-scoped RLS on those two tables would
-- otherwise hide - a plain subquery evaluated as the viewer would silently
-- return zero rows even for a legitimately-visible post.

create or replace function public.is_favorited_by(poster uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.favorites f
    where f.user_id = poster and f.favorite_id = viewer
  );
$$;

create or replace function public.is_selected_for_post(post_id uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.need_post_visible_to v
    where v.need_post_id = post_id and v.athlete_id = viewer
  );
$$;

-- Replaces the old blanket "any authenticated user" select policy with one
-- that actually enforces the poster's chosen audience. Two permissive
-- policies OR together (Postgres semantics): a row is visible if you're the
-- poster, OR the audience check passes.
drop policy "need_posts_select_all" on public.need_posts;

create policy "need_posts_select_own" on public.need_posts
  for select using (athlete_id = auth.uid());

create policy "need_posts_select_visible" on public.need_posts
  for select using (
    auth.role() = 'authenticated'
    and (
      visibility = 'everyone'
      or (visibility = 'favorites' and public.is_favorited_by(athlete_id, auth.uid()))
      or (visibility = 'selected' and public.is_selected_for_post(id, auth.uid()))
    )
  );
