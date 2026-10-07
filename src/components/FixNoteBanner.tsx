import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { colors, fonts } from '@/src/theme/theme';

// Shows the admin-written profiles.fix_note (migration 0068), e.g. "Please
// re-upload your Global Handicap card". The note is cleared automatically
// when the user completes Update my classification.
export function FixNoteBanner({ padded }: { padded?: boolean }) {
  const { data: profile } = useMyProfile();
  if (!profile?.fix_note) return null;
  const note = (
    <DividerNote>
      <Text style={{ fontFamily: fonts.bodyBold }}>Action needed. </Text>
      {profile.fix_note}{' '}
      <Text style={styles.link} onPress={() => router.push('/update-classification')}>
        Update now
      </Text>
    </DividerNote>
  );
  return padded ? <View style={styles.pad}>{note}</View> : note;
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20, paddingTop: 16 },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.saddle,
    textDecorationLine: 'underline',
  },
});
