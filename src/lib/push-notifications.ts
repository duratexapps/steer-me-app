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

export type PushRegistrationResult = 'granted' | 'denied' | 'unsupported' | 'error' | 'opted_out';

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
//
// CHANGED 2026-10-12 (migration 0088): the automatic calls (app start, return to
// foreground) now respect profiles.push_opted_out. Only the explicit "turn on"
// in Account Settings passes { explicit: true }, which is allowed past an
// opt-out and clears it once a token is saved. Without this, turning
// notifications off was undone the next time the app opened.
export async function registerForPushNotifications(
  userId: string,
  options: { explicit?: boolean } = {}
): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') return 'unsupported';
  if (!options.explicit && registeredForUserId === userId) return 'granted';

  try {
    if (!options.explicit) {
      const { data: row, error: optOutError } = await supabase
        .from('profiles')
        .select('push_opted_out')
        .eq('id', userId)
        .maybeSingle();
      // Offline or unreadable: do nothing rather than guess. It retries on
      // the next foreground.
      if (optOutError) return 'error';
      if (row?.push_opted_out) return 'opted_out';
    }

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

    // select('id') so a save that matched no row is noticed. A brand-new roper registers at login, before their
    // profile row exists; that update used to match nothing, report no error, and mark registration done for the whole
    // session, so only about 1 in 5 real profiles ever got a token (found 2026-10-31).
    const { data: updated, error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token, push_opted_out: false })
      .eq('id', userId)
      .select('id');
    if (error) throw error;
    if (!updated || updated.length === 0) return 'error';

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
  // push_opted_out makes the choice stick: the app's automatic registration
  // checks it, so the token is not quietly put back on the next launch.
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: null, push_opted_out: true })
    .eq('id', userId);
  if (error) throw error;
}
