import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';

type TagProps = {
  value: string | number;
  size?: 'default' | 'big';
};

// The circular rotated "brand tag" badge showing a classification number -
// the prototype's signature element (.tag / .tag.big).
export function Tag({ value, size = 'default' }: TagProps) {
  const big = size === 'big';
  return (
    <View style={[styles.tag, big && styles.tagBig]}>
      <Text style={[styles.text, big && styles.textBig]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.leather,
    borderWidth: 3,
    borderColor: colors.rope,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  tagBig: { width: 96, height: 96, borderRadius: 48 },
  text: {
    fontFamily: fonts.monoSemiBold,
    color: colors.cream,
    fontSize: 15,
    transform: [{ rotate: '4deg' }],
  },
  textBig: { fontSize: 26 },
});
