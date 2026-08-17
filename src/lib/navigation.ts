import { router } from 'expo-router';

// Real gap flagged directly by the user: every screen's ScreenHeader back
// arrow called plain router.back(), which silently does nothing if there's
// no navigation history to pop - landing directly on a screen (a deep
// link, a shared/bookmarked web URL, a page refresh, or Expo Router's own
// history being reset by a redirect) leaves the user stuck with a
// dead-looking back button. On web a lost back arrow is just an
// inconvenience (the browser's own back button still works), but on the
// actual native app there is no fallback at all - the user would be
// genuinely stuck. Used by every screen's ScreenHeader onBack instead of
// a bare () => router.back(), so the behavior is uniform everywhere
// rather than only working on screens reached by tapping through the app.
// Parameters<typeof router.replace>[0] rather than importing expo-router's
// Href type by name - this project has typedRoutes enabled (app.json), so
// the parameter must match one of the app's actual known route strings,
// not a generic string.
export function goBackOrHome(fallbackHref: Parameters<typeof router.replace>[0] = '/') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackHref);
  }
}
