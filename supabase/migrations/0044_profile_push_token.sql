-- Expo push token, so draw-pro-results-webhook (and, later, anything else
-- that wants to notify a user) can reach them without any other contact
-- info. Registered/kept fresh client-side - see
-- src/lib/push-notifications.ts, called from app/_layout.tsx's bootstrap()
-- on sign-in and app foreground.
alter table public.profiles
  add column expo_push_token text;

comment on column public.profiles.expo_push_token is
  'Expo push token for this device, registered by src/lib/push-notifications.ts. '
  'Null until the user grants notification permission. Overwritten (not '
  'appended) on every registration - this app only ever tracks the most '
  'recently active device per account, not a list of devices.';
