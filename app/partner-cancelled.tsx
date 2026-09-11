import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { showToast } from '@/src/state/toast-store';
import { confirmAsync } from '@/src/lib/confirm';
import { goBackOrHome } from '@/src/lib/navigation';
import { useRequestEntryCancellation } from '@/src/hooks/useDrawProEntries';

// NEW, added 2026-08-19 alongside migration 0058 - the landing screen a
// "your partner cancelled" push now deep-links into (see the notification-
// response listener in app/_layout.tsx), replacing what used to be a
// purely informational notification with two real choices. Deliberately
// thin: both actions below are existing, already-working flows -
// useRequestEntryCancellation() (this file's own "Cancel entry" button,
// same as my-entries.tsx) and app/(tabs)/browse.tsx's existing event-
// scoped matching mode (eventId/division/eventName params, already used
// by EventCard's per-division "Partners" button) - this screen only
// exists to present the choice and route to whichever one is picked.
export default function PartnerCancelled() {
  const { entryId, eventId, eventName, division } = useLocalSearchParams<{
    entryId?: string;
    eventId?: string;
    eventName?: string;
    division?: string;
  }>();

  const requestCancellation = useRequestEntryCancellation();
  const [cancelling, setCancelling] = useState(false);

  // division arrives as a string (or empty) from the notification's data
  // payload - see migration 0058's own comment on why it can be missing
  // (a match formed before division tracking existed). Without it there's
  // no cap to search Browse under, so that path just isn't offered rather
  // than guessing.
  const divisionNumber = division ? parseFloat(division) : null;
  const canFindReplacement = !!eventId && divisionNumber !== null && !Number.isNaN(divisionNumber);

  function handleFindReplacement() {
    router.push({
      pathname: '/(tabs)/browse',
      params: { eventId: eventId!, division: String(divisionNumber), eventName: eventName ?? '' },
    });
  }

  async function handleCancelToo() {
    if (!entryId) return;
    const confirmed = await confirmAsync(
      'Cancel your entry too?',
      "Your producer will remove you from the pool and process your refund (processing fees aren't refunded).",
      'Cancel entry'
    );
    if (!confirmed) return;

    setCancelling(true);
    requestCancellation.mutate(
      { entryId },
      {
        onSuccess: () => {
          showToast('Entry cancelled');
          goBackOrHome('/my-entries');
        },
        onError: (err) => {
          setCancelling(false);
          showToast(err instanceof Error ? err.message : 'Something went wrong.');
        },
      }
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="Your Partner Cancelled"
        subtitle={eventName || undefined}
        onBack={() => goBackOrHome('/my-entries')}
      />
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🤝</Text>
          <Text style={styles.body}>
            Your partner cancelled their entry{eventName ? ` for ${eventName}` : ''}. If you still want the run,
            we'll find you a replacement.
          </Text>
        </View>

        {canFindReplacement ? (
          <Button label="Find a Replacement Partner" onPress={handleFindReplacement} style={{ marginTop: 20 }} />
        ) : (
          <Text style={styles.noDivisionNote}>
            We don't have a division on record for this match - open Eligible Partners from Browse to look for a
            replacement yourself.
          </Text>
        )}

        <Button
          label="Cancel My Entry Too"
          variant="outline"
          onPress={handleCancelToo}
          disabled={cancelling || !entryId}
          loading={cancelling}
          style={{ marginTop: 12 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
  card: {
    borderWidth: 1.5,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    backgroundColor: colors.tanLight,
    padding: 22,
    alignItems: 'center',
  },
  emoji: { fontSize: 32, marginBottom: 10 },
  body: { fontFamily: fonts.body, fontSize: 14.5, color: colors.ink, textAlign: 'center', lineHeight: 21 },
  noDivisionNote: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.saddle,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 17,
  },
});
