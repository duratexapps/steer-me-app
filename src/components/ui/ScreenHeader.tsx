import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/src/theme/theme';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  big?: boolean;
  logo?: boolean;
  onHelp?: () => void;
};

// Mirrors .topbar - the espresso header bar with title + subtitle, and an
// optional back arrow (.back-row) for pushed screens. `logo` is only passed
// on the two screens that show the "Steer Me" brand title (role-select,
// sign-up) - every other screen shows its own screen name instead, per the
// prototype, so the logo doesn't belong there. `onHelp`, when passed, shows
// the small "?" button (.help-btn) that opens that screen's HelpModal topic.
export function ScreenHeader({ title, subtitle, onBack, big, logo, onHelp }: ScreenHeaderProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.bone} />
          </Pressable>
        ) : null}
        {logo ? <Image source={require('@/assets/logo.png')} style={styles.logo} contentFit="contain" /> : null}
        <Text style={[styles.title, big ? styles.titleBig : styles.titleSmall, styles.titleFlex]}>{title}</Text>
        {onHelp ? (
          <Pressable onPress={onHelp} hitSlop={10} style={styles.helpBtn}>
            <Text style={styles.helpBtnText}>?</Text>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.espresso,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { paddingRight: 4 },
  logo: { width: 44, height: 27 },
  title: {
    fontFamily: fonts.display,
    color: colors.bone,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  titleBig: { fontSize: 28 },
  titleSmall: { fontSize: 22 },
  titleFlex: { flexShrink: 1 },
  helpBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bone,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  helpBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.espresso },
  subtitle: {
    fontSize: 12,
    color: colors.saddle,
    marginTop: 2,
    fontFamily: fonts.bodyMedium,
  },
});
