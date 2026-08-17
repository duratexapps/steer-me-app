import { Alert, Platform } from 'react-native';

// Real bug flagged directly by the user: react-native-web's Alert.alert()
// is a literal no-op stub (see node_modules/react-native-web/src/exports/
// Alert/index.js - `static alert() {}`, does nothing at all) - every
// Alert.alert() confirmation in this app has been silently non-functional
// on web the whole time, not just the screen this was first noticed on.
// window.confirm() is the real, working browser equivalent - less
// customizable (no separate destructive styling, no more than two
// buttons), but it actually appears, which a native Alert.alert() call on
// web does not. Promise-based so call sites read the same on both
// platforms regardless of which underlying mechanism actually ran.
export function confirmAsync(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
