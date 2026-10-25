-- Clinic discipline (Justin, 2026-10-24): a clinic that is not team roping carries its discipline in a note at the top of
-- its tile (no filter). Null means team roping, the default. Only clinics can have one.

alter table public.events
  add column clinic_discipline text,
  add constraint events_clinic_discipline_allowed
    check (clinic_discipline is null or clinic_discipline in ('Tie-down roping', 'Breakaway roping', 'Big loop / ranch roping')),
  add constraint events_clinic_discipline_only_clinics
    check (clinic_discipline is null or is_clinic);

update public.events set clinic_discipline = 'Tie-down roping' where is_clinic and name = 'JJ Hampton Roping School';
update public.events set clinic_discipline = 'Breakaway roping' where is_clinic and name like 'Breakaway Roping Clinic with Chelsea Novosad%';
update public.events set clinic_discipline = 'Big loop / ranch roping' where is_clinic and name like 'Dalton Darnell Big Loop%';
