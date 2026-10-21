-- The WSTR Finale is a Global event: no Global card, no Finale (Justin, 2026-10-22). Self-reported ropers
-- (profiles without a global_membership_id, see 0094) cannot set Finale flags and never appear on the board.
--
--  * Trigger: finale_flags can only be written by a direct app request if the profile has a Global card on file.
--  * View: public_finale_flags only shows flags from profiles with a card on file, so nothing stale or
--    hand-made can surface a self-reported roper on the board or as a Finale badge.
--  * Cleanup: remove any flag rows that already belong to a self-reported profile.

delete from public.finale_flags f
using public.profiles p
where p.id = f.user_id and p.global_membership_id is null;

create or replace function public.guard_finale_flags_need_card()
returns trigger
language plpgsql
as $$
begin
  -- Only direct app/API requests are checked; scripts and admin tools are not.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if not exists (select 1 from public.profiles where id = new.user_id and global_membership_id is not null) then
    raise exception 'The WSTR Finale is open to ropers with a current Global Handicap card' using errcode = 'P0001', hint = 'finale_needs_card';
  end if;
  return new;
end;
$$;

drop trigger if exists finale_flags_need_card on public.finale_flags;
create trigger finale_flags_need_card
  before insert or update on public.finale_flags
  for each row execute function public.guard_finale_flags_need_card();

create or replace view public.public_finale_flags
with (security_invoker = false) as
select
  f.user_id,
  f.finale_year,
  f.qualified_classes,
  f.buy_in
from public.finale_flags f
join public.profiles p on p.id = f.user_id
where now() < make_date(f.finale_year::int, 12, 15)
  and p.global_membership_id is not null
  and not p.suspended
  and not p.hidden_from_matching
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), f.user_id));

grant select on public.public_finale_flags to authenticated;
