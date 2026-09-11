-- Real gap flagged directly by the user: a huge share of team roping
-- fliers say "enter by text" or "enter by call" - especially producers
-- who aren't on Draw Pro or any other online entry system at all (e.g.
-- X-Treme Team Roping enters by texting a phone number). Until now these
-- events just showed a static note ("see the flier / contact the
-- producer"), with the entrant left to manually copy a name/number and
-- type their own info by hand.
--
-- This doesn't require the producer's cooperation or any integration -
-- it's purely a Steer Me-side convenience that pre-fills the native SMS/
-- phone composer with the entrant's own info (already sitting in their
-- profile) so they can review and send it themselves. Functionally
-- identical to a roper texting in from any other phone, just without the
-- manual retyping. See EventCard.tsx for the actual entrant-facing flow.
--
-- Separate structured columns (not folded into the existing free-text
-- producer_contact_info) specifically so the UI can render a real,
-- tappable "Text to Enter"/"Call to Enter" action instead of just
-- displaying a string - same reasoning as booking_link/booking_phone
-- (migration 0054) being split rather than combined.
alter table public.events
  add column entry_method text check (entry_method in ('text', 'call')),
  add column entry_phone text;

comment on column public.events.entry_method is
  'How an entrant enters when there''s no online entry (no draw_pro_entry_url) - '
  '''text'' or ''call'' pre-fill/open the native SMS/phone composer to '
  'entry_phone with the entrant''s own info. Null means no known phone-based '
  'entry method - falls back to producer_contact_info display only.';
comment on column public.events.entry_phone is
  'The number to text/call to enter - paired with entry_method. Set by '
  'whoever posts the event (admin from a flier, or a self-serve producer).';
