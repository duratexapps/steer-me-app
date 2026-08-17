import { useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { Slot, usePathname } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
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
    }

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        await bootstrap(data.session?.user.id);
      })
      .catch((err) => {
        // Same principle as the try/catch above, one level up - ANY
        // failure in session bootstrap (a profile-status query timing out
        // on a flaky cold-start network connection, for example) must
        // never permanently block isReady. Worst case here is the user
        // sees a stale hasAthleteProfile/hasProducerProfile state for one
        // launch, which is far better than being stuck unable to log in
        // at all.
        console.error('[RootLayout] session bootstrap failed - app will still render', err);
      })
      .finally(() => {
        setReady(true);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      bootstrap(session?.user.id);
    });

    return () => subscription.subscription.unsubscribe();
  }, [setSession, setReady, setHasAthleteProfile, setHasProducerProfile]);

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

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
      <ToastHost />
    </QueryClientProvider>
  );
}
