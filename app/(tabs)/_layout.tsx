import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/src/theme/theme';
import { WebSidebarLayout } from '@/src/components/web/WebSidebarLayout';

export default function TabsLayout() {
  // A bottom tab bar is a mobile OS convention with no web equivalent - on
  // a desktop browser it just reads as a thin, oddly-placed strip under a
  // huge stretched page. WebSidebarLayout replaces it with a persistent
  // left nav using the same four routes; native is untouched below.
  if (Platform.OS === 'web') {
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
