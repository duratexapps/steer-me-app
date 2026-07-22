# Steer Me — Project Handoff / Status Summary

Written as a standalone reference for a fresh Claude Code session with no
memory of prior conversations. Read this in full before making changes.

## What this is

**Steer Me** is a team-roping partner-matching marketplace app for iOS/Android,
built with Expo (React Native) + Supabase. Team ropers pay a producer a
draw-in fee (~$40) to be randomly paired with a partner at an event; Steer Me
lets them find and lock in their own partner ahead of time instead, for a
flat subscription fee.

**Source of truth for design/copy**: an HTML/CSS/JS clickable prototype
(originally `steer-me.html`, later restyled as `steer-me_2.html` — the v2
visual redesign). Four legal/policy docs (Privacy Policy, Terms of Service,
Community Guidelines, Producer Guidelines, Pricing & Fees) also exist and
have been referenced/edited during the build. None of the prototype HTML
files are checked into this repo; they were supplied by the user in chat.

## Scope: what's in v1, what's explicitly excluded

**In scope (built):** role selection (athlete/producer/both), Global Handicap
classification verification, Browse partners, Post a Need (with real event
details + audience targeting), My Requests (tap-to-contact after accept),
Profile (+ edit profile, favorites management), RevenueCat subscription
paywall, producer sign-up + verification, Create Event, athlete-facing Events
browsing (attending + partner matching), event rating system, report/block/
3-strike moderation, a contextual in-app help system, and Favorites (scoped
narrowly — see below).

**Explicitly excluded from v1 — do not build unless the user asks again:**
**Feed, Groups, and in-app push-style Notifications** (bell icon, notification
center). These exist in the full HTML prototype but have been deliberately
scoped out twice now (once at project start, once again when a later prototype
file reintroduced them). If a future prototype file shows these again, ask
before implementing — don't build them just because they appear in a mockup.

**Favorites — deliberately narrow scope:** there is NO Favorites tab on Home
and NO "favorite partners" home tile, even though the prototype has one. The
feature is: a star icon on partner cards (Browse, My Requests-accepted) to
save someone, used specifically to narrow who can see a "Post a Need"
listing (Everyone / My Favorites / Select Favorites). A `/my-favorites`
screen (reached via a "Manage favorites" button in Profile, not Home) lets
the user view/remove favorites. If asked to "add favorites back," don't
default to a Home tile — confirm the surface first.

**Map/geocoding:** explicitly deferred at the user's own request (asked, then
chose to hold off). Not built. `expo-location`'s free `geocodeAsync()` and
`react-native-maps` (needs Google Maps API key + EAS dev build) were
researched but nothing was implemented.

**OCR/flier auto-fill:** explicitly deferred. Fliers are uploaded and shown to
other users, but nothing extracts structured data from them.

## Tech stack

- Expo Router (file-based routing), React Native 0.86, React 19.2.3, TypeScript
- Supabase JS v2: Postgres, Auth, Storage, RLS, Database Webhooks (`pg_net`)
- Zustand (`src/state/session-store.ts`, `toast-store.ts`) for small global
  client state; TanStack Query for all server-state fetching/caching
- `react-native-purchases` (RevenueCat) for subscriptions — entitlement is
  synced server-side via webhook into a `subscriptions` table; RLS checks
  that table directly, not the client SDK, so a modified client can't bypass
  paid gates
- `expo-image-picker`, `expo-location`, `@react-native-community/datetimepicker`
- Fonts: Playfair Display (700/900), JetBrains Mono, Work Sans — all via
  `@expo-google-fonts/*`, loaded in `app/_layout.tsx`
- `expo-linear-gradient` for the Tag badge's brass gradient

## Design system (v2 — current)

The v1 prototype used a leather-brown/rust-orange/rope-tan palette with a
condensed stencil display font and dashed borders everywhere. That whole
system was replaced in a "v2 redesign" pass. **`src/theme/theme.ts` is the
single source of truth** — read it directly rather than trusting a summary,
but as of now:

