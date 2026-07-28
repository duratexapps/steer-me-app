# Steer Me — Supabase operations runbook (v1)

v1 has no admin app. These are the manual steps a real human (you) does via
the Supabase Studio dashboard until an admin panel exists. This is a known,
accepted gap for v1 - see the build plan's "necessary deviations" section.

## One-time project setup

1. Create the Supabase project, then link this repo to it:
   ```
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
2. Copy `.env.example` to `.env` and fill in your project's URL/anon key
   (Project Settings -> API) and your RevenueCat public SDK keys.
3. Deploy all three Edge Functions:
   ```
   npx supabase functions deploy revenuecat-webhook
   npx supabase functions deploy ban-suspended-user
   npx supabase functions deploy verify-classification-card
   ```
4. Set secrets for the Edge Functions (Project Settings -> Edge Functions ->
   Secrets, or via CLI). Generate both into shell variables and reuse the
   variables everywhere below - don't retype/copy the raw value by hand
   more than once, a single mistyped character here silently breaks the
   whole webhook (it did during development; see the vault step below for
   where the same value has to match again):
   ```
   DB_SECRET=$(openssl rand -hex 24)
   RC_SECRET=$(openssl rand -hex 24)
   npx supabase secrets set DB_WEBHOOK_SECRET="$DB_SECRET" REVENUECAT_WEBHOOK_AUTH="$RC_SECRET"
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected - you
   don't need to set those yourself.
4.5. **NEW, added 2026-07-27** - set the Anthropic API key that
   `verify-classification-card` needs to actually check uploaded cards:
   ```
   npx supabase secrets set ANTHROPIC_API_KEY="<your key from console.anthropic.com>"
   ```
   Until this is set, sign-up/classification-update still work (the
   function returns `skipped: true` rather than blocking anyone), but no
   card is ever actually checked - every profile gets
   `needs_manual_review = true` instead. Also requires `SUPABASE_ANON_KEY`
   to be available to the function for verifying the calling user's own
   session - this is auto-injected the same way `SUPABASE_URL`/
   `SUPABASE_SERVICE_ROLE_KEY` are, no separate step needed.
5. In the RevenueCat dashboard (Project Settings -> Integrations ->
   Webhooks): set the webhook URL to your deployed `revenuecat-webhook`
   function URL, and set the "Authorization header" value to the same string
   you used for `REVENUECAT_WEBHOOK_AUTH` above.
6. `profiles.suspended -> ban-suspended-user` is wired via a `pg_net`
   trigger in migration `0014_ban_suspended_webhook.sql` (no manual Studio
   Database Webhook click-through needed) - but the trigger reads its target
   URL and shared secret from Supabase Vault rather than having them
   hardcoded in a committed file, so run this once via the SQL Editor after
   `db push`:
   ```sql
   select vault.create_secret('$DB_SECRET', 'db_webhook_secret'); -- paste the actual value, not the variable name
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/ban-suspended-user', 'ban_suspended_user_function_url');
   ```
   Until both vault secrets exist, the trigger no-ops (profile suspension
   itself still works; only the login-ban side effect is skipped).

## Turning on email confirmation for new sign-ups

Added 2026-07-25. "Confirm email" was left OFF in this project deliberately
up to this point - not an oversight, but because there was no deep-link
handler in the app to receive the confirmation redirect, meaning a user
who clicked the email link would land on a generic web page instead of
back in the app. That handler now exists (`app/confirm-email.tsx`), so
this can be turned on:

1. Supabase Studio -> Authentication -> Settings -> under "User Signups,"
   enable **Confirm email**.
