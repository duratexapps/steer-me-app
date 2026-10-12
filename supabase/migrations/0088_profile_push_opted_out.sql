-- NEW, 2026-10-12 - make "Draw Pro notifications OFF" stick. Found in the
-- joint test: app/_layout.tsx registers for push on every launch and every
-- foreground, and it ignored the Account Settings switch, so turning
-- notifications off cleared the token and the very next app open silently put
-- it back. This column records the user's choice; the automatic registration
-- now skips users who opted out. Default false: nobody changes behavior until
-- they use the switch. Users update their own profile row already.
alter table public.profiles
  add column push_opted_out boolean not null default false;

comment on column public.profiles.push_opted_out is
  'True when the user turned Draw Pro notifications off in Account Settings. The app must not auto-register a push token while this is true; turning notifications back on clears it. Draw Pro treats no token as "email them instead".';
