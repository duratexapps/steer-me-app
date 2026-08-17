# Steer Me — Project Handoff / Status Summary

Written as a standalone reference for a fresh session with no memory of prior
conversations. Read this in full before making changes. This is a full
rewrite as of 2026-08-13 — the previous version was badly stale (claimed 25
migrations; there are 51, and an entire Draw Pro integration layer had been
built with no mention of it here at all).

## What this is

**Steer Me** is a team-roping partner-matching marketplace app for iOS/Android
(Expo/React Native + Supabase). Team ropers pay a producer a draw-in fee to
be randomly paired with a partner at an event; Steer Me lets them find and
lock in their own partner ahead of time, browse events, and — for producers
running events through the companion **Draw Pro** product — enter a real
draw, see live team numbers and round-by-round results, and pay/cancel
online, all from the app.

**Companion product: Draw Pro.** A separate Wix Velo application
(`roping-tools`/`ropingtools-site` repos, different codebase, different auth
system — Wix Members, not Supabase Auth) that producers use to run entries,
draws, and round results for their events. The two products integrate
one-directionally in places and bidirectionally in others; see "Draw Pro
integration" below. **If you're picking up Draw Pro work specifically, its
own handoff doc is `roping-tools/HANDOFF.md`** — this file covers Steer Me's
own codebase in depth and the integration surface at a summary level only.

## Tech stack

- Expo Router (file-based routing), React Native, React, TypeScript
- Supabase: Postgres, Auth, Storage, RLS, Edge Functions (Deno), Database
  Webhooks (`pg_net`)
- Zustand for small global client state (`session-store.ts`, `toast-store.ts`);
  TanStack Query for all server-state fetching/caching — one hook file per
  domain in `src/hooks/`
- `react-native-purchases` (RevenueCat) for subscriptions — entitlement
  synced server-side via webhook into a `subscriptions` table; RLS checks
  that table directly, not the client SDK
- Resend for transactional email (welcome email, and Supabase Auth's own
  confirmation/reset emails via custom SMTP — see "Email" below)

## Draw Pro integration — what actually connects the two products

This is the single biggest thing the previous version of this doc missed
entirely. Built across several sessions, it's now a major part of what the
app does:

- **Event discovery**: a Draw Pro producer's event cross-posts into Steer
  Me's own `events` table (`draw_pro_event_id`, `draw_pro_entry_url` columns)
  the moment they add a class, via Draw Pro's own `steerMeSync.jsw`. One-
  directional (Draw Pro → Steer Me), re-synced on class add/edit only, not
  continuously live.
- **"Enter the Draw"**: tapping this on an `EventCard` for a Draw-Pro-synced
  event creates a short-lived `entry_handoffs` row (opaque UUID, ~1hr TTL,
  re-readable until consumed — see Privacy Policy) that hands off the
  user's own contact info to Draw Pro's entry form, so they don't retype it.
  `useEntryHandoff.ts`.
- **Live team numbers / round results flow back**: once a Draw Pro producer
  runs the draw and enters results, `draw-pro-results-webhook` (Edge
  Function, shared-secret auth, `verify_jwt = false`) receives pushes from
  Draw Pro and writes into `draw_pro_entry_links` /
  `draw_pro_entry_link_teams` / `draw_pro_round_results`. `useDrawProEntries.ts`
  + `app/my-entries.tsx` render this — one card per real entry, not per
  person, since one person can land on multiple teams.
- **Extra-run charges**: if a manual pairing on the Draw Pro side gives
  someone an unplanned extra run, that surfaces as a pay/decline card in My
  Entries; the same webhook function handles the read-back
  (`getExtraRunStatuses` action) Draw Pro polls for producer-side display.
- **Cancellation**: a user can request cancellation of one specific entry
  pre-draw (`request_draw_pro_entry_cancellation` RPC, with partner-cascade
  logic); the producer confirms it on the Draw Pro side, which calls back
  into the same webhook (`confirmCancellation` action) to clean up the link.
- **Push notifications**: `send-push-notification` Edge Function, triggered
  by the same webhook flow, notifies a user when their team number/results
  land.

**Shared-secret auth on this webhook was a real, fixed bug** (2026-08-12
security review): `if (secret && header !== secret)` meant a missing/
misconfigured secret made the check a silent no-op, accepting every request
unauthenticated. Fixed to fail closed. Same bug, same fix, was also found
and fixed in `revenuecat-webhook`.

## Admin-posted events — a deliberate, temporary bootstrap feature

`app/admin-post-event.tsx` / `admin-edit-event.tsx`, gated to `is_admin`
accounts. Lets a trusted admin post a real event (from a flier) on a real
producer's behalf before that producer has any Steer Me account —
`posted_by_admin: true`, `external_producer_name` set, `producer_id: null`.
**Standing rules for anyone posting events this way** (learned the hard way,
both now enforced by habit, not code):
1. **`division_details` (structured per-class fee/format info) must be
   populated, not just the flat `description` field** — `EventCard.tsx`
   renders `division_details` inline next to each division's checkbox;
   dumping everything into `description` makes users read one giant
   paragraph to find their class. `buildDivisionDetailsPayload()` in
   `useEvents.ts`.
