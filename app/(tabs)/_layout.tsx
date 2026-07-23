import { Platform, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/src/theme/theme';
import { WebSidebarLayout } from '@/src/components/web/WebSidebarLayout';

// Matches useResponsiveColumns.ts's `md` breakpoint - the same "is this
// actually a narrow/phone-width browser window" threshold already used
// elsewhere in this app, so the check below stays consistent with the
// rest of the responsive system instead of inventing a new number.
const SIDEBAR_MIN_WIDTH = 700;

export default function TabsLayout() {
  const { width } = useWindowDimensions();

  // A bottom tab bar is a mobile OS convention with no web equivalent - on
  // a WIDE desktop browser it just reads as a thin, oddly-placed strip
  // under a huge stretched page. WebSidebarLayout replaces it with a
  // persistent left nav using the same four routes.
  //
  // Real, confirmed bug found live 2026-07-23: this used to check only
  // `Platform.OS === 'web'`, with no width check at all - meaning a real
  // phone's mobile browser (still "web", just narrow) got the exact same
  // fixed 232px sidebar as a wide monitor, permanently eating a huge
  // chunk of the actual screen with no fallback. Confirmed via a live
  // screenshot from an actual phone. Now falls through to the same
  // <Tabs> bottom-bar treatment as native whenever the web window is
  // narrower than SIDEBAR_MIN_WIDTH.
  if (Platform.OS === 'web' && width >= SIDEBAR_MIN_WIDTH) {
    return <WebSidebarLayout />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: colors.saddle,
        tabBarStyle: { backgroundColor: colors.tanLight, borderTopColor: colors.saddle },
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 10, textTransform: 'uppercase' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="browse"
        options={{ title: 'Browse', tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="post"
        options={{ title: 'Post', tabBarIcon: ({ color, size }) => <Ionicons name="flag-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
