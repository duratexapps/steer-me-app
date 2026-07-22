import { Platform, useWindowDimensions } from 'react-native';

// Shared breakpoints for every card grid (Browse, Post, Events, My
// Requests, My Favorites) so a window resize behaves consistently across
// screens. Native always returns 1 - this is purely a wide-browser-window
// concern, not something a phone screen (even a large one) benefits from,
// and FlatList's numColumns can't safely change without a remount, so
// callers should pass this value as part of the list's `key` prop.
export function useResponsiveColumns(breakpoints: { md: number; lg: number } = { md: 700, lg: 1100 }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web') return 1;
  if (width >= breakpoints.lg) return 3;
  if (width >= breakpoints.md) return 2;
  return 1;
}

// For plain ScrollView + flexWrap grids (screens that .map() cards instead
// of using FlatList's numColumns). Deliberately a little under the exact
// 100/n split (48% instead of 50%, 31.5% instead of 33.33%) so the
// container's `gap` has room to breathe without pushing the last column
// of a row onto the next line - not pixel-perfect, but avoids needing a
// calc() width string just to account for gap spacing exactly.
export function gridItemWidthPercent(numColumns: number): `${number}%` {
  if (numColumns >= 3) return '31.5%';
  if (numColumns === 2) return '48%';
  return '100%';
}