- **Colors**: `espresso` #1E140F (primary dark, was "leather"), `espressoDark`
  #120C08, `brass` #A9812E (accent, was "rust"), `brassLight` #C9A54F, `saddle`
  #7C6448 (secondary/muted, was "rope" — also now used for muted body text
  that used to be hardcoded hex), `bone` #F4EFE4 (background, was "cream"),
  `ink` #2A2420 (body text), `oxblood` #5C2430 (danger/alert contexts only —
  currently just `Button`'s `danger` variant), `placeholder` #A08A6E (input
  placeholder text specifically), `tan`/`tanLight`/`green` unchanged in role.
- **Typography**: Playfair Display replaces the old Staatliches stencil font.
  `fonts.display` = weight 900 (ScreenHeader titles + the Tag badge number
  only). `fonts.displayBold` = weight 700 (everything else Playfair: in-content
  h2 headers, modal titles, Home hero name). Body stays Work Sans, mono stays
  JetBrains Mono for classification numbers/stats.
- **Signature badge (`Tag.tsx`)**: redesigned as an "engraved brass medallion"
  — `expo-linear-gradient` gold-to-brass fill, a second darkening gradient
  layer approximating a CSS inset shadow (RN has no true inset shadow), a
  translucent inner ring, dark border, Playfair 900 serif number. No longer
  rotated, no longer a flat dashed-border circle.
- **Borders**: all dashed borders converted to solid brass hairlines
  (dropzones/avatars: 1.5px solid brass; banners/divider notes/rate-prompts:
  1px solid brass).
- **Corners tightened**: `radii.md` 8→5, `radii.lg` 10→6, `radii.xl` 12→8.
  `radii.sm`/`pill`/`circle` unchanged.

If asked to redesign again, do the same audit this session did: grep for
`colors.rust`/`colors.leather`/etc (old names, should return nothing now),
grep for hardcoded hex colors bypassing the theme, grep for
`borderStyle: 'dashed'`, grep for hardcoded `borderRadius: N` not using a
`radii.*` token.

## Business logic — read `src/lib/matching.ts` for the authoritative version

- **Positions**: `'Header' | 'Heeler' | 'Switch'` (Switch = "Switch Ender" in
  UI copy, via `formatPosition()`). A user picks their own position and can
  edit it any time from Edit Profile.
- **`canPair(a, b)`**: `true` if either is Switch, else `a !== b`. This one
  function is the entire pairing-eligibility rule — classification-cap math
  only depends on the *sum* of two numbers, never which end is which, so a
  Switch Ender is compatible with everyone including another Switch Ender.
- **Classification caps**: `COMMON_CAPS = [3, 4, 4.5, 5, 5.5, 6, 6.5, 7.5, 8.5,
  9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5]` plus `OPEN_CAP = 19` (modeled as a
  cap, not a special case — the max possible team is #19 since headers max
  at 9 and heelers max at 10). `DIVISION_OPTIONS` = both lists combined; both
  Create Event and Post a Need reuse this exact list so a producer can never
  create a division an athlete can't post against.
- **Goat Roping**: a distinct boolean (`is_goat_roping`), not a classification
  number — youth event, not bound by the number system, shown to everyone
  interested regardless of position/classification.
- **Future requirement flagged but not yet built**: once the app processes
  entries on producers' behalf, contestants will need to declare who's
  heading and who's heeling at entry time — likely only matters for Switch
  Enders who match. Documented in a commit message, not yet implemented (no
  entry-processing feature exists yet at all).

## Database (Supabase) — 25 migrations, `supabase/migrations/0001` through `0025`

Migrations are **sequential and append-only** — never edit an already-pushed
one, even for a typo found minutes later; always add a new forward-fixing
migration.

**RLS philosophy**: sensitive data is structurally unreachable, not just
UI-hidden. Base tables (`profiles`, `producer_profiles`) are locked to
owner-only SELECT; safe-column-only views (`public_profiles`,
`public_producer_profiles`) are what everything else joins against; a
`SECURITY DEFINER` RPC (`get_request_contact`) is the only path that can ever
reveal contact info or a minor's guardian contact, gated on accepted-request
status. The same `SECURITY DEFINER` pattern is used for `is_blocked_pair`
(blocks) and `is_favorited_by`/`is_selected_for_post` (favorites-gated Post a
Need visibility) — needed because a plain subquery in an RLS policy is still
subject to the *other* table's RLS as evaluated for the current caller, which
would silently return zero rows for exactly the cases that need to work.

