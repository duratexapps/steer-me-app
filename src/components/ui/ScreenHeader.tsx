import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/src/theme/theme';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  big?: boolean;
};

// Mirrors .topbar - the leather header bar with title + subtitle, and an
// optional back arrow (.back-row) for pushed screens.
export function ScreenHeader({ title, subtitle, onBack, big }: ScreenHeaderProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.cream} />
          </Pressable>
        ) : null}
        <Text style={[styles.title, big ? styles.titleBig : styles.titleSmall]}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.leather,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { paddingRight: 4 },
  title: {
    fontFamily: fonts.display,
    color: colors.cream,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  titleBig: { fontSize: 28 },
  titleSmall: { fontSize: 22 },
  subtitle: {
    fontSize: 12,
    color: colors.rope,
    marginTop: 2,
    fontFamily: fonts.bodyMedium,
  },
});
