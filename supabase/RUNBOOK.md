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
3. Deploy both Edge Functions:
   ```
   npx supabase functions deploy revenuecat-webhook
   npx supabase functions deploy ban-suspended-user
   ```
4. Set secrets for the Edge Functions (Project Settings -> Edge Functions ->
   Secrets, or via CLI):
   ```
   npx supabase secrets set REVENUECAT_WEBHOOK_AUTH="<a long random string>"
   npx supabase secrets set DB_WEBHOOK_SECRET="<a different long random string>"
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected - you
   don't need to set those yourself.
5. In the RevenueCat dashboard (Project Settings -> Integrations ->
   Webhooks): set the webhook URL to your deployed `revenuecat-webhook`
   function URL, and set the "Authorization header" value to the same string
   you used for `REVENUECAT_WEBHOOK_AUTH` above.
6. In Supabase Studio -> Database -> Webhooks: create a new webhook named
   `ban-suspended-user`, table `profiles`, event `Update`, "Type of update"
   filtered to the `suspended` column if the UI offers a column filter
   (otherwise the function's own no-op check handles the false case safely),
   target the deployed `ban-suspended-user` Edge Function, and add an HTTP
   header `x-webhook-secret: <the DB_WEBHOOK_SECRET value from step 4>`.

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