**Key tables**: `profiles` (1:1 with `auth.users`; includes `position` now
`'Header'|'Heeler'|'Switch'`), `blocks`, `partner_requests` (unique on
requester/recipient/division/event, NULL-coalesced for Goat Roping),
`producer_profiles`, `events` (denormalized fields, `divisions numeric(3,1)[]`,
auto-publish trigger gated on producer verification), `event_attendance`,
`event_ratings` (eligibility trigger, 30-day window, 3-rating minimum to show
an average), `event_reports`/`user_reports` (3-strike system; "soliciting a
minor" bypasses the strike count and suspends immediately via a Database
Webhook), `subscriptions` (RevenueCat sync cache, service-role-only writes),
`need_posts` (Post a Need listings — denormalized event_date/name/producer_
name/location fields, optional `event_id` link to a real `events` row,
`flier_path`, `facebook_link`, and now `visibility` +
`need_post_visible_to` for audience targeting), `favorites` (one-directional,
mirrors `blocks` table pattern exactly).

**Storage buckets**: `verification-screenshots` (private, owner-only —
matched-partner access is a *separate* narrow RLS addition, see migration
0022), `avatars` (public read), `producer-docs` (private), `need-fliers`
(public read).

**A recurring bug class already fixed** (migrations 0016–0018): several
owner-identity columns (`partner_requests.division`, `blocks.blocker_id`,
etc.) had no `default auth.uid()`, so client inserts silently failed RLS.
When adding any new owner-scoped table, set `default auth.uid()` on the
owner column from the start (see `favorites.user_id` in migration 0025 for
the correct pattern).

### Accessing the live Supabase project

- Project ref: `ryjjwtsoeqyaiveslrat` (region us-east-2).
- `.env` has the anon key + URL only (safe to bundle).
- A Supabase Management API **personal access token** (`sbp_...`) is stored
  in the macOS Keychain from an earlier `supabase login`, even though the
  Supabase CLI binary itself is not installed/on PATH in this environment.
  Retrieve it with:
  ```
  security find-generic-password -s "Supabase CLI" -a "supabase" -w
  ```
  Use it as a Bearer token against `https://api.supabase.com/v1/projects/ryjjwtsoeqyaiveslrat/database/query`
  (POST, JSON body `{"query": "<sql>"}`) to run arbitrary SQL — this is how
  every migration in this project has been pushed and verified, since the
  CLI isn't available locally.
- **Smoke-testing discipline** (follow this for any schema/RLS change):
  create real throwaway accounts via `POST {url}/auth/v1/signup` (auto-
  confirms, returns a usable `access_token` directly), insert profiles via
  authenticated REST calls, grant subscription entitlement via a direct SQL
  `insert into subscriptions` through the Management API (service-role key
  is not available in this environment — use the Management API's SQL
  execution instead of the admin REST API for privileged operations), run
  the actual positive/negative RLS scenarios via REST as each test user, then
  clean up with `delete from auth.users where id in (...)` via the Management
  API (cascades). Always finish with a count query confirming demo data (11
  seed athletes + 1 seed producer + the real user's own account,
  `judlin10@gmail.com`) is untouched.

## Dev environment quirks

- Node was manually installed to `~/.local/node-v22.14.0` (Homebrew failed
  building from source on this macOS 13 machine) — symlinked into
  `~/.local/bin`. Always `export PATH="$HOME/.local/bin:$PATH"` before
  running `npm`/`npx` in a fresh shell if it's not already on PATH.
- Dev server workflow: `pkill -f "expo start"` then
  `nohup npx expo start --clear > /tmp/expo-dev.log 2>&1 & disown`, verify
  with `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081`
  (expect `200`), then the user tests live via Expo Go on their phone over
  LAN. Always `--clear` after a font/theme change since Metro's cache can
  serve stale font weights.
