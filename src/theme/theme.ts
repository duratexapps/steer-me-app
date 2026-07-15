// Palette and type scale ported 1:1 from steer-me.html's :root CSS custom properties.
export const colors = {
  tan: '#D8C39C',
  tanLight: '#F1E7D2',
  leather: '#5C3A21',
  leatherDark: '#3E2814',
  rust: '#A6432A',
  rope: '#B99860',
  ink: '#2A231C',
  cream: '#F8F2E4',
  green: '#4B5A3C',
} as const;

export const fonts = {
  display: 'Staatliches_400Regular',
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

export const radii = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
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
