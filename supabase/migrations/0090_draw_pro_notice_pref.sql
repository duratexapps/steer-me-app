-- NEW, 2026-10-12 - one setting for how a rider hears about their Draw Pro
-- entries, replacing the two toggles (push on/off and "also email me").
--   both  push AND email   (the default; NULL means both)
--   push  push only (Draw Pro still sends one backup email if a push is known to fail)
--   email email only: no push is sent
--   none  neither: no push, no email; My Entries still records teams, results and standings
-- push_opted_out stays the device-level switch the app honours (clears the
-- token and stops automatic registration); the app sets it together with this
-- column: email/none -> opted out, both/push -> not opted out.
-- email_draw_pro_notices is kept in step by the app for Draw Pro's older rule
-- and is no longer the source of truth.
alter table public.profiles
  add column draw_pro_notice_pref text
    check (draw_pro_notice_pref in ('both', 'push', 'email', 'none'));

comment on column public.profiles.draw_pro_notice_pref is
  'How the user wants Draw Pro notices: both (default, NULL = both), push, email or none. See migration 0090.';

-- Only carry over choices the user actually made; everyone else stays NULL
-- (= both). Opted out of push -> they hear by email. Email opt-in -> both.
update public.profiles set draw_pro_notice_pref = 'email' where push_opted_out = true;
update public.profiles set draw_pro_notice_pref = 'both'
  where email_draw_pro_notices = true and draw_pro_notice_pref is null;
