-- Hide two layover spots that have neither a phone nor a website and only thin evidence that they take travelers'
-- horses. They stay in the table (active = false) and come back when a way to reach them is found.
update public.layover_spots set active = false
  where name in ('SF Ranch Horse Motel', 'Crossroads RV Park and Horse Motel');
