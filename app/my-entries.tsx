import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { formatDateDisplay } from '@/src/lib/date';
import { useMyDrawProEntries, type DrawProEntry, type DrawProRoundResult } from '@/src/hooks/useDrawProEntries';

// draw_pro_entry_links.role is lowercase ('header'/'heeler', matching the
// meRole/partnerRole convention already used by useEntryHandoff.ts) -
// distinct from src/lib/matching.ts's Position type ('Header'/'Heeler'/
// 'Switch'), so a plain capitalize here instead of reusing formatPosition().
function formatRole(role: 'header' | 'heeler') {
  return role === 'header' ? 'Header' : 'Heeler';
}

// NEW, added 2026-07-31 - closes the loop the Draw Pro entry-link/round-
// results pipeline exists for: a Steer Me user who entered an event
// through the app (see EventCard.tsx / my-requests.tsx's "Enter the
// Draw") can check their own team number and round results here without
// leaving the app or contacting the producer. See supabase/RUNBOOK.md's
// "Draw Pro results hand-off" section for the full pipeline.
export default function MyEntries() {
  const { data: entries, isLoading } = useMyDrawProEntries();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="My Entries"
        subtitle="Team numbers and results for events you entered"
        onBack={() => router.back()}
        onHelp={() => setHelpOpen(true)}
      />
      {isLoading ? (
        <ActivityIndicator color={colors.brass} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {!entries || entries.length === 0 ? (
            <Text style={styles.empty}>
              Once you tap "Enter the Draw" on an event, your team number and results will show up here as the
              producer runs the draw and enters results.
            </Text>
          ) : (
            entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
          )}
        </ScrollView>
      )}
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="my-entries" />
    </SafeAreaView>
  );
}

function EntryCard({ entry }: { entry: DrawProEntry }) {
  return (
    <View style={styles.card}>
      <Text style={styles.eventName}>{entry.event_name}</Text>
      {entry.event_date ? <Text style={styles.eventDate}>{formatDateDisplay(entry.event_date)}</Text> : null}
      <View style={styles.metaRow}>
        {entry.role ? <Text style={styles.metaText}>{formatRole(entry.role)}</Text> : null}
        {entry.team_number != null ? (
          <View style={styles.teamNumberPill}>
            <Text style={styles.teamNumberText}>Team #{entry.team_number}</Text>
          </View>
        ) : (
          <Text style={styles.metaText}>Team number not assigned yet</Text>
        )}
      </View>

      {entry.results.length > 0 ? (
        <View style={styles.resultsBlock}>
          {entry.results.map((result) => (
            <RoundRow key={result.id} result={result} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RoundRow({ result }: { result: DrawProRoundResult }) {
  if (result.no_time) {
    return (
      <View style={styles.roundRow}>
        <Text style={styles.roundLabel}>Round {result.round}</Text>
        <Text style={styles.noTimeText}>No Time</Text>
      </View>
    );
  }

  const penaltyNotes: string[] = [];
  if (result.broken_barrier) penaltyNotes.push('broken barrier');
  if (result.one_leg_catch) penaltyNotes.push('one-leg catch');

  return (
    <View style={styles.roundRow}>
      <Text style={styles.roundLabel}>Round {result.round}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.finalTimeText}>{result.final_time != null ? `${result.final_time}s` : '—'}</Text>
        {penaltyNotes.length > 0 ? (
          <Text style={styles.penaltyText}>
            {result.raw_time}s + {result.penalty_seconds}s ({penaltyNotes.join(', ')})
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.saddle,
    textAlign: 'center',
    marginTop: 30,
    lineHeight: 19,
  },
  card: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 14,
  },
  eventName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.espresso },
  eventDate: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  metaText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle },
  teamNumberPill: {
    backgroundColor: colors.brass,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  teamNumberText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.bone },
  resultsBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.saddle, paddingTop: 10, gap: 8 },
  roundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.espresso },
  noTimeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.oxblood },
  finalTimeText: { fontFamily: fonts.mono, fontSize: 14, color: colors.brass },
  penaltyText: { fontFamily: fonts.body, fontSize: 10.5, color: colors.saddle, marginTop: 1 },
});