2. Authentication -> URL Configuration -> add the app's deep link to the
   **Redirect URLs** allowlist. The exact value depends on how the app is
   built/run:
   - Expo Go / dev client during development: `exp://<your-dev-server>/--/confirm-email`
     (varies per machine/network - `Linking.createURL('confirm-email')`,
     called from `create-account.tsx`, always generates the correct value
     for whatever's currently running, but the Supabase dashboard needs
     the value added ahead of time, not discovered at runtime).
   - A real standalone/production build: `steerme://confirm-email` (the
     app's scheme, set in `app.json`, plus the same path).
   - Safest for local testing: temporarily add a wildcard like
     `steerme://**` and `exp://**` while testing, then tighten to exact
     URLs before shipping.
3. Confirm which Auth flow this project uses (Authentication -> Settings
   -> look for "Auth Flow Type" or similar - PKCE vs. implicit).
   `app/confirm-email.tsx` handles both, so no code change should be
   needed either way, but worth knowing which one you're actually
   testing against if something doesn't redirect correctly.
4. Test end to end: sign up with a real email address you can check,
   confirm the "check your email" toast appears (not an immediate
   session), open the confirmation email, tap the link, and confirm it
   lands on the "Confirming your email..." screen and then drops you
   into the app already signed in.

## Setting up real subscriptions (RevenueCat + App Store/Google Play)

None of this exists yet as of this build - it's an external, account-level
setup outside this codebase that only you can do (Apple/Google require
identity and business verification). Until it's done, the Subscription
screen correctly shows "not available yet" and every paid-gated action
(Browse requests, event attendance) is unpurchasable, which is expected.

1. Enroll in the Apple Developer Program ($99/year) and/or a Google Play
   Console account ($25 one-time), depending which platforms you're
   targeting.
2. Create your app's listing in App Store Connect / Google Play Console,
   then create two auto-renewable subscription products there (annual
   $39.99, monthly $6.99) - the exact product IDs don't matter as long as
   they're consistent with what you configure in RevenueCat next.
3. Create a RevenueCat account and project, connect it to your App Store
   Connect / Google Play Console app, import the two products as
   Packages inside an Offering, and create an Entitlement (any identifier)
   that both packages unlock.
4. RevenueCat dashboard -> Project Settings -> API Keys: copy the
   Apple/Google public SDK keys into `.env` as
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
   **NEW, added 2026-07-27**: also copy the **secret** API key (same
   page, different key - never put this one in `.env`/the client bundle)
   and set it as a Supabase secret:
   ```
   npx supabase secrets set REVENUECAT_SECRET_API_KEY="<the secret key>"
   ```
   This is what lets `revenuecat-webhook` grant the refer-a-friend reward
   (a real free month via RevenueCat's Promotional Entitlements API) -
   see that function's file header. Without it, referrals still track
   correctly, the reward step just skips with a logged reason instead of
   failing the whole webhook.
5. **NEW, added 2026-07-27**: confirm the actual Entitlement identifier
   you created in step 3 above matches `RC_ENTITLEMENT_ID` in
   `supabase/functions/revenuecat-webhook/index.ts` (currently a
   placeholder, `'premium'`) - update that constant and redeploy the
   function if your real entitlement is named differently.
6. Wire the webhook (see step 5 in "One-time project setup" above) so
   purchases actually sync into the `subscriptions` table.
7. `react-native-purchases` auto-mocks itself inside Expo Go (no real
   purchases, but the UI/flow won't crash) - real purchase testing needs an
   EAS development build (`eas build --profile development`) installed on
   a physical device, plus a sandbox/test account on the relevant store.

## Reviewing a producer for verification

Producers start `pending`. Athletes never see a producer's events until
either the producer is verified at insert time (new events auto-publish) or
you manually publish an existing event (see below).

1. Studio -> Table Editor -> `producer_profiles`.
2. Check `verification_doc_path` against the `producer-docs` storage bucket
   (Storage -> producer-docs -> `{producer_id}/...`) to confirm the uploaded
   business license / insurance certificate / affiliation letter is genuine.
3. Set `verification_status` to `verified` (or `rejected`). This does not
   retroactively publish their existing pending events - see below.

## Publishing an event from an unverified (or newly-verified) producer

1. Studio -> Table Editor -> `events`.
2. Find the row, set `status` to `published`.

## Reviewing a personal-conduct report (user_reports)

1. Studio -> Table Editor -> `user_reports`, filter `status = open`.
2. Read `offense`, `description`, and `content_ref` to find the reported
   content.
3. If the offense is `Soliciting a minor`, the target profile was already
   suspended immediately on submission (pending your review) - this table
   review determines whether that suspension should stick (mark `confirmed`)
   or be reversed (mark `dismissed`, then manually set that profile's
   `suspended` back to `false` in `profiles` if you're lifting it).
4. Otherwise, set `status` to `confirmed` (counts as a strike) or `dismissed`
   (does not). On a user's 3rd `confirmed` row, a trigger automatically
   scrubs their profile and flips `suspended = true`, which in turn fires the
   `ban-suspended-user` webhook and locks their login. You do not need to do
   anything else for the 3rd strike - it's fully automatic once you confirm
   the 3rd report.
5. **NEW, added 2026-07-27 - treat `Fake profile or classification` reports
   as higher priority than the other offense categories, real money and a
   producer's own liability are at stake.** This offense means someone is
   suspected of entering under a classification (or an identity) that
   isn't really theirs - e.g., a #9 heeler competing as a #4.5 by using
   another real person's name and Global Membership ID, since Global's own
   classification lookup has no photo/biometric check tying an ID to the
   person using it. This is exactly the kind of thing a producer could get
   sued over if a sandbagger wins entry fees/payout that should have gone
   to a legitimately-classified team. Don't let these sit in the same queue
   as e.g. a foul-language report - review them first, and see the next
   section for what to actually check.

## Reviewing a suspected identity/classification conflict

**NEW, added 2026-07-27.** Two ways this surfaces:

**A) A sign-up or classification-update was blocked** by migration 0031's
unique constraint on `global_membership_id` (the user saw "That Global
Membership ID is already registered to another Steer Me account..."). This
means two different Steer Me accounts tried to claim the same real
membership ID - one of them is either a genuine mistake (rare) or someone
using another real person's identity.

1. Studio -> Table Editor -> `profiles`, filter by the `global_membership_id`
   in question to find the EXISTING account that already holds it.
2. Compare `full_name` and `verification_screenshot_path` (Storage ->
   verification-screenshots) on the existing account against what the
   blocked person claims about themselves, if they've contacted support.
3. If the existing account's name/screenshot doesn't match who actually
   owns that membership ID (i.e., it was the fraudulent one), treat this as
   a confirmed `Fake profile or classification` violation even without a
   separate user_report - suspend it the same way a 3rd-strike does
   (`suspended = true`, set `suspended_reason`), and let the real owner know
   they can now sign up with their own ID.
4. If you can't tell from the screenshot alone, this is genuinely a
   real-world identity question software can't fully resolve - use
   judgment, and lean on the fact that people who actually know both
   individuals (the reporting contestant/producer) are usually a faster,
   more reliable signal than anything in this table.

**B) A `user_reports` row with offense `Fake profile or classification`**
(see the priority note above). Same investigation as above, starting from
`target_user_id` instead of a membership-ID lookup - check their
`verification_screenshot_path` and whether their claimed name/classification
plausibly matches it, and weigh the reporter's description.

**What this constraint does NOT solve, so don't over-trust it**: it stops
two accounts from sharing one ID going forward, but it doesn't verify that
the FIRST account to claim an ID is actually that person - someone could
still be the first to register under a stolen identity before the real
person ever signs up. The constraint mainly guarantees that if the real
person EVER tries to sign up later, the conflict becomes visible and
investigable, rather than staying invisible indefinitely.

## Resetting an account's card verification (demo/test data cleanup)

**NEW, added 2026-07-28.** Real scenario: the developer used their own
real Global Handicap card as a live demo for several test accounts.
Confirmed via a byte-for-byte hash comparison of the actual stored
images (not just matching `global_membership_id`) that 3 accounts had
genuinely reused the same real card image, not just similar-looking
data - a plain search by name or ID alone would have missed one of them,
since it had a different (but still identical-content) re-upload.

1. Studio -> Table Editor -> `profiles`, or via the Storage API - compare
   `verification_screenshot_path` file contents (not just names/sizes) to
   find every account using the same real image, since two different
   uploads of the same physical card won't necessarily have identical
   file sizes even though the underlying card is the same.
2. For each affected account, set `global_membership_id`,
   `global_classification`, `header_classification`,
   `heeler_classification`, and `verification_screenshot_path` all to
   `null`, and `needs_manual_review` to `true` (flags it for a human to
   confirm the person actually re-verifies with their own real card next
   time, rather than this just being silently forgotten).
3. Delete the actual file at the old `verification_screenshot_path` from
   the `verification-screenshots` storage bucket - don't just null the
   database reference, or the real card image keeps sitting under a
   stranger's account path indefinitely.
4. The affected user will now see a "Verify your classification" banner
   on Browse (or "Finish verifying your classification" if they're a
   Switch Ender) prompting them to re-upload for real - this only works
   because that banner checks for a missing classification number, not
   just a missing screenshot, so the reset is actually visible to them,
   not just a silent database change.

**Important, directly caused by this reset:** an account with its own
classification cleared will see ZERO eligible partners no matter what
class/cap they browse with, since `canPair()` (src/lib/matching.ts)
requires BOTH people's numbers to exist - your own missing number fails
every comparison, regardless of who else is in the pool. This looks
identical to "all the test users are gone" from the browsing account's
point of view, but isn't - it's a symptom of that account specifically
needing to re-verify (which is the intended behavior/exactly what this
section exists to trigger). Confirmed live 2026-07-28: reported as
"no available users to match with," root cause was the browsing
account's own header/heeler numbers being null post-reset, not a data
loss issue - see the next section for the actual test-user pool, which
was intact throughout.

## Demo/test athlete pool for Browse & partner matching

**NEW, added 2026-07-28.** 20 test profiles were added via
`/tmp/seed_test_users.py` (one-off script, not committed - the pattern
below is what matters, not the script itself) to give Browse a realistic
spread of classifications to demo against, on top of the ~11 that
already existed. Covers the full valid range for each end
(Header 1.5-8.5, Heeler 1.5-9.0, plus 4 Switch Enders with distinct
header/heeler numbers) so every common cap in `COMMON_CAPS`
(src/lib/matching.ts) returns a different, realistic set of matches
rather than either "everyone" or "no one."

- Real auth.users rows were created via the Admin API
  (`POST /auth/v1/admin/users`, service role key, `email_confirm: true`)
  - required because `profiles.id` is a real FK to `auth.users(id)` with
    `on delete cascade` (migration 0002) - a bare profiles-table insert
    with a made-up UUID would violate that constraint.
  - Emails follow the pattern `demo-<slug-of-name>@steerme.test`,
    consistent with the existing `test1@steerme.test`-style convention
    already used by earlier test accounts, so they're clearly
    identifiable as demo data and never route to a real inbox.
- `global_membership_id` follows the same `G-<first 8 hex chars of the
  profile's own UUID>` pattern already used by the existing test pool
  (e.g. `G-7D58C964` for Jesse Marlow) - satisfies the
  `profiles_global_membership_id_unique` partial index (migration 0031)
  automatically, since every UUID is distinct.
- `avatar_url` left `null` for all of them, matching every other test
  profile in this pool - Profile/Browse show a classification-number Tag
  instead when there's no avatar, which reads fine and needed no new
  image assets.
- 2 are marked `is_minor: true` (Kash Renner, Paisley Kirkland),
  mirroring the one pre-existing minor test profile (Rylan Combs), so
  guardian-managed-profile UI has real data to demo against too.
- Deleting a demo account is one call: `DELETE
  /auth/v1/admin/users/<id>` cascades to its `profiles` row
  automatically (confirmed live before running the batch) - no separate
  profile-row cleanup needed if these ever need to be removed.

## Reviewing profiles flagged `needs_manual_review`

**NEW, added 2026-07-27**, alongside the `verify-classification-card` Edge
Function (migration 0032). Every profile created or updated while that
function couldn't actually run - the Anthropic API was down, not yet
configured (missing `ANTHROPIC_API_KEY`, see the one-time setup section
above), or returned something unparseable - gets `needs_manual_review = true`
instead of silently being treated as verified.

1. Studio -> Table Editor -> `profiles`, filter `needs_manual_review = true`.
2. Manually compare `full_name`, `global_membership_id`,
   `global_classification`/`header_classification`/`heeler_classification`,
   against the image at `verification_screenshot_path` (Storage ->
   verification-screenshots) - exactly what the AI check would have done.
3. If it checks out, set `needs_manual_review` back to `false`. If it
   doesn't, handle it the same as a confirmed identity/classification
   conflict above.
4. If you're seeing a growing backlog here, that's a signal the Anthropic
   API key/quota needs attention, not just something to keep clearing
   by hand.
5. **Don't manually check `membership_expiration_date`/currency as part of
   this review** - an expired card is never a reason to flag or suspend
   someone (see migration 0033), it's just displayed to other users as
   "Not current." This review is specifically about name/ID/classification
   mismatches, the same thing verify-classification-card would have
   blocked on if it had been able to run.

## Reviewing an event-accuracy report (event_reports)

Per the Producer Guidelines, these need a faster turnaround than personal
conduct reports, especially if the event is coming up soon and the report
involves payment.

1. Studio -> Table Editor -> `event_reports`, filter `status = open`.
2. Verify the claim (date/location/payout/cattle/etc. against outside
   sources or by contacting the producer).
3. Set `status` to `confirmed` or `dismissed`. If confirmed and serious, also
   manually set the event's `status` to `removed` in the `events` table, or
   set the producer's `producer_profiles.verification_status` to `rejected`
   if the pattern warrants revoking their verified status entirely.

## Lifting a suspension after a successful appeal

1. Studio -> Table Editor -> `profiles`, set `suspended = false` and clear
   `suspended_reason`.
2. Studio -> Authentication -> Users, find the user, and remove their ban
   (the `ban-suspended-user` function used `ban_duration` - unbanning is a
   dashboard action, or call `auth.admin.updateUserById(id, { ban_duration:
   'none' })` via the SQL editor's REST helper or a one-off script).
3. Note: if the profile had already been scrubbed (3rd-strike path), the
   underlying PII (contact, screenshot, etc.) is gone - lifting suspension
   restores login access but the person will need to re-verify their Global
   Handicap classification from scratch.

## Draw Pro "Enter the Draw" - troubleshooting an incomplete/broken landing page

**NEW, added 2026-07-28.** Real bugs found and fixed live via this exact
symptom report: "Enter the Draw" opens Draw Pro's Entrant Entry page, but
it loads incomplete (placeholder title, empty class dropdown, no fee).
Two distinct, unrelated causes were found and fixed the same day - if
this happens again, check both:

1. **Stale `draw_pro_entry_url` from before an `await` bug was fixed.**
   `backend/steerMeSync.jsw`'s `buildEntryUrl()` call used to run
   unawaited across a `.jsw`-to-`.jsw` module boundary, which resolves to
   a Promise object that serializes as the literal string `"{}"` - not a
   valid URL. The bug itself was fixed same-day-in-2026-07-23 (the call
   is correctly `await`ed now), but any event synced BEFORE that fix
   landed still has `"{}"` sitting in its `draw_pro_entry_url` column
   forever, since Draw Pro only re-syncs an event when a producer adds a
   NEW class to it - nothing retroactively repairs already-synced rows.
   **Check:** `select id, name, draw_pro_entry_url from events where
   draw_pro_event_id is not null and draw_pro_entry_url = '{}';` - patch
   any hits directly with `https://www.ropingtools.com/drawpro-enter?
   event=<draw_pro_event_id>` (the exact format `buildEntryUrl()` itself
   produces).
2. **Wix Data collection permissions.** `entrant-entry-form.js` calls
   `wixData.get('DrawProEvents', eventId)` directly from page code with
   no permission-error handling - if the "Everyone" role's **View**
   permission isn't checked on the `DrawProEvents` collection (Wix Editor
   -> Content Manager -> the collection -> Permissions & Privacy ->
   Advanced), this throws for any visitor who isn't a signed-in
   Collaborator/Admin, which silently kills the rest of `$w.onReady()`
   before the class dropdown/fee ever populate. **This is easy to miss in
   your own testing** - you're logged in as the site owner, which already
   has read access regardless of what "Everyone" is set to; the bug only
   shows up for a real anonymous/guest entrant. Check `DrawProEventClasses`
   for the same misconfiguration too - it's the very next collection this
   same page reads, right after `DrawProEvents`.

Diagnosed both by actually rendering the live page with a headless
browser (Playwright + system Chrome) and reading the console - the Wix
Data permissions error (`WDE0027`) showed up directly there, far faster
than guessing from code alone.

## Draw Pro entry hand-off (Steer Me -> Draw Pro prefill)

**NEW, added 2026-07-28.** Real friction gap flagged directly by the user:
a Steer Me user tapping "Enter the Draw" (and their already-confirmed
Steer Me partner, if they have one) had to retype everything on Draw
Pro's Entrant Entry page, even though it was all already known. Fixed via
a short-lived, single-use handoff row (`entry_handoffs` table, migration
0036/0037) rather than putting name/contact/classification directly in
the URL as query params - that's a real privacy anti-pattern (query
strings end up in browser history, some server/proxy logs, and Referer
headers of any third-party resource the landing page loads).

**How it works:**
1. `EventCard.tsx`'s "Enter the Draw" button (solo case) and
   `my-requests.tsx`'s new "Enter the Draw" button (on an accepted,
   event-scoped request) both call `create_entry_handoff()` (a
   `SECURITY DEFINER` Postgres function) before opening the Draw Pro URL,
   then append `&handoff=<id>` to it.
2. `create_entry_handoff()` never trusts partner PII from the client -
   for the confirmed-partner case, it independently re-verifies the
   caller is actually a party to an ACCEPTED `partner_requests` row
   for that exact event, then re-fetches the partner's real name/
   classification/Global ID/contact from their own profile row itself.
   Only the HEADER/HEELER ROLE ASSIGNMENT is trusted from the client
   (computed via `resolvePairingRoles()` in `src/lib/matching.ts`,
   mirroring `canPair()`'s own combo logic) - a wrong role assignment is
   just a prefill the entrant can correct on Draw Pro's own form, not a
   security boundary, so there's no reason to re-derive it server-side.
3. Draw Pro's `entrant-entry-form.js` reads `?handoff=<id>` off its own
   URL and calls `backend/steerMeHandoff.jsw`'s `resolveEntryHandoff()`,
   a server-to-server call using the same `steerme-supabase-url` /
   `steerme-supabase-service-role-key` secrets already used by
   `steerMeSync.jsw` (the reverse direction). That function marks the row
   `consumed_at` immediately after a successful read - single-use, since
   it briefly carries another real person's info.
4. Rows expire after 1 hour (`expires_at`, defaulted in the table) even if
   never used - there's no realistic legitimate reason to reuse an old
   "Enter the Draw" link days later.
5. **Known, accepted limitation:** Steer Me only collects one freeform
   "Phone or email" field (`profiles.contact`), not two separate ones - a
   plain `.includes('@')` check on the Draw Pro side decides whether it
   goes in `#inputEmail` or `#inputPhone`. Whichever field it doesn't look
   like stays blank, same as if no handoff had ever run - not a full fix,
   but real friction reduction for what Steer Me actually collects today.
6. Minors: `me_contact`/`partner_contact` fall back to `guardian_contact`
   when `contact` is null (migration 0037's fix), matching the same
   convention `get_request_contact()` already uses.

**To test end-to-end:** create/accept a real `partner_requests` row
between two profiles for a real synced event (see the demo athlete pool
above), sign in as one of them via the Auth API, call
`rpc/create_entry_handoff` with that request's id and a `header`/`heeler`
role pair, then check the resulting `entry_handoffs` row has the
counterpart's REAL profile data (not whatever you might try to pass as
partner info - the function should ignore that entirely for anyone
who isn't actually a party to an accepted request naming them).
