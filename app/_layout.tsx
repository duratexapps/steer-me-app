import { useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { Slot, usePathname, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_700Bold, PlayfairDisplay_900Black } from '@expo-google-fonts/playfair-display';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
} from '@expo-google-fonts/work-sans';
import { View } from 'react-native';

import { supabase } from '@/src/lib/supabase';
import { queryClient } from '@/src/lib/query-client';
import { asyncStoragePersister, shouldPersistQuery } from '@/src/lib/query-persister';
import { useSessionStore } from '@/src/state/session-store';
import { checkProfileStatus } from '@/src/lib/profile-status';
import { configurePurchases } from '@/src/lib/purchases';
import { registerForPushNotifications } from '@/src/lib/push-notifications';
import { colors } from '@/src/theme/theme';
import { ToastHost } from '@/src/components/ui/ToastHost';

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op - safe to ignore if already hidden
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
  });

  const setSession = useSessionStore((s) => s.setSession);
  const setReady = useSessionStore((s) => s.setReady);
  const isReady = useSessionStore((s) => s.isReady);
  const setProfileStatusChecked = useSessionStore((s) => s.setProfileStatusChecked);
  const setHasAthleteProfile = useSessionStore((s) => s.setHasAthleteProfile);
  const setHasProducerProfile = useSessionStore((s) => s.setHasProducerProfile);

  // NEW, added 2026-07-31 - tracks the current signed-in user id so the
  // AppState listener below (a separate effect, fires independently of
  // bootstrap) can re-register for push notifications on app foreground
  // without needing its own auth-state subscription.
  const currentUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    async function bootstrap(userId: string | undefined) {
      currentUserIdRef.current = userId;
      if (!userId) {
        setHasAthleteProfile(false);
        setHasProducerProfile(false);
        setProfileStatusChecked(true);
        return;
      }
      // FIXED live 2026-08-11 - real bug confirmed on a real Android
      // build: configurePurchases() was called unguarded, but
      // Purchases.configure() can throw synchronously on-device (bad key,
      // native-module hiccup, etc). That throw propagated up through the
      // un-caught `await bootstrap(...)` below, which meant setReady(true)
      // never ran - isReady stayed false forever, so app/index.tsx's
      // `if (isReady && session)` redirect into the signed-in app never
      // fired, even with a perfectly valid saved session. Every cold
      // launch left the user stranded on the marketing landing page,
      // looking exactly like "forced to log in every time." Wrapped here
      // the same way registerForPushNotifications already is treated
      // (comment below) - a purchases/notifications failure should never
      // hold up session bootstrap.
      try {
        configurePurchases(userId);
      } catch (err) {
        console.error('[RootLayout] configurePurchases failed - continuing without it', err);
      }
      // Fire-and-forget, same reasoning as configurePurchases() above - a
      // notification-permission prompt or registration failure should
      // never hold up session bootstrap.
      registerForPushNotifications(userId);
      const { hasAthleteProfile, hasProducerProfile } = await checkProfileStatus(userId);
      setHasAthleteProfile(hasAthleteProfile);
      setHasProducerProfile(hasProducerProfile);
      setProfileStatusChecked(true);
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        // FIXED live 2026-08-19 - real bug still live after the 2026-08-11
        // fix above, and the actual remaining cause of "the app makes you
        // sign in every time": isReady used to wait on this entire promise
        // chain, which includes `await bootstrap(...)` - and bootstrap()
        // itself awaits checkProfileStatus(), two real Supabase network
        // round trips. getSession() only reads the LOCAL persisted
        // session (fast, no network) - a real user with a perfectly valid
        // saved session was still stuck looking at the public sign-in
        // landing page (app/index.tsx's `if (isReady && session)` gate)
        // for however long those two queries took, which on the flaky
        // rural cell coverage this app's own users actually rope under is
        // easily several seconds - long enough that someone reasonably
        // assumes they've been signed out and re-enters credentials, even
        // though they never actually needed to. setReady now flips the
        // moment the LOCAL session is known, not once the network-
        // dependent profile check finishes - bootstrap() still runs (see
        // the fire-and-forget call below), it just no longer holds the
        // redirect hostage. hasAthleteProfile/hasProducerProfile arriving
        // a moment later is already the accepted, existing pattern once
        // inside the signed-in app (see app/(tabs)/index.tsx's own
        // comment: "flips true... slightly before profile data itself
        // loads") - this just stops applying that same lag to the one
        // screen where it was actually costing people a real login.
        setReady(true);
        bootstrap(data.session?.user.id).catch((err) => {
          // Same principle as the try/catch above - a profile-status
          // failure must never surface as anything worse than a stale
          // hasAthleteProfile/hasProducerProfile for one launch, and it
          // can no longer block isReady at all now that it's unawaited.
          // Still flips profileStatusChecked, though - a failed check is
          // still a checked one, and leaving it false forever would leave
          // Home's guard (app/(tabs)/index.tsx) blank permanently instead
          // of falling back to the same "no profile" state a real
          // profile-less user would correctly see.
          console.error('[RootLayout] profile bootstrap failed - continuing without it', err);
          setProfileStatusChecked(true);
        });
      })
      .catch((err) => {
        console.error('[RootLayout] session bootstrap failed - app will still render', err);
        setReady(true);
        setProfileStatusChecked(true);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      bootstrap(session?.user.id).catch((err) => {
        // Same reasoning as the initial bootstrap() call above - a
        // failure here (e.g. a sign-in event while offline) must not
        // leave profileStatusChecked stuck false forever.
        console.error('[RootLayout] profile bootstrap failed (auth state change) - continuing without it', err);
        setProfileStatusChecked(true);
      });
    });

    return () => subscription.subscription.unsubscribe();
  }, [setSession, setReady, setProfileStatusChecked, setHasAthleteProfile, setHasProducerProfile]);

  // NEW, added 2026-07-31 - "on login and app foreground" per the Draw Pro
  // notifications plan. registerForPushNotifications() itself no-ops if
  // already registered for this same user id this session, so this is
  // safe to call on every foreground transition, not just the first one.
  //
  // ADDED 2026-08-11 - real gap flagged by Supabase's own React Native
  // docs: `autoRefreshToken: true` on the client (src/lib/supabase.ts)
  // isn't sufficient by itself on native. Without explicitly calling
  // startAutoRefresh()/stopAutoRefresh() on foreground/background, the
  // refresh timer can silently stop firing while backgrounded, so a
  // session can expire without ever being renewed - a second, separate way
  // to end up looking "logged out" after reopening the app, distinct from
  // the isReady-never-resolves bug fixed above in bootstrap().
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        supabase.auth.startAutoRefresh();
        if (currentUserIdRef.current) {
          registerForPushNotifications(currentUserIdRef.current);
        }
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => subscription.remove();
  }, []);

  // NEW, added 2026-08-19 alongside migration 0058 - the first actionable
  // (not just informational) push in this app: when a confirmed partner
  // cancels their entry, the notified partner's push now carries a data
  // payload (see send_push_via_edge_function/request_draw_pro_entry_
  // submission_cancellation) this listener reads to deep-link into
  // app/partner-cancelled.tsx instead of just opening to wherever the app
  // happened to be. Registered once at the root, same lifetime as the
  // AppState listener above - covers a tap from a killed, backgrounded, or
  // foregrounded app state alike (addNotificationResponseReceivedListener
  // fires for all three; there's no separate "cold start" case to handle
  // here since expo-router's own state restoration puts Slot on screen
  // first regardless, and this just navigates on top of that).
  useEffect(() => {
    // FIXED live 2026-08-19 - real bug found while verifying an unrelated
    // fix in this same file: getLastNotificationResponseAsync() isn't
    // implemented on web (ERR_UNAVAILABLE), and this had no .catch() -
    // every single web page load threw an uncaught promise rejection.
    // Same "web has no equivalent, skip entirely" boundary already used by
    // registerForPushNotifications() in push-notifications.ts - remote
    // notifications and their deep-link handling are a native-only concept
    // here regardless, so this effect simply doesn't apply on web.
    if (Platform.OS === 'web') return;

    function handleResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.type === 'partner_cancelled' && typeof data.entryId === 'string' && typeof data.eventId === 'string') {
        router.push({
          pathname: '/partner-cancelled',
          params: {
            entryId: data.entryId,
            eventId: data.eventId,
            eventName: typeof data.eventName === 'string' ? data.eventName : '',
            division: typeof data.division === 'number' ? String(data.division) : '',
          },
        });
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    // A response already waiting from a cold start (app launched BY
    // tapping the notification) - addNotificationResponseReceivedListener
    // alone misses this one, since it only fires for responses received
    // AFTER the listener is attached.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch((err) => console.warn('[RootLayout] getLastNotificationResponseAsync failed', err));
    return () => subscription.remove();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && isReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isReady]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  // NEW, added 2026-07-30 - real SEO gap flagged directly by the user:
  // the root "/" route used to render nothing but a blank colored box
  // until fonts + the session check both resolved, for every visitor -
  // including a search crawler, which would see literally no content at
  // all. app/index.tsx is now a real, static-renderable public landing
  // page rather than an unconditional redirect, but it still needs to
  // actually render its content immediately rather than sit behind this
  // same gate. Everything else (the authenticated app itself) keeps the
  // exact same wait-for-fonts-and-session behavior as before - this is
  // narrowly scoped to the one public marketing route.
  //
  // UPDATED 2026-08-06 - the same blank-forever failure mode was
  // discovered on a cold direct load of /tour: a browser blocking or
  // stalling the Google Fonts request (e.g. Brave Shields) or the
  // Supabase session check never lets fontsLoaded/isReady flip true, so
  // any route outside this exemption renders nothing indefinitely - not
  // even a spinner. That only wasn't obvious for /tour before because
  // it's normally reached via in-app client-side navigation (Get
  // Started -> role-select -> tour), by which point fonts/session had
  // already resolved while sitting on "/". A cold direct load of any of
  // these routes - a shared link, a password-reset email, a bookmark -
  // hits the exact same gate. Every screen in the (auth) group is a
  // pre-login, public-facing route with no need to wait on session
  // bootstrap, so all of them are exempted the same way "/" already was,
  // rather than patching /tour alone and leaving the same bug for
  // sign-in/sign-up/create-account/forgot-password/role-select.
  const pathname = usePathname();
  const PUBLIC_ROUTES = new Set([
    '/',
    '/tour',
    '/role-select',
    '/sign-in',
    '/sign-up',
    '/create-account',
    '/forgot-password',
  ]);
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  if (!isPublicRoute && (!fontsLoaded || !isReady)) {
    return <View style={{ flex: 1, backgroundColor: colors.bone }} />;
  }

  // Persisting the query cache to disk (native only - see query-persister.ts
  // for why web is excluded) is what lets My Entries show last-known results
  // instead of failing outright on a bad connection or a cold restart at a
  // venue with poor cell service.
  if (Platform.OS === 'web') {
    return (
      <QueryClientProvider client={queryClient}>
        <Slot />
        <ToastHost />
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 24 * 60 * 60 * 1000,
        // See shouldPersistQuery's own comment (query-persister.ts) - a
        // Map/Set query result (the Events screen's attendance counts,
        // my-attendance, and rating summaries) doesn't survive plain JSON
        // persistence and crashed the app on restore. Excluded from
        // persistence entirely; everything else keeps working as before.
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        // A device that already crashed once has the CORRUPTED (pre-fix)
        // cache sitting on disk right now - shouldDehydrateQuery above
        // only stops new bad writes going forward, it doesn't erase what's
        // already there. Without this, the very next launch would still
        // restore that old bad entry and could crash one more time before
        // a fresh fetch ever replaces it. Bumping buster makes the
        // persister discard anything saved under a different buster string
        // outright, on this one release only - a real device gets a clean
        // cache the instant it updates, not one more crash first.
        buster: 'v2-2026-09-05-exclude-map-set',
      }}
    >
      <Slot />
      <ToastHost />
    </PersistQueryClientProvider>
  );
}
