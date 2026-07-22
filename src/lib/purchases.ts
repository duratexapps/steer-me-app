import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

let configured = false;

// appUserID = Supabase auth.uid() so RevenueCat's identity lines up with
// our own directly - no separate mapping table needed. Auto-mocks when run
// inside Expo Go (no dev client), per RevenueCat's own SDK behavior, so this
// is safe to call during development without a custom build.
export function configurePurchases(userId: string) {
  if (configured) return;

  // RevenueCat has no web SDK at all - react-native-purchases is built
  // specifically around StoreKit/Play Billing. Calling .configure() on web
  // is not just "unsupported," it throws synchronously, and since this
  // function is called from _layout.tsx's bootstrap() inside an un-caught
  // `await bootstrap(...)`, that throw would prevent setReady(true) from
  // ever running - a signed-in user on web would be stuck on the blank
  // splash view forever. Subscriptions on web are out of scope for now
  // (see app/subscription.tsx's web branch) - there's nothing to
  // configure, so just don't.
  if (Platform.OS === 'web') return;

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
