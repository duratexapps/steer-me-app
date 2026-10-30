import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { colors, fonts } from '@/src/theme/theme';

const DISMISS_KEY = 'photo-banner-dismissed';

// Added 2026-10-30. The profile photo is optional and asked for here once the account is active, not at sign-up
// (21 of 22 confirmed-but-unfinished accounts never added one). "Not now" hides it for good on this device.
export function PhotoNeededBanner({ padded }: { padded?: boolean }) {
  const { data: profile } = useMyProfile();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY)
      .then((v) => setDismissed(v === '1'))
      .catch(() => setDismissed(false));
  }, []);

  if (!profile || profile.avatar_url || dismissed) return null;
  const note = (
    <DividerNote>
      <Text style={{ fontFamily: fonts.bodyBold }}>Add a photo? </Text>
      A profile photo helps other ropers recognize you. It's optional.{' '}
      <Text style={styles.link} onPress={() => router.push('/edit-profile')}>
        Add photo
      </Text>
      {'   '}
      <Text
        style={styles.link}
        onPress={() => {
          setDismissed(true);
          AsyncStorage.setItem(DISMISS_KEY, '1').catch(() => {});
        }}
      >
        Not now
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
