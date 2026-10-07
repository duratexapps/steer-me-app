import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';

type PillProps = {
  label: string;
  selected?: boolean;
  // Highlights a chip that is "hot" right now (see useHotspots) without selecting it.
  hot?: boolean;
  onPress: () => void;
};

// Mirrors .pill / .pill.sel toggle chips (age selector, event divisions, etc.).
export function Pill({ label, selected, hot, onPress }: PillProps) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, hot && !selected && styles.hot, selected && styles.selected]}>
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.saddle,
    backgroundColor: colors.tanLight,
  },
  hot: { borderColor: colors.brass, backgroundColor: '#F1E2B4' },
  selected: { backgroundColor: colors.brass, borderColor: colors.brass },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.espresso },
  selectedLabel: { color: colors.bone },
});
