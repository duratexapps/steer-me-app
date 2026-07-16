import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';

type ToggleRowProps = {
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
};

// Mirrors .location-row / .switch - used for the Browse location toggle.
export function ToggleRow({ title, description, value, onToggle }: ToggleRowProps) {
  return (
    <Pressable style={styles.row} onPress={onToggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.espresso },
  description: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 2, lineHeight: 15 },
  track: { width: 44, height: 26, borderRadius: 14, backgroundColor: colors.saddle, justifyContent: 'center' },
  trackOn: { backgroundColor: colors.green },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.bone,
    marginLeft: 3,
  },
  knobOn: { marginLeft: 21 },
});
