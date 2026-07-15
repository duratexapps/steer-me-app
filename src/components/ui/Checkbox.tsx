import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/src/theme/theme';

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

// Mirrors the inline checkbox + long label rows used for guardian consent
// and guidelines agreement.
export function Checkbox({ checked, onToggle, children }: CheckboxProps) {
  return (
    <Pressable onPress={onToggle} style={styles.row}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Ionicons name="checkmark" size={13} color={colors.cream} /> : null}
      </View>
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  box: {
    width: 19,
    height: 19,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.rope,
    backgroundColor: colors.tanLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, lineHeight: 17 },
});
