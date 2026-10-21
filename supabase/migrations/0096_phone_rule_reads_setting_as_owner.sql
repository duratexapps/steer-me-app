-- Fix for 0094/0095: app_settings has row security on and no policies (clients cannot read it), so the profile
-- guard trigger, which runs as the signed-in user, always saw the phone requirement as OFF. Read the setting
-- through a security-definer helper instead, so the switch actually works when it is turned on.

create or replace function public.phone_required_for_unverified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value)::text = 'true' from public.app_settings where key = 'require_phone_for_unverified'), false);
$$;
revoke all on function public.phone_required_for_unverified() from public, anon;
grant execute on function public.phone_required_for_unverified() to authenticated;

create or replace function public.guard_self_reported_profile()
returns trigger
language plpgsql
as $$
declare
  numbers_changed boolean;
  lowered boolean;
begin
  -- Only direct app/API requests are checked; scripts and admin tools are not.
  if current_user <> 'authenticated' then
    return new;
  end if;

  numbers_changed := tg_op = 'INSERT'
    or new.global_classification is distinct from old.global_classification
    or new.header_classification is distinct from old.header_classification
    or new.heeler_classification is distinct from old.heeler_classification;

  if new.global_membership_id is null then
    -- Self-reported: the phone must be confirmed once the requirement is switched on.
    if public.phone_required_for_unverified() and not public.account_phone_confirmed_self() then
      raise exception 'Verify your phone number before saving a profile without a Global card' using errcode = 'P0001', hint = 'phone_not_verified';
    end if;

    -- Moving a self-reported number down is only allowed 90 days after the last change.
    if tg_op = 'UPDATE' and old.global_membership_id is null and numbers_changed then
      lowered := coalesce(new.global_classification < old.global_classification, false)
        or coalesce(new.header_classification < old.header_classification, false)
        or coalesce(new.heeler_classification < old.heeler_classification, false);
      if lowered and old.classification_changed_at is not null
         and old.classification_changed_at > now() - interval '90 days' then
        raise exception 'A self-reported number can be raised any time, but lowered only 90 days after your last change' using errcode = 'P0001', hint = 'lowering_too_soon';
      end if;
    end if;
  end if;

  if numbers_changed then
    new.classification_changed_at := now();
  end if;
  return new;
end;
$$;
