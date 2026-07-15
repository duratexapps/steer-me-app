# Demo seed data (pre-beta customer demos only)

Seeded directly into the live Supabase project for showing the app to
potential customers before real signups/beta testing exist. All emails are
`@steerme-demo.com` (not a real domain) so there's no chance of confusion
with real users. **Delete all of this before beta/launch** - see "Cleanup"
below.

Shared password for every seed account: `SteerMeDemo2026!`

## Seed athletes

| Name | Position | Classification | Area | Notes |
|---|---|---|---|---|
| Jesse Marlow | Header | 5 | Cottonwood, AZ | |
| Tanner Ruiz | Header | 6 | Prescott, AZ | |
| Ty Overholt | Header | 3 | Camp Verde, AZ | |
| Bo Delacruz | Header | 6.5 | Payson, AZ | |
| Wyatt Fenn | Header | 4 | Globe, AZ | |
| Beau Sanders | Header | 4.5 | Tucson, AZ | |
| Dallas Rowe | Heeler | 5.5 | Snowflake, AZ | |
| Case Whitfield | Heeler | 7 | Payson, AZ | |
| Mackenzie Holt | Heeler | 4 | Cottonwood, AZ | |
| Colt Bracken | Heeler | 3.5 | Payson, AZ | |
| Rylan Combs | Header | 2 | Show Low, AZ | Guardian-managed (minor) - demos the guardian-consent flow and the "Guardian approval" badge in Browse |

Emails follow `firstname.lastname@steerme-demo.com` (e.g. `jesse.marlow@steerme-demo.com`).

## Seed producer

**Desert Classic Ropers** (`events@desertclassicropers-demo.com`) - verified,
WSTR-sanctioned.

## Seed events (all under Desert Classic Ropers)

- **Cottonwood Summer Jackpot** - ~18 days in the past, divisions 10.5/12.
  Has 4 backdated attendance rows and 4 ratings (4.5★ average) so the
  rating badge and "not enough ratings" threshold are both demonstrable.
- **Fall Qualifier** - ~25 days out, divisions 10.5/12/15. 5 seed athletes
  already marked attending across divisions, so tapping "Partners" from
  this event shows real matches immediately.
- **Payson Xtreme Roping** - ~55 days out, divisions 12/15/20. 3 seed
  athletes marked attending (including Rylan Combs in the 20, useful for
  showing the guardian-managed badge in an event-partners context too).

## Demoing on your own phone/account

Your own signed-up account isn't part of this seed data - it's real. Once
you've created your athlete profile, tell me the email you used and I'll
manually flag it as subscribed (`subscriptions.entitlement_active = true`)
so Browse, Post a Need, and event attendance all work without hitting the
paywall during a live demo. This bypasses nothing for anyone else - it's a
one-row flag on your account only, and the real RevenueCat/subscription
gate stays intact for every other signup.

## Cleanup before beta/launch

Delete every seed user via the Auth admin API (cascades their profile,
attendance, ratings) and the producer profile/events:

```sql
-- run in the SQL Editor, or via the admin API per-user
delete from public.producer_profiles where contact_info = 'events@desertclassicropers-demo.com';
-- then delete each @steerme-demo.com auth user via
-- supabase.auth.admin.deleteUser(id) or the dashboard's Authentication -> Users page
```
