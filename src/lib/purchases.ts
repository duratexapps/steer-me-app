import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

let configured = false;

// appUserID = Supabase auth.uid() so RevenueCat's identity lines up with
// our own directly - no separate mapping table needed. Auto-mocks when run
// inside Expo Go (no dev client), per RevenueCat's own SDK behavior, so this
// is safe to call during development without a custom build.
export function configurePurchases(userId: string) {
  if (configured) return;

  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

  if (!apiKey || apiKey.includes('xxxx')) {
    // Still a placeholder (see .env.example) - skip configuring rather than
    // pass a garbage key to the SDK.
    return;
  }

  Purchases.configure({ apiKey, appUserID: userId });
  configured = true;
}

export async function fetchOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}
