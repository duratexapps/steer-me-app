import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  required?: boolean;
};

// Mirrors the prototype's label + input pairing (uppercase espresso label,
// tan-light input with rope border). Any field passed secureTextEntry (Sign
// In, Create Account) automatically gets a show/hide eye icon rather than
// every screen wiring that up itself - the toggle just flips the actual
// secureTextEntry value the underlying TextInput gets, overriding whatever
// was passed in.
export function TextField({ label, required, style, secureTextEntry, ...inputProps }: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const isPasswordField = !!secureTextEntry;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *required</Text> : null}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor="#9c8a6b"
          style={[styles.input, isPasswordField && styles.inputWithIcon, style]}
          secureTextEntry={isPasswordField ? !revealed : secureTextEntry}
          {...inputProps}
        />
        {isPasswordField ? (
          <Pressable
            style={styles.toggle}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={10}
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.saddle} />
          </Pressable>
        ) : null}
      </View>
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
  inputRow: { position: 'relative' },
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
  inputWithIcon: { paddingRight: 44 },
  toggle: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
