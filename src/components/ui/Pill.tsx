import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';

type PillProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

// Mirrors .pill / .pill.sel toggle chips (age selector, event divisions, etc.).
export function Pill({ label, selected, onPress }: PillProps) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, selected && styles.selected]}>
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
    borderColor: colors.rope,
    backgroundColor: colors.tanLight,
  },
  selected: { backgroundColor: colors.rust, borderColor: colors.rust },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.leather },
  selectedLabel: { color: colors.cream },
});
