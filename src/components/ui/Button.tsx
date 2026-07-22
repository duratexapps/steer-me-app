import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

// Mirrors .btn-primary / .btn-outline / .btn-ghost / .btn-danger from the prototype.
export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.bone : colors.espresso} />
      ) : (
        <Text style={[styles.label, variantTextStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.45, cursor: 'auto' },
  pressed: { opacity: 0.85 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.brass },
  outline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.espresso },
  ghost: { backgroundColor: colors.tanLight, borderWidth: 1, borderColor: colors.saddle },
  danger: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.oxblood },
});

const variantTextStyles = StyleSheet.create({
  primary: { color: colors.bone },
  outline: { color: colors.espresso },
  ghost: { color: colors.espresso },
  danger: { color: colors.oxblood },
});
