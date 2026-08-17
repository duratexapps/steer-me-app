-- Real gap flagged directly by the user: an event with no draw_pro_entry_url
-- (an admin-posted flier for a producer not on Draw Pro) had nothing telling
-- an entrant HOW to actually enter or who to contact. Populated by an admin
-- reviewing/editing AI-extracted text read off the flier image (see the new
-- extract-flier-contact-info Edge Function) - never auto-published
-- unreviewed, same "AI drafts, a human confirms" pattern as
-- verify-classification-card. Free text, not structured phone/email
-- columns, since fliers vary too widely (multiple contacts, a website, a
-- Facebook page) to fit rigid fields.

alter table public.events
  add column producer_contact_info text;