2. **Flag events >30 days past their end date for deletion whenever posting
   a new batch** — always confirm with the user before actually deleting.
3. A **daily scheduled routine** (`~/.claude/scheduled-tasks/team-roping-
   flier-daily-scan`) searches for new flier-backed events and reports
   candidates — never posts automatically. Hard constraint: skip anything
   without a real flier image, and skip "teaser" fliers (save-the-date
   graphics with no real cost/contact info) from the report entirely — they
   get caught naturally on a later run once the real flier is published,
   since the routine re-scans the same sources daily regardless.
4. `COMMON_CAPS` in `src/lib/matching.ts` gets extended (not rounded)
   whenever a real flier uses a division number not yet in the list — "map
   as the flier states," confirmed instruction, applied twice so far (added
   12/16.5, then 10/13).

## Business logic — `src/lib/matching.ts` is authoritative

- **Positions**: `'Header' | 'Heeler' | 'Switch'`. `canPair(a, b)`: true if
  either is Switch, else `a !== b` — classification-cap math only depends on
  the *sum*, never which end is which.
- **`COMMON_CAPS`**: `[3, 4, 4.5, 5, 5.5, 6, 6.5, 7.5, 8.5, 9.5, 10, 10.5,
  11.5, 12, 12.5, 13, 13.5, 14.5, 15.5, 16.5]` plus `OPEN_CAP = 19`. Extend
  this list when a real flier needs a number not on it — don't round.
- **Goat Roping**: `is_goat_roping` boolean, not a classification number.

## Database — 51 migrations, `supabase/migrations/0001`–`0051`

Sequential and append-only — never edit an already-pushed one, always add a
new forward-fixing migration.

**RLS philosophy unchanged from the original design**: sensitive data is
structurally unreachable, not UI-hidden. Base tables locked to owner-only
SELECT; safe-column-only views (`public_profiles`, `public_producer_profiles`)
are what everything else joins against; `SECURITY DEFINER` RPCs
(`get_request_contact`, `is_blocked_pair`, `is_favorited_by`, etc.) are the
only paths that can reveal anything sensitive, each gated on a real
relationship (accepted request, matched partner, etc.).

**Recently added/notable tables**: `entry_handoffs`, `draw_pro_entry_links`,
`draw_pro_entry_link_teams`, `draw_pro_round_results`,
`draw_pro_extra_run_charges`, `issue_reports` (in-app "report a problem,"
open to unauthenticated visitors for insert).

**Storage buckets**: `verification-screenshots` (private), `avatars`
(public), `producer-docs` (private), `need-fliers` (public), `event-fliers`
(public — Draw-Pro-synced + admin-posted event fliers), `issue-screenshots`
(private), **`email-assets`** (NEW 2026-08-13, public — static branding
assets for transactional emails, e.g. social-media icon PNGs; not per-user/
per-event scoped like the others, deliberately its own bucket).

### Accessing the live project

