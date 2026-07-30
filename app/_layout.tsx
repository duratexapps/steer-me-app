import { useEffect, useCallback } from 'react';
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

  useEffect(() => {
    async function bootstrap(userId: string | undefined) {
      if (!userId) {
        setHasAthleteProfile(false);
        setHasProducerProfile(false);
        return;
      }
      configurePurchases(userId);
      const { hasAthleteProfile, hasProducerProfile } = await checkProfileStatus(userId);
      setHasAthleteProfile(hasAthleteProfile);
      setHasProducerProfile(hasProducerProfile);
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await bootstrap(data.session?.user.id);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      bootstrap(session?.user.id);
    });

    return () => subscription.subscription.unsubscribe();
  }, [setSession, setReady, setHasAthleteProfile, setHasProducerProfile]);

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
  const pathname = usePathname();
  const isPublicLandingRoute = pathname === '/';

  if (!isPublicLandingRoute && (!fontsLoaded || !isReady)) {
    return <View style={{ flex: 1, backgroundColor: colors.bone }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
      <ToastHost />
    </QueryClientProvider>
  );
}