- Type-check with `npx tsc --noEmit` after any non-trivial change — this has
  caught real mistakes (missing renames, broken imports) throughout the
  build and is fast enough to run after every batch of edits.

## Current git state

**Last commit**: `c1f10d2` "Apply v2 visual redesign: espresso/brass palette,
Playfair Display, brass medallion badge" (24 migrations at that point).

**Uncommitted work sitting in the working tree right now** (not yet
committed — a fresh session should either commit this or ask the user
before doing anything else with it):
- Home screen action-tile reorder (Browse events → Browse ropers → Post a
  need → My requests → Producer tools).
- Favorites feature: `supabase/migrations/0025_favorites.sql`,
  `src/hooks/useFavorites.ts`, visibility-targeting UI in
  `create-need-post.tsx`, star toggles in `PartnerCard.tsx`/`my-requests.tsx`,
  `app/my-favorites.tsx`, a "Manage favorites" button in Profile.
- Contextual help system: `src/lib/help-content.ts`, `src/components/
  HelpModal.tsx`, an `onHelp` prop added to `ScreenHeader`, wired into every
  screen's header (including the two conditional Producer sub-components and
  the custom Home hero, which don't use the shared `ScreenHeader`).

The migration (`0025_favorites.sql`) **has already been pushed to the live
Supabase project and smoke-tested** with real throwaway accounts (all three
visibility modes verified correct, including the negative case of a
general favorite who wasn't selected for a specific "selected"-visibility
post correctly not seeing it). Only the git commit is outstanding — the
schema itself is live.

## Screen inventory (`app/`)

Auth: `(auth)/role-select.tsx` (entry point, logo + big title), `create-
account.tsx`, `sign-in.tsx`, `sign-up.tsx` (athlete verification + Global
Handicap upload).

Tabs (`(tabs)/`): `index.tsx` (Home), `browse.tsx`, `post.tsx` (Post a Need
list), `profile.tsx`.

Pushed screens: `create-need-post.tsx`, `edit-profile.tsx`, `update-
classification.tsx`, `my-requests.tsx`, `my-favorites.tsx`, `blocked-users.tsx`,
`events.tsx`, `producer.tsx` (sign-up form vs. dashboard, conditional),
`create-event.tsx`, `subscription.tsx`.

Shared components (`src/components/`): `PartnerCard`, `NeedPostCard`,
`EventCard`, `ReportModal`, `RatingModal`, `PhotoChooserSheet`, `HelpModal`,
and `ui/` primitives (`Button`, `TextField`, `DateField`, `Pill`, `Tag`,
`Checkbox`, `DividerNote`, `ActionTile`, `ScreenHeader`, `ToastHost`,
`ToggleRow`).

Hooks (`src/hooks/`): one file per domain (`useMyProfile`, `useEligible
Partners`, `usePartnerRequests`, `useBlocking`, `useReporting`,
`useProducerProfile`, `useEvents`, `useRatings`, `useSubscriptionStatus`,
`useNeedPosts`, `useFavorites`) — all TanStack Query, following the same
pattern: fetch a base-table row set, then a second query against
`public_profiles`/`public_producer_profiles` to join in safe display fields
client-side (since the views aren't FK-embeddable via PostgREST).

## If resuming a redesign, feature request, or bug fix

1. Read `src/theme/theme.ts` directly — don't trust any prior summary of its
   exact values, they may have changed.
2. Check `supabase/migrations/` for the highest number before adding a new one.
3. Retrieve the Management API token from Keychain (command above) before
   assuming you need to ask the user for credentials.
4. Follow the smoke-test-with-throwaway-accounts discipline for any RLS
   change — it has caught real bugs every time it's been used.
5. Don't build Feed/Groups/Notifications, and don't expand Favorites beyond
   its current narrow scope, without asking first — both have been
   explicitly, repeatedly scoped out/down in this project's history.
6. Run `npx tsc --noEmit` after every non-trivial batch of edits.
