import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { colors, fonts } from '@/src/theme/theme';

// Added 2026-10-30 with the profile photo moved from "required to create a profile" to "required before a
// request is sent or accepted" (see src/lib/profile-photo.ts). Shown on Home until the photo is added.
export function PhotoNeededBanner({ padded }: { padded?: boolean }) {
  const { data: profile } = useMyProfile();
  if (!profile || profile.avatar_url) return null;
  const note = (
    <DividerNote>
      <Text style={{ fontFamily: fonts.bodyBold }}>One more step. </Text>
      Add a profile photo so partners can see who they are working with. You'll need it before you send or accept a
      partner request.{' '}
      <Text style={styles.link} onPress={() => router.push('/edit-profile')}>
        Add photo
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
