-- HARD RULE (Justin, 2026-10-22): class details are never lumped into one long paragraph. Every class on a
-- multi-class event gets its own entry in division_details (keyed by the division number as text, e.g. '9.5'), and
-- entry_fee stays a short summary instead of repeating every class's fee.
--
-- Enforced here for admin-posted events (the scripts and the Admin Post Event screen, which is where the
-- 2026-08-10, 08-31 and earlier batches went wrong). Producers posting through the app already get a per-class
-- field for each division; the nightly check watches every event either way.
--
-- Fires only on INSERT and on UPDATE OF the columns that matter, and only for published events with more than one
-- division, so housekeeping updates (tags, removal after the 30-day rule, Draw Pro links) are never blocked.

create or replace function public.require_per_class_details()
returns trigger
language plpgsql
as $$
declare
  missing text;
begin
  if new.status is distinct from 'published' or not coalesce(new.posted_by_admin, false) then
    return new;
  end if;
  if new.divisions is null or coalesce(array_length(new.divisions, 1), 0) <= 1 then
    return new;
  end if;

  -- divisions is numeric[]; the key is the number as text with no trailing zeros ('9.5', '12'), as the app writes it.
  select string_agg(k, ', ') into missing
  from (select trim_scale(d)::text as k from unnest(new.divisions) d) x
  where nullif(btrim(new.division_details ->> k), '') is null;

  if missing is not null then
    raise exception 'Per-class details are required: add division_details for class(es) % (one entry per class, key = the division number). Never put all classes in one paragraph.', missing
      using errcode = 'check_violation', hint = 'per_class_details_required';
  end if;

  if length(coalesce(new.entry_fee, '')) > 240 then
    raise exception 'entry_fee is too long (% characters). Keep it to a short summary such as "$250 to $400/man depending on the roping" and put each class''s fee in division_details.', length(new.entry_fee)
      using errcode = 'check_violation', hint = 'entry_fee_short_summary_only';
  end if;

  return new;
end;
$$;

create trigger events_require_per_class_details
  before insert or update of divisions, division_details, entry_fee, status, posted_by_admin on public.events
  for each row execute function public.require_per_class_details();
