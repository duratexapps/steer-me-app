-- Abuse-ceiling rate limiting for the edge functions that call a paid
-- external API per request (extract-flier-contact-info, verify-
-- classification-card: Anthropic; get-town-distance: Google Routes, only
-- on a cache miss). NOT a general usage cap - thresholds are set well
-- above any real person's natural usage, purely to stop a scripted loop
-- from running up API costs. Same shape as Draw Pro's own
-- rate_limit_hits (0035) - kept as two independent tables since these are
-- separate Supabase projects, not one shared service.
--
-- `scope` is 'user:<uuid>' for the two authenticated Anthropic-calling
-- functions, or 'ip:<sha256 of caller IP>' for get-town-distance (which
-- has no auth check today - see that function's own header comment on
-- why). `action` identifies which function.

create table public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_hits_scope_action_created_idx
  on public.rate_limit_hits (scope, action, created_at);

alter table public.rate_limit_hits enable row level security;
-- No policies: service-role only (every caller here is an edge function
-- using the admin client), same convention used elsewhere in this schema.
