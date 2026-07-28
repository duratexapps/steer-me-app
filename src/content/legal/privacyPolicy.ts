// NEW, added 2026-07-28 - see termsOfService.ts's file header for the
// full reasoning (clean, user-facing copy; internal DRAFT/review notes
// stripped; keep in sync with DOCS/privacy-policy.md by hand).
export const PRIVACY_POLICY = `# Privacy Policy

*Effective date: July 28, 2026 · Last updated: July 28, 2026*

## 1. Who we are

Steer Me ("we," "us," "the app") is a mobile app that helps team ropers find eligible partners for roping events based on Global Handicap classification numbers. Steer Me is operated by Duratex Instrument & Electric, LLC, a Texas limited liability company, doing business as Duratex Applications. This policy explains what information we collect, why, and what control you have over it.

**Contact:** support@ropingtools.com
**Company:** Duratex Instrument & Electric, LLC dba Duratex Applications, PO Box 12, Rosharon, TX 77583

## 2. Information we collect

**Profile information you provide directly:**
- Full name
- Global membership ID
- Global classification number — if you rope both ends ("Switch Ender"), you provide two independent numbers instead of one — a header classification and a heeler classification, since the two are assessed independently and commonly differ. If you only rope one end (Header or Heeler only), you still have just the one number.
- Roping position (header, heeler, or switch ender)
- Home area / general location
- Phone number or email address

**Classification verification:**
- A screenshot of your Global Handicap card or membership page
- The membership ID and classification number(s) extracted from or confirmed against that screenshot — for a Switch Ender, both the header and heeler numbers are self-reported and verified against this same single screenshot

**Activity on the app:**
- Partner requests you send or receive, and their status
- Events/roping caps you post as needing a partner

**Subscription and payment:**
- We do not directly collect or store your credit card, debit card, or bank information. Subscriptions are processed through Apple's App Store or Google Play billing systems (or a billing intermediary such as RevenueCat), which handle payment data under their own privacy terms.

**Automatically collected:**
- Basic device and app diagnostic information (e.g., crash reports, app version) used to keep the app running reliably.

## 3. How we use your information

- To create and display your roper profile to other users
- To verify your claimed classification number against your submitted screenshot
- To calculate which other ropers you're eligible to partner with for a given event
- To facilitate partner requests and connect you with a match
- To manage your subscription and provide customer support
- To maintain the security and reliability of the app
- To determine your membership's current/not-current status where applicable

## 4. What other users can see

Other ropers browsing for partners see only: your name, classification number(s), position, general area, and whether your Global Handicap membership currently shows as expired ("Not current"), based on the expiration date read from your last-verified card. This does not restrict your own use of the app in any way (see Section 5.5) — it's shown so other users can decide for themselves whether to pursue a match with you while your membership isn't current. A Switch Ender's tag shows both numbers together (e.g. "6.5/8"). Your Global membership ID and contact information are never shown to other users. Contact information is shared with another roper only after you both agree to a partner request.

Your Global Handicap verification screenshot is handled differently: once you've matched with another roper, that roper can view your on-file screenshot, and you can view theirs. This is a fraud-prevention measure — letting a confirmed partner visually check your screenshot against your claimed classification number(s) helps guard against anyone misrepresenting their number(s). Your screenshot is never shown to a roper you haven't matched with, and never shown more broadly to the platform.

## 5. Classification verification data — retention

When you create a profile, we require a screenshot of your Global Handicap card or membership page to confirm your claimed classification number is genuine.

- While your profile is active and your classification hasn't changed, we retain your verification screenshot as on-file proof.
- When you update your classification, your new screenshot replaces the old one, and the previous image is permanently deleted at that time.
- When you delete your profile, your screenshot, membership ID, classification number, and all associated account data are permanently deleted.
- We do not use this screenshot for any purpose beyond initial and ongoing classification verification, and we do not sell or share it with third-party companies other than the service providers described in Section 12.
- We may prompt you periodically (e.g., annually or at season boundaries) to reconfirm your classification is still current.

## 5.5. Automated card verification

When you upload your verification screenshot (at sign-up or when updating your classification), we use an AI service provider (see Section 12) to read the name, membership ID, classification number(s), and expiration date printed on it, and compare them against what you entered.

- If your name, membership ID, or classification number doesn't match what's on the card, your sign-up or classification update is not completed, and you'll see what specifically didn't match so you can correct it.
- An expired membership is handled differently and does NOT block you. If your card shows as expired, your sign-up or update still completes — but your profile's membership status is recorded as not current, and shown to other users the same way your classification number is, so they can decide for themselves whether to pursue a match with you.
- This check happens automatically and is not a human reviewing your card, though we may still review it manually in response to a report or dispute.
- If this automated check is temporarily unavailable, your submission is not blocked, but your profile is flagged internally for manual review rather than being silently treated as verified.

## 5.6. Refer a friend

Every account gets a unique referral code, generated automatically and never shown to anyone but you. If you share it and a friend enters it when they sign up, we record that they were referred by you, and once they subscribe for the first time, we grant a free month to both of you through our subscription billing provider.

- We do not access your contacts or send anything on your behalf — sharing your code is something you do yourself.
- We keep a record of who referred whom, and whether the reward has been granted, solely to run this program and prevent it from being granted more than once per referral.
- We may investigate or decline to grant a reward we reasonably believe resulted from fraudulent or abusive use of the program.

## 6. Location services (optional)

You can optionally turn on location services from the Browse screen to find partners near where you currently are.

- This is off by default. Nothing about your precise location is accessed unless you turn the toggle on.
- While turned on, your device shares your approximate current location with the app so we can show and prioritize eligible partners near you.
- We use this only to filter and sort partner listings for you in the moment. Other users do not see your precise coordinates.
- We do not continuously track your location in the background, and we do not build a location history.
- Turning location services off simply reverts you to matching based on your stated home area.

## 7. Favorites and groups

- **Favorites** are private to you — starring another roper as a favorite is not visible to them or to other users.
- **Groups**, letting you organize with other ropers around shared criteria you choose, are not yet available in the current release. This section will apply once that feature launches: group membership would be visible to other members of that group, and group names/descriptions would be visible to anyone browsing groups.
- Deleting your profile removes your favorites list (and, once available, your membership in any groups).

## 8. Producer profiles and events

A user can hold a producer profile in addition to their athlete profile.

- **Producer profile data:** organization name, contact information, sanctioning-body affiliation (if any), and a verification document. This document is used only to verify producer status and is handled with the same care as classification-verification screenshots.
- **Event listings** (name, date, location, entry fee, divisions, description) are public to all users.
- **Attendance:** marking yourself "attending" a specific event and division is used to show you eligible partners who are also attending that event.
- **Payments:** once entry fees can be paid in-app, payment details are handled by our payment processor and are not stored directly by us.
- **Ratings and reviews:** if you attended an event, you can submit a 1-5 star rating and an optional written review after the event date passes. The public display only shows an aggregate average once an event has enough ratings.
- Deleting your athlete profile does not automatically delete a separate producer profile or its event listings. Contact us at support@ropingtools.com to remove a producer profile and its listings.

## 9. Camera and photo library access

Several places in the app let you add a photo: your Global Handicap verification, your profile photo, and a producer's verification document. In each case, you choose between taking a photo directly or selecting an existing one from your device's photo library.

- Camera access and photo library access are separate permissions, each requested the first time you use that specific option.
- We only access the camera or photo library at the moment you initiate an upload.
- If you decline a permission, the corresponding option simply won't be available for that upload.
- You can change these permissions at any time in your device's system settings.

## 10. Profile photos

A profile photo is required to create an athlete profile. This is a fraud-deterrence measure — a real, visible photo gives other users who may know you in person a way to help confirm you are who your profile claims to be.

- Profile photos are public to other users of the app.
- You can update or remove your profile photo at any time. Deleting your profile removes it along with everything else described in this policy.
- **Reporting and moderation:** profiles can be reported through the app. We review reported content and may restrict accounts that violate our Community Guidelines.

## 11. Minors and parental consent

Team roping includes competitors under 18, so this app supports minor athletes directly, with parental oversight.

At sign-up, every user indicates whether they are 18 or older. If a profile is being created for someone under 18:

- A parent or legal guardian must provide their own name and contact information.
- The guardian must affirmatively check a consent statement confirming they are the roper's parent or legal guardian and consent to the roper's profile, classification verification, and partner requests being managed through the app.
- A profile cannot be created until this consent is given, in addition to classification verification.

**Ongoing handling of minor profiles:**

- Minor profiles are visibly marked as guardian-managed.
- Partner requests involving a minor are routed to the parent/guardian for approval before any contact information is exchanged with the other party. A minor's direct contact information is never shown to other users.
- A guardian can request a copy of, correct, or delete their minor's data at any time by contacting support@ropingtools.com, in addition to the in-app deletion option.
- We do not knowingly collect information from a child whose sign-up was not accompanied by verified guardian consent as described above.

## 12. Service providers we use

We share limited data with the following types of providers, solely to operate the app:
- **Hosting and database** — stores your profile, classification data, screenshot, and event/producer data
- **Subscription billing** (Apple, Google, and/or RevenueCat) — processes subscription payments; we do not see your full payment details
- **Event payment processing** — processes entry-fee payments between athletes and producers; we do not see or store full payment card details
- **AI verification provider** (Anthropic) — receives your verification screenshot at the moment you submit or update it, solely to read and confirm the name, membership ID, classification number(s), and expiration date printed on it against what you entered

We do not sell your personal information.

## 13. Your rights and choices

You can, at any time from within the app:
- View and edit your profile information
- Update your classification, which deletes your previous verification screenshot
- Delete your profile, which permanently deletes your screenshot, classification data, and account

Depending on where you live, you may also have the right to request a copy of your data, correct inaccurate data, or object to certain uses. Contact us at support@ropingtools.com to exercise these rights.

## 14. Data security

We use reasonable technical and organizational measures, including encryption in transit and at rest, to protect your information. No system is completely secure, and we cannot guarantee absolute security.

## 15. Changes to this policy

We'll update the effective date above when this policy changes, and notify you in-app of material changes.

## 16. Contact us

Questions about this policy or your data: support@ropingtools.com
`;
