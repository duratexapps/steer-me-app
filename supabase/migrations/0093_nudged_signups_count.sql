-- How many emails Justin has sent each unfinished sign-up. The nightly sweep stops flagging someone once they have
-- had three (the third is the final notice), so a person who never finishes doesn't appear in the report forever.
-- nudged_on stays the date of the MOST RECENT email. Default 1 = the first email. Added 2026-10-20.
alter table public.nudged_signups add column if not exists nudge_count int not null default 1;
