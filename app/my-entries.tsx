import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Button } from '@/src/components/ui/Button';
import { HelpModal } from '@/src/components/HelpModal';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { formatDateDisplay } from '@/src/lib/date';
import { showToast } from '@/src/state/toast-store';
import { confirmAsync } from '@/src/lib/confirm';
import { goBackOrHome } from '@/src/lib/navigation';
import {
  useMyDrawProEntries,
  useChooseExtraRunPayment,
  useRequestEntryCancellation,
  type DrawProEntry,
  type DrawProRoundResult,
  type DrawProExtraRunCharge,
} from '@/src/hooks/useDrawProEntries';

// draw_pro_entry_links.role is lowercase ('header'/'heeler', matching the
// meRole/partnerRole convention already used by useEntryHandoff.ts) -
// distinct from src/lib/matching.ts's Position type ('Header'/'Heeler'/
// 'Switch'), so a plain capitalize here instead of reusing formatPosition().
function formatRole(role: 'header' | 'heeler') {
  return role === 'header' ? 'Header' : 'Heeler';
}

// NEW, added 2026-08-06 - submitted_at is a full timestamp, not a plain
// date - formatDateDisplay() assumes the latter (appends T00:00:00, which
// would double up a real time component here), so this is its own small
// formatter rather than stretching that one to cover both shapes.
function formatSubmittedAt(isoTimestamp: string) {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// NEW, added 2026-07-31 - closes the loop the Draw Pro entry-link/round-
// results pipeline exists for: a Steer Me user who entered an event
// through the app (see EventCard.tsx / my-requests.tsx's "Enter the
// Draw") can check their own team number and round results here without
// leaving the app or contacting the producer. See supabase/RUNBOOK.md's
// "Draw Pro results hand-off" section for the full pipeline.
//
// REWRITTEN 2026-08-06 - real gap flagged directly by the producer's own
// live testing: this used to group entries by EVENT, with one Cancel
// button per event that couldn't say which of several separate entries it
// meant. Now shows one card PER ENTRY, flat - if you entered the same
// event three times across three sessions, you see three separate cards,
// each showing exactly what that one entry was and with its own Cancel
// button that only touches that one entry.
export default function MyEntries() {
  const { data: entries, isLoading } = useMyDrawProEntries();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="My Entries"
        subtitle="Team numbers & results for events you've entered that producers sync on our platform. If your producer isn't using Draw Pro, introduce them."
        onBack={() => goBackOrHome()}
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

function describeEntry(entry: DrawProEntry) {
  if (entry.entry_type === 'preformed_team') {
    return entry.partner_name
      ? `Entered with partner: ${entry.partner_name}${entry.partner_classification_number != null ? ` (${entry.partner_classification_number})` : ''}`
      : 'Entered with a partner (pending)';
  }
  return entry.requested_run_count === 1 ? '1 draw-in run' : `${entry.requested_run_count} draw-in runs`;
}

function EntryCard({ entry }: { entry: DrawProEntry }) {
  const partner =
    entry.partner_name != null
      ? `${entry.partner_name}${entry.partner_classification_number != null ? ` (${entry.partner_classification_number})` : ''}`
      : 'Partner TBD';

  return (
    <View style={styles.card}>
      <Text style={styles.eventName}>{entry.event_name}</Text>
      {entry.event_date ? <Text style={styles.eventDate}>{formatDateDisplay(entry.event_date)}</Text> : null}
      <View style={styles.metaRow}>
        {entry.role ? <Text style={styles.metaText}>{formatRole(entry.role)}</Text> : null}
        <Text style={styles.metaText}>{describeEntry(entry)}</Text>
      </View>
      <Text style={styles.submittedAtText}>Entered {formatSubmittedAt(entry.submitted_at)}</Text>

      {entry.team_number == null ? (
        <CancelEntrySection entry={entry} />
      ) : (
        <View style={styles.teamBlock}>
          <View style={styles.metaRow}>
            <View style={styles.teamNumberPill}>
              <Text style={styles.teamNumberText}>
                Team #{entry.team_number}{entry.total_teams != null ? ` of ${entry.total_teams}` : ''}
              </Text>
            </View>
            {entry.entry_type === 'draw_in' ? <Text style={styles.partnerText}>{partner}</Text> : null}
          </View>

          {entry.extraRunCharge ? <ExtraRunCard teamNumber={entry.team_number} charge={entry.extraRunCharge} /> : null}

          {entry.results.length > 0 ? (
            <View style={styles.resultsBlock}>
              {entry.results.map((result) => (
                <RoundRow key={result.id} result={result} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

// NEW, added 2026-08-06 - see migration 0048_draw_pro_per_entry_tracking.sql.
// Real-world policy confirmed directly by the producer: before the draw
// runs, backing out gets you removed from the pool (entry fee refunded
// minus processing fees, handled by the producer outside this app) -
// after the draw runs it's a "turn out" instead (no refund, marked No
// Time), a completely different mechanic already covered by Draw Pro's
// own round-results flow. Only ever shown pre-draw (entry.team_number ==
// null already gates this) since the RPC itself also rejects a request
// once a team exists - this is just the matching UI-side early read, not
// the actual enforcement. Targets THIS one entry specifically now, not
// "something at this event" - the real gap that prompted this whole
// rebuild.
function CancelEntrySection({ entry }: { entry: DrawProEntry }) {
  const { mutate, isPending } = useRequestEntryCancellation();

  if (entry.cancellation_requested_at) {
    return (
      <View style={styles.cancelRequestedBox}>
        <Text style={styles.cancelRequestedText}>
          Cancellation requested — your producer still needs to process this.
        </Text>
      </View>
    );
  }

  async function confirmCancel() {
    const confirmed = await confirmAsync(
      'Cancel this entry?',
      "Your producer will remove you from the pool and process your refund (processing fees aren't refunded). " +
        (entry.entry_type === 'preformed_team'
          ? 'Your partner will be notified.'
          : "This only cancels this one entry - any other entries you've made for this event are unaffected."),
      'Cancel entry'
    );
    if (!confirmed) return;

    mutate(
      { entryId: entry.id },
      {
        onError: (err) => showToast(err instanceof Error ? err.message : 'Something went wrong.'),
      }
    );
  }

  return (
    <Button
      label="Cancel Entry"
      variant="outline"
      disabled={isPending}
      loading={isPending}
      onPress={confirmCancel}
      style={{ marginTop: 10 }}
    />
  );
}

// NEW, added 2026-08-05 - see migration 0046_draw_pro_extra_run_charges.sql
// and useChooseExtraRunPayment()'s own comment. Real gap flagged directly
// by the producer: a manual pairing on the Draw Pro side can knowingly
// give someone an extra run beyond what they already paid for - this is
// the "as is usually the case" pay-or-take-reduced-winnings choice for
// that entrant, made once and read back by the producer via Draw Pro's
// own draw sheet (see that side's own comment for the read-back path).
// "Paid" here means "I agree to pay" - Steer Me never processes the
// charge itself, the producer collects it however that event already
// takes payment (cash at the window, or Draw Pro's own online flow).
// Both choices are one-time and irreversible (the RPC only allows a
// decision while status is still 'pending'), so both get a confirm
// prompt rather than firing on a single tap.
function ExtraRunCard({ teamNumber, charge }: { teamNumber: number; charge: DrawProExtraRunCharge }) {
  const { mutate, isPending } = useChooseExtraRunPayment();

  async function confirmDecision(decision: 'paid' | 'declined') {
    const title = decision === 'paid' ? 'Pay the extra run fee?' : 'Decline the extra run?';
    const message =
      decision === 'paid'
        ? `You're agreeing to pay $${charge.fee_amount.toFixed(2)} for the extra run on Team #${teamNumber}. This can't be undone here - the producer will collect it.`
        : `You're declining the extra run on Team #${teamNumber}. Your winnings for that run will be reduced instead of paying the $${charge.fee_amount.toFixed(2)} fee. This can't be undone.`;

    const confirmed = await confirmAsync(title, message, decision === 'paid' ? 'Pay' : 'Decline');
    if (!confirmed) return;

    mutate(
      { chargeId: charge.id, decision },
      {
        onError: (err) => showToast(err instanceof Error ? err.message : 'Something went wrong.'),
      }
    );
  }

  if (charge.status === 'paid') {
    return (
      <View style={[styles.extraRunCard, styles.extraRunCardDecided]}>
        <Text style={styles.extraRunDecidedText}>Extra run — you agreed to pay ${charge.fee_amount.toFixed(2)}</Text>
      </View>
    );
  }
  if (charge.status === 'declined') {
    return (
      <View style={[styles.extraRunCard, styles.extraRunCardDecided]}>
        <Text style={styles.extraRunDecidedText}>Extra run — declined, winnings will be reduced</Text>
      </View>
    );
  }

  return (
    <View style={styles.extraRunCard}>
      <Text style={styles.extraRunTitle}>Extra run</Text>
      <Text style={styles.extraRunBody}>
        The producer gave you an extra run on this team beyond what you already paid for. Pay ${charge.fee_amount.toFixed(2)}, or decline and take reduced winnings on that run.
      </Text>
      <View style={styles.extraRunButtons}>
        <Button
          label="Decline"
          variant="outline"
          disabled={isPending}
          onPress={() => confirmDecision('declined')}
          style={{ flex: 1 }}
        />
        <Button
          label={`Pay $${charge.fee_amount.toFixed(2)}`}
          disabled={isPending}
          loading={isPending}
          onPress={() => confirmDecision('paid')}
          style={{ flex: 1 }}
        />
      </View>
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  metaText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle },
  submittedAtText: { fontFamily: fonts.body, fontSize: 11, color: colors.tan, marginTop: 2 },
  teamBlock: { marginTop: 10 },
  teamNumberPill: {
    backgroundColor: colors.brass,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  teamNumberText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.bone },
  partnerText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.espresso, flexShrink: 1 },
  resultsBlock: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.saddle, paddingTop: 8, gap: 8 },
  roundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.espresso },
  noTimeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.oxblood },
  finalTimeText: { fontFamily: fonts.mono, fontSize: 14, color: colors.brass },
  penaltyText: { fontFamily: fonts.body, fontSize: 10.5, color: colors.saddle, marginTop: 1 },
  extraRunCard: {
    marginTop: 8,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.oxblood,
    backgroundColor: colors.bone,
  },
  extraRunTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.oxblood },
  extraRunBody: { fontFamily: fonts.body, fontSize: 12, color: colors.espresso, marginTop: 3, lineHeight: 17 },
  extraRunButtons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  extraRunCardDecided: { borderColor: colors.saddle, backgroundColor: colors.tanLight },
  extraRunDecidedText: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle },
  cancelRequestedBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.saddle,
    backgroundColor: colors.bone,
  },
  cancelRequestedText: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle },
});
