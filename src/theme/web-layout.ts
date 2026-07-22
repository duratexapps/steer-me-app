import { Platform } from 'react-native';

// Single-focus form screens (Sign In, Create Event, Edit Profile, etc.)
// read as absurdly wide, stretched columns on a desktop browser without
// this - inputs and buttons that make sense at phone width look wrong
// spanning 1500+ px. Spreading this into a screen's ScrollView
// contentContainerStyle caps it at a comfortable reading width and centers
// it, with room on both sides. It's an empty object on native, so
// spreading it there is always a no-op.
export const webMaxWidth =
  Platform.OS === 'web' ? { maxWidth: 560, width: '100%' as const, alignSelf: 'center' as const } : {};
