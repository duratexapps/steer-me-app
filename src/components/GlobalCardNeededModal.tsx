import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { MEMBERSHIPS_URL, GLOBAL_REGISTER_URL } from '@/src/lib/global-card';
import { useGlobalCardPrompt } from '@/src/state/global-card-prompt-store';

type NoticeProps = {
  problem: 'missing' | 'expired';
  // Called after a button is used, so the host (modal) can close itself.
  onDone?: () => void;
  // The Finale board is a Global event, so its wording names the Finale instead of "this event".
  finale?: boolean;
};

// Shown wherever a roper without a current Global card runs into a WSTR / USTRC / Finale feature. It explains the
// rule and offers both ways forward: upload a card they already have, or get / renew a membership.
export function GlobalCardNotice({ problem, onDone, finale }: NoticeProps) {
  const what = finale ? 'The WSTR Finale requires' : 'WSTR and USTRC ropings require';
  return (
    <View>
      <Text style={styles.title}>{problem === 'expired' ? 'Your Global card looks expired' : 'A Global card is needed'}</Text>
      <Text style={styles.body}>
        {problem === 'expired'
          ? `${what} a current membership, and your Global Handicap card shows as expired. Renew it, then upload the new screenshot.`
          : `${what} a current membership, and every WSTR, USTRC or Key Card membership includes a Global Handicap card. Upload a screenshot of your card to continue, or get one first.`}
      </Text>
      <Button
        label="Upload my card"
        onPress={() => {
          onDone?.();
          router.push('/update-classification');
        }}
      />
      <Button
        label={problem === 'expired' ? 'Renew my membership' : 'Get a membership'}
        variant="outline"
        style={{ marginTop: 8 }}
        onPress={() => Linking.openURL(MEMBERSHIPS_URL)}
      />
      <Text style={styles.small}>
        Memberships are sold by WSTR and USTRC at wstroping.com and ustrc.com; Steer Me doesn't sell them. Only need the
        Global card?{' '}
        <Text style={styles.link} onPress={() => Linking.openURL(GLOBAL_REGISTER_URL)}>
          Register at Global Handicaps
        </Text>
        .
      </Text>
    </View>
  );
}

export function GlobalCardNeededModal() {
  const problem = useGlobalCardPrompt((s) => s.problem);
  const close = useGlobalCardPrompt((s) => s.close);
  if (!problem) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <GlobalCardNotice problem={problem} onDone={close} />
          <Pressable onPress={close} style={styles.notNow}>
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,20,10,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.bone, borderRadius: radii.xl, padding: 18, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.espresso, marginBottom: 8 },
  body: { fontFamily: fonts.body, fontSize: 13.5, color: colors.saddle, lineHeight: 19, marginBottom: 14 },
  small: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, lineHeight: 16, marginTop: 12 },
  link: { fontFamily: fonts.bodySemiBold, color: colors.brass, textDecorationLine: 'underline' },
  notNow: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: 4 },
  notNowText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.saddle },
});
