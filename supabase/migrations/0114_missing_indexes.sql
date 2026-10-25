-- Indexes for foreign keys and hot queries that had none (found in the 2026-10-25 audit). The tables are small today; these
-- keep the producer dashboard, the Events list, rating roll-ups and the row-level-security policy lookups fast as they grow.
create index if not exists events_producer_id_idx on public.events (producer_id) where producer_id is not null;
create index if not exists events_producer_identity_id_idx on public.events (producer_identity_id) where producer_identity_id is not null;
create index if not exists events_published_date_idx on public.events (event_date) where status = 'published';
create index if not exists need_posts_athlete_id_idx on public.need_posts (athlete_id);
create index if not exists event_ratings_athlete_id_idx on public.event_ratings (athlete_id);
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists favorites_favorite_id_idx on public.favorites (favorite_id);
create index if not exists partner_requests_event_id_idx on public.partner_requests (event_id) where event_id is not null;
create index if not exists partner_requests_need_post_id_idx on public.partner_requests (need_post_id) where need_post_id is not null;
create index if not exists draw_pro_entry_links_event_id_idx on public.draw_pro_entry_links (event_id);
create index if not exists entry_handoffs_event_id_idx on public.entry_handoffs (event_id);
create index if not exists event_reports_event_id_idx on public.event_reports (event_id);
