// Palette and type scale ported 1:1 from steer-me.html's :root CSS custom
// properties. Updated for the v2 design system (espresso/brass/saddle in
// place of the original leather/rust/rope palette) - see steer-me_2.html.
export const colors = {
  tan: '#E4DAC6',
  tanLight: '#FBF8F1',
  espresso: '#1E140F',
  espressoDark: '#120C08',
  brass: '#A9812E',
  brassLight: '#C9A54F',
  // "secondary/muted" per the design brief - used both for borders (its
  // original role) and for de-emphasized body/caption text that previously
  // hardcoded '#6b5c47' or '#8a7a5f' directly instead of going through a
  // theme token.
  saddle: '#7C6448',
  ink: '#2A2420',
  bone: '#F4EFE4',
  green: '#4B5A3C',
  // Danger/alert contexts only (delete, decline, block, suspended) -
  // everything else that used to be rust-colored becomes brass instead.
  oxblood: '#5C2430',
  // Input placeholder text specifically wants a lighter touch than saddle
  // (which now reads as a fairly dark secondary-text color) - not part of
  // the named palette handed down, just a utility tint in the same family.
  placeholder: '#A08A6E',
} as const;

export const fonts = {
  // Weight 900 - reserved for the topbar/ScreenHeader title and the tag
  // badge number, matching steer-me_2.html's .topbar h1 and .tag span
  // rules exactly (both explicitly font-weight:900).
  display: 'PlayfairDisplay_900Black',
  // Weight 700 - every other Playfair usage: in-content h2-style section
  // headers, modal titles, and the Home hero name.
  displayBold: 'PlayfairDisplay_700Bold',
  mono: 'JetBrainsMono_700Bold',
  monoRegular: 'JetBrainsMono_400Regular',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
  body: 'WorkSans_400Regular',
  bodyMedium: 'WorkSans_500Medium',
  bodySemiBold: 'WorkSans_600SemiBold',
  bodyBold: 'WorkSans_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
} as const;

// Tightened across the board per the v2 design system - e.g. cards went
// from 8px to 5px, buttons/tiles from 10px to 6px, modals from 12px to 8px.
// Pill/circle shapes are unchanged (already maximally rounded).
export const radii = {
  sm: 6,
  md: 5,
  lg: 6,
  xl: 8,
  pill: 20,
  circle: 999,
} as const;

export const typeScale = {
  eyebrow: 11,
  helper: 12.5,
  meta: 12,
  body: 14,
  name: 15,
  h2: 22,
  h1: 28,
} as const;