Project ref `ryjjwtsoeqyaiveslrat`. The Supabase CLI (`npx supabase`) **is**
available and linked in this environment now (contradicts the old version of
this doc, which claimed it wasn't installed) — `npx supabase functions
deploy <name>`, `npx supabase config push`, `npx supabase secrets list`
(masked values only, write-only — you cannot retrieve a secret's real value
once set, only overwrite it) all work directly. `SUPABASE_SERVICE_ROLE_KEY`
lives in `.env.local` (git-ignored); `EXPO_PUBLIC_SUPABASE_URL`/anon key in
`.env`.

## Email

Two systems, both via **Resend**, both using the dedicated domain
`ropingtoolsmail.com` (registered specifically because `ropingtools.com`/
`duratex-ie.com` are both on Wix nameservers, which don't support the MX/
DKIM records a sending domain needs):

1. **`send-welcome-email`** Edge Function — fires on `profiles` INSERT via a
   Database Webhook trigger (migration 0051). Branded HTML email, includes
   Facebook/X social links. **Known open issue**: social icon images
   (hosted PNGs in the `email-assets` bucket) don't render in at least one
   real-world test — an Exchange/Outlook-hosted mailbox, tested via an
   AOL-branded desktop client. Confirmed NOT a hosting/corruption problem
   (the image files themselves decode and render fine when fetched
   directly). Tried both a hosted-URL `<img src>` and a fully inline
   base64 `data:` URI — both failed identically in that one test client.
   Currently reverted to the hosted-URL version (the only form Outlook can
   ever render, since Outlook's Word-based engine has no `data:` URI
   support at all — that part is settled). **Not yet confirmed working or
   broken on a mainstream client** (Gmail, Apple Mail) — the test mailbox
   available during development happens to be an unusual Exchange+AOL-client
   combination, not representative of most real users. Worth a clean test
   on a normal Gmail/Apple Mail address before concluding anything further.
2. **Supabase Auth's own SMTP** (confirmation emails, password resets) —
   configured via `supabase/config.toml`'s `[auth.email.smtp]` block,
   pointed at Resend (`smtp.resend.com`), same domain. `enable_confirmations`
   is now **on** (was off — a real security gap, fixed 2026-08-12: leaving
   it off meant anyone could sign up with any email address unverified).
   Minimum password length raised 6→8, `letters_digits` requirement added
   (matches what the sign-up UI already enforced client-side, closing a
   server-side gap that could be bypassed).

**New-user growth stats**: `get-user-stats` Edge Function (new, 2026-08-12) —
public, `verify_jwt = false`, but safe: only ever returns pre-aggregated
counts (total/today/week/month + a 30-day daily breakdown), never raw rows
or PII. Backs a small live dashboard (a Claude Artifact) the user bookmarks
on their phone rather than asking in a session each time.

## RevenueCat / subscriptions & payments status

- RevenueCat account set up, entitlement named "Steer Me," public/secret API
  keys configured (`REVENUECAT_SECRET_API_KEY`,
  `REVENUECAT_WEBHOOK_AUTH` — both Supabase secrets).
- **Google Play side is the current blocker**: need to locate Play Console's
  "API access" section to connect a service account for real purchase
  verification. Confirmed it's NOT under the account-level "Users and
  permissions" page, and NOT under "Automations" — still not definitively
  located as of this writing. The user's own in-Console AI assistant
  suggested a "Setup → API access" path that doesn't appear to exist in the
  current Console layout either. Worth trying Play Console's own search
  bar with the exact phrase, or filing a support ticket (one was submitted
  2026-08-12, response pending).
- Real purchase verification is NOT live yet — this blocks it.

## Security posture (audited 2026-08-12, findings fixed)

A real review surfaced and fixed: the two fail-open webhook secret checks
(above), the Auth confirmation/password-policy gaps (above), and confirmed
several things were already correct (RLS-gated contact info via
`get_request_contact`, the guest-entry rate-limit hash is correctly
non-cryptographic since it's only used for throttling not auth decisions,
service-role key never touches client code). If doing another security pass,
start by re-checking anything added since 2026-08-12 against the same
checklist (auth on every write path, fail-closed secret checks, no PII in
public-reachable functions).

## Dev environment

- `npx expo start` for the dev server; `npx tsc --noEmit` after non-trivial
  changes.
- Type-check and the Supabase CLI are both confirmed working directly in
  this environment as of 2026-08-13.

## Screen inventory (`app/`) — current, not the stale v1 list

Auth: `(auth)/role-select.tsx`, `create-account.tsx`, `sign-in.tsx`,
`sign-up.tsx`, `forgot-password.tsx`, `tour.tsx`.
Root-level: `confirm-email.tsx`, `reset-password.tsx`, `account-settings.tsx`,
`legal.tsx`, `referral.tsx`, `report-issue.tsx`, `subscription.tsx`,
`admin-post-event.tsx`, `admin-edit-event.tsx`, `my-entries.tsx` (Draw Pro
entries — new), `my-favorites.tsx`, `my-requests.tsx`, `blocked-users.tsx`,
`events.tsx`, `create-event.tsx`, `create-need-post.tsx`, `edit-profile.tsx`,
`update-classification.tsx`, `producer.tsx`.
Tabs: `index.tsx` (Home), `browse.tsx`, `post.tsx`, `profile.tsx`.

Hooks — one per domain, all TanStack Query: `useMyProfile`,
`useEligiblePartners`, `usePartnerRequests`, `useBlocking`, `useReporting`,
`useIssueReports`, `useProducerProfile`, `useEvents`, `useRatings`,
`useSubscriptionStatus`, `useNeedPosts`, `useFavorites`,
`useDrawProEntries`, `useEntryHandoff`, `useGoatRopingInterest`,
`useReferralStats`, `useTownDistances`, `useResponsiveColumns`.

## Scope notes carried forward from the original build

Still true, still worth checking before building: **Feed, Groups, and
in-app push-style Notifications (bell icon) are explicitly excluded from
scope** — ask before building even if a prototype/mockup shows them.
Favorites stays narrowly scoped (star-icon save + Post-a-Need audience
targeting, no Home tile). Map/geocoding and OCR/flier-auto-extraction remain
deferred, though flier contact-info extraction (`extract-flier-contact-info`
Edge Function) was later built for the admin-post-event flow specifically —
that's a narrower, different thing than general OCR auto-fill.

## Pending / open items, ranked by what's actually blocking something

1. **RevenueCat/Play Console "API access"** — blocks real payment
   verification. See above.
2. **Welcome email social icons** — not confirmed working on a mainstream
   client. Test on real Gmail/Apple Mail before spending more time on it.
3. **Task from the original per-entry-tracking work**: "Verify end-to-end
   with a real multi-entry test" — never explicitly closed out.
4. **Producer-contact-without-exposure design** (flagged, not yet designed):
   how to let Steer Me users contact a producer without exposing them to
   spam/nonsense, especially as the user base grows from an active content-
   marketing push that just started.
5. Draw Pro's own free-trial/anti-abuse gate is built but deliberately
   unpublished — not a Steer Me item, but if a Draw Pro publish ever needs
   to happen for an unrelated reason, check `roping-tools/HANDOFF.md`
   first, since that gate would go live with it.
