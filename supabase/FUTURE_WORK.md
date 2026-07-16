# Steer Me — notes for not-yet-built features

Product requirements identified during v1 development that don't apply
until a specific future feature gets built. Read the relevant section
before starting that feature so the requirement doesn't get missed.

## Event entry/payment processing: header/heeler must be declared at entry

**Applies to:** in-app entry-fee payment (Stripe Connect), described as a
future capability throughout the Pricing & Fees and Producer Guidelines
docs ("once in-app entry-fee payment is available"). Not built in v1 - v1
only has free event listings and free "mark attending."

**The requirement:** when the app is able to process entries on a
producer's behalf, contestants must declare who is heading and who is
heeling *at the time of entry* - a producer's book/bracket needs a
definite role assignment per team, not just "these two people are
paired."

**Why this doesn't need to be solved in v1:** matching (Browse, event
partners, posted needs) deliberately does NOT ask either party to declare
a role when they pair up - see `canPair()` in `src/lib/matching.ts`. The
classification-cap math only depends on the *sum* of both people's
numbers, never on which end is labeled which, so eligibility never needed
a role assignment, and adding one at match-time would have been pure
overhead for the common case (Header+Heeler, where the roles are already
fixed and there's nothing to ask).

**Where it becomes a real requirement:** per the user's own observation,
this is only ever ambiguous for a pairing that includes a Switch Ender -
Header+Heeler pairs already have a definite, unambiguous role assignment
today. Specifically:

- **Header + Heeler:** no prompt needed, ever - roles are already fixed.
- **Header/Heeler + Switch Ender:** no prompt needed - the Switch Ender's
  role is whatever the fixed-position partner isn't.
- **Switch Ender + Switch Ender:** genuinely ambiguous - the entry flow
  must ask the pair to declare who heads and who heels before the entry
  can be submitted.

**Implementation note for whoever builds this:** the entry-fee/payment
feature will need its own record of a specific team's entry (likely tied
to `event_id` + `division` + the two athlete IDs), and that record is the
right place to store `header_id`/`heeler_id` explicitly - don't try to
retrofit a role column onto `partner_requests` or `need_posts`, since
those represent the *matching* step, not the *entry* step, and a single
match could in principle be used to enter multiple events/divisions over
time with the same or different role assignment each time.

## Map view for browsing events by location

**Status:** explicitly deferred by the user (not enough listed events yet
to justify it) - revisit once the marketplace has grown.

**Feasibility findings, so this doesn't need to be re-researched:**

- **Auto-plotting is easy and free.** `events.location` (and
  `need_posts.location`) are free text today, not coordinates. Geocoding
  them (text -> lat/long) for a Create Event submission can use
  `expo-location`'s built-in `Location.geocodeAsync()` - no paid API, no
  separate account. Fully automatic: geocode in the background right after
  a producer submits the form, store on two new nullable columns
  (`latitude`/`longitude`) on `events`. Same approach would work for
  `need_posts.location` if posted needs ever need plotting too.
- **This is worth doing independently of the map UI itself**, since real
  coordinates would also let the existing "sort by location" toggles
  (Browse, Post feed) do actual distance math instead of the current
  exact-city-string-match heuristic - a natural, low-cost upgrade whenever
  this gets picked back up.
- **The map view has a real platform wrinkle.** `react-native-maps` works
  in Expo Go on iOS with no setup (Apple Maps, no API key). On Android, a
  properly rendered map needs a Google Cloud Maps API key wired into the
  native build - Expo Go can't fully support that, so a working Android
  map means an EAS development build at that point, not continued
  Expo-Go-only testing. Confirmed against the versioned Expo SDK 57 docs
  directly, not assumed.
