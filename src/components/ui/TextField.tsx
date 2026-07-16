import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  required?: boolean;
};

// Mirrors the prototype's label + input pairing (uppercase espresso label,
// tan-light input with rope border).
export function TextField({ label, required, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *required</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor="#9c8a6b"
        style={[styles.input, style]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
  required: { color: colors.brass, textTransform: 'none' },
  input: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.saddle,
    backgroundColor: colors.tanLight,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
});
