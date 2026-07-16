import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';

type ActionTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
};

// Mirrors .action-tile - the tappable rows on Home/Producer with a brass icon
// square, bold title, and helper description.
export function ActionTile({ icon, title, description, onPress }: ActionTileProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={colors.bone} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
  },
  pressed: { opacity: 0.8 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.espresso },
  description: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 1 },
});
