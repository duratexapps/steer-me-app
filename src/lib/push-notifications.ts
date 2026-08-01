import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/src/lib/supabase';

// Backs the Draw Pro results notifications (draw-pro-results-webhook looks
// up profiles.expo_push_token - see migration 0044_profile_push_token.sql
// and supabase/RUNBOOK.md). Determines how a notification behaves while
// the app is already open - shown as a banner, no sound/badge, matching
// this app's existing in-app toast conventions rather than doubling up on
// both.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushRegistrationResult = 'granted' | 'denied' | 'unsupported' | 'error';

// Same "web has no equivalent SDK, skip entirely" boundary as
// configurePurchases() in src/lib/purchases.ts. Also: push notifications
// (remote notifications) are unavailable in Expo Go on Android since SDK
// 53 and have never worked in Expo Go on iOS either - a real dev or
// production build is required to see this actually register a token;
// this still runs safely in Expo Go, it just won't get a real token
// (requestPermissionsAsync/getExpoPushTokenAsync fail gracefully into the
// catch below rather than crashing).
let registeredForUserId: string | null = null;

// NEW, added 2026-07-31 - returns a real result rather than void, so
// account-settings.tsx's explicit toggle can tell the user what actually
// happened (in particular: 'denied' means the OS permission dialog either
// declined just now or was already declined earlier - requestPermissionsAsync()
// does NOT re-prompt once denied, so the only way forward from there is
// the OS Settings app, which account-settings.tsx links out to).
// _layout.tsx's own fire-and-forget calls (on login/foreground) don't need
// this return value at all, just the side effect.
export async function registerForPushNotifications(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') return 'unsupported';
  if (registeredForUserId === userId) return 'granted';

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default notifications',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    const finalStatus =
      existingStatus === 'granted' ? existingStatus : (await Notifications.requestPermissionsAsync()).status;
    if (finalStatus !== 'granted') return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
    if (error) throw error;

    registeredForUserId = userId;
    return 'granted';
  } catch (err) {
    // Never blocks sign-in/app usage over a notification-registration
    // failure - same fire-and-forget resilience already used throughout
    // this app's Draw Pro sync code.
    console.warn('[push-notifications] registration failed', err);
    return 'error';
  }
}

// NEW, added 2026-07-31 - the explicit "turn off" side of account-
// settings.tsx's toggle. Deliberately doesn't (can't) revoke the OS-level
// permission itself - only the OS Settings app can do that - this just
// clears the token draw-pro-results-webhook looks up, so no more pushes
// get sent to this device even though the OS permission may still show
// as granted.
export async function unregisterPushNotifications(userId: string) {
  if (registeredForUserId === userId) registeredForUserId = null;
  const { error } = await supabase.from('profiles').update({ expo_push_token: null }).eq('id', userId);
  if (error) throw error;
}
