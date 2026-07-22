import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Slot, usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/src/theme/theme';

type NavItem = {
  href: string;
  pathname: string;
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

const NAV_ITEMS: NavItem[] = [
  { href: '/(tabs)', pathname: '/', title: 'Home', icon: 'home-outline' },
  { href: '/(tabs)/browse', pathname: '/browse', title: 'Browse', icon: 'search-outline' },
  { href: '/(tabs)/post', pathname: '/post', title: 'Post', icon: 'flag-outline' },
  { href: '/(tabs)/profile', pathname: '/profile', title: 'Profile', icon: 'person-outline' },
];

// Web has no equivalent to a bottom tab bar - that's a mobile OS convention,
// not a website one - so the (tabs) group renders a persistent left sidebar
// here instead, using Slot (same mechanism Tabs uses under the hood) to
// render whichever of the four screens matches the current route. Native
// keeps the real Tabs navigator entirely untouched; see _layout.tsx's
// Platform branch.
export function WebSidebarLayout() {
  const pathname = usePathname();

  return (
    <View style={styles.root}>
      <View style={styles.sidebar}>
        <Text style={styles.logo}>STEER ME</Text>
        <Text style={styles.tagline}>Find your own partner</Text>
        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.pathname;
            return (
              <Pressable
                key={item.href}
                onPress={() => router.push(item.href as never)}
                style={[styles.navItem, active && styles.navItemActive]}
              >
                <Ionicons name={item.icon} size={19} color={active ? colors.espresso : colors.tan} />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bone },
  sidebar: {
    width: 232,
    backgroundColor: colors.espresso,
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  logo: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.bone,
    letterSpacing: 0.5,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.tan,
    marginTop: 2,
    marginBottom: 28,
  },
  nav: { gap: 4 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  navItemActive: { backgroundColor: colors.brass },
  navLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.tan,
  },
  navLabelActive: { color: colors.espresso },
  content: { flex: 1, minWidth: 0 },
});
