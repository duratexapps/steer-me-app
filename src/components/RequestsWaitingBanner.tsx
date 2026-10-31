import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { useReceivedRequests } from '@/src/hooks/usePartnerRequests';
import { colors, fonts } from '@/src/theme/theme';

// Added 2026-10-31. Nothing used to tell a roper that someone had sent them a partner request; they only found out by
// opening My Requests. This shows on Home whenever requests are waiting for an answer.
export function RequestsWaitingBanner({ padded }: { padded?: boolean }) {
  const { data } = useReceivedRequests();
  const waiting = (data ?? []).filter((r) => r.status === 'pending').length;
  if (waiting === 0) return null;
  const note = (
    <DividerNote>
      <Text style={{ fontFamily: fonts.bodyBold }}>
        {waiting === 1 ? '1 partner request is waiting. ' : `${waiting} partner requests are waiting. `}
      </Text>
      <Text style={styles.link} onPress={() => router.push('/my-requests')}>
        View
      </Text>
    </DividerNote>
  );
  return padded ? <View style={styles.pad}>{note}</View> : note;
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20, paddingTop: 16 },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.saddle, textDecorationLine: 'underline' },
});
