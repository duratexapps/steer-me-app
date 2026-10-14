import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Button } from '@/src/components/ui/Button';
import { HelpModal } from '@/src/components/HelpModal';
import { NoticePreference } from '@/src/components/NoticePreference';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { formatDateDisplay, relativeTime } from '@/src/lib/date';
import { showToast } from '@/src/state/toast-store';
import { confirmAsync } from '@/src/lib/confirm';
import { goBackOrHome } from '@/src/lib/navigation';
import type { LiveProgressRow } from '@/src/lib/live-progress';
import { buildRoundRows, type RoundRowKind } from '@/src/lib/round-rows';
import { buildResultsText, hasSavableResults } from '@/src/lib/results-text';
import { groupEntries } from '@/src/lib/group-entries';
import {
  useMyDrawProEntries,
  useLiveProgress,
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
// 1st, 2nd, 3rd, 11th ... for the standing line.
function ordinal(n: number): string {
  const v = n % 100;
  const suffix = ['th', 'st', 'nd', 'rd'];
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

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
  // FIXED - real bug found alongside the offline-resilience work: this
  // never checked isError before, so a failed fetch (entries: undefined,
  // isLoading: false) fell straight into the empty-state branch below,
  // indistinguishable from a real "you have no entries" account. Now a
  // failure only looks like "no entries" if it's ALSO true there's no
  // cached data to fall back on - see the render logic below.
  const { data: entries, isLoading, isError, dataUpdatedAt, refetch } = useMyDrawProEntries();
  const [helpOpen, setHelpOpen] = useState(false);

  const hasEntries = !!entries && entries.length > 0;
  const { data: liveProgress } = useLiveProgress((entries ?? []).map((e) => e.event_id));

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
      ) : isError && !hasEntries ? (
        <View style={styles.content}>
          <Text style={styles.empty}>Couldn't load your entries. Check your connection.</Text>
          <Button label="Retry" onPress={() => refetch()} style={{ marginTop: 12 }} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {isError && hasEntries && (
            <Text style={styles.staleBanner} onPress={() => refetch()}>
              Showing results from {relativeTime(dataUpdatedAt)} — tap to retry
            </Text>
          )}
          <NoticePreference variant="entries" />
          {!hasEntries ? (
            <Text style={styles.empty}>
              Once you tap "Enter the Draw" on an event, your team number and results will show up here as the
              producer runs the draw and enters results.
            </Text>
          ) : (
            groupEntries(entries!).map((g) => <EntryCard key={g.entry.id} entry={g.entry} teams={g.teams} live={liveProgress} />)
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

// One card per entry. An entry that produced more than one team (an extra run, or a
// two-run draw-in) shows its event, class, entry code, QR and paid status once, then one
// section per drawn team underneath. See src/lib/group-entries.ts.
function EntryCard({
  entry,
  teams,
  live,
}: {
  entry: DrawProEntry;
  teams: DrawProEntry[];
  live?: Map<string, LiveProgressRow>;
}) {
  const drawn = entry.team_number != null;
  // "14 teams" beside the event name once the draw has been posted.
  const teamCount = drawn ? teams.reduce((m, t) => Math.max(m, t.total_teams ?? 0), 0) : 0;
  const liveRow = drawn && entry.draw_pro_class_id ? live?.get(`${entry.event_id}|${entry.draw_pro_class_id}`) : undefined;

  return (
    <View style={styles.card}>
      <Text style={styles.eventName}>
        {entry.event_name}
        {teamCount > 0 ? <Text style={styles.teamCountText}>{` \u00A0·\u00A0${teamCount}\u00A0teams`}</Text> : null}
      </Text>
      {entry.event_date ? <Text style={styles.eventDate}>{formatDateDisplay(entry.event_date)}</Text> : null}
      {entry.draw_pro_class_name ? <Text style={styles.classLabel}>{entry.draw_pro_class_name}</Text> : null}
      <View style={styles.metaRow}>
        {entry.role ? <Text style={styles.metaText}>{formatRole(entry.role)}</Text> : null}
        <Text style={styles.metaText}>{describeEntry(entry)}</Text>
      </View>
      <Text style={styles.submittedAtText}>Entered {formatSubmittedAt(entry.submitted_at)}</Text>

      {/* The code and QR are only for paying; once the team is drawn they are not needed. */}
      {entry.entry_code && !entry.cancellation_requested_at && !drawn ? <EntryCodeBlock entry={entry} /> : null}
      <EntryStatusLine entry={entry} />

      {!drawn ? (
        <CancelEntrySection entry={entry} />
      ) : (
        teams.map((team, i) => <TeamSection key={team.id} entry={team} live={live} separated={i > 0} />)
      )}

      {liveRow && liveRow.class_status !== 'complete' ? (
        <Text style={styles.tickerNote}>
          Live progress comes from the producer's Draw Pro entries and may lag (updated{' '}
          {relativeTime(new Date(liveRow.updated_at).getTime())}).
        </Text>
      ) : null}
    </View>
  );
}

// One drawn team inside an entry card: a heading with its number and partner, then one
// row per round that has started ("12 away" until the time is logged, then the time).
function TeamSection({
  entry,
  live,
  separated,
}: {
  entry: DrawProEntry;
  live?: Map<string, LiveProgressRow>;
  separated: boolean;
}) {
  const liveRow = entry.draw_pro_class_id ? live?.get(`${entry.event_id}|${entry.draw_pro_class_id}`) : undefined;
  const rows = buildRoundRows(entry, liveRow);
  const partner =
    entry.partner_name != null
      ? `${entry.partner_name}${entry.partner_classification_number != null ? ` (${entry.partner_classification_number})` : ''}`
      : 'Partner TBD';

  return (
    <View style={[styles.teamBlock, separated && styles.teamBlockSeparated]}>
      <Text style={styles.teamHeading}>
        Team #{entry.team_number}
        {entry.entry_type === 'draw_in' ? <Text style={styles.teamPartner}>{`  ·  ${partner}`}</Text> : null}
      </Text>

      <View style={styles.roundList}>
        {rows.map((r) => (
          <View key={r.round} style={styles.roundRow}>
            <Text style={styles.roundLabel}>Round {r.round}</Text>
            <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
              <Text style={roundValueStyle(r.kind)}>
                {r.text}
                {r.standing ? <Text style={styles.standingInline}>{`  ·  ${r.standing}`}</Text> : null}
              </Text>
              {r.note ? <Text style={styles.penaltyText}>{r.note}</Text> : null}
            </View>
          </View>
        ))}
      </View>

      {entry.extraRunCharge ? <ExtraRunCard teamNumber={entry.team_number!} charge={entry.extraRunCharge} /> : null}

      {hasSavableResults(entry) ? <SaveResultsLink entry={entry} /> : null}
    </View>
  );
}

function roundValueStyle(kind: RoundRowKind) {
  switch (kind) {
    case 'time':
      return styles.finalTimeText;
    case 'no_time':
      return styles.noTimeText;
    case 'up_now':
    case 'on_deck':
      return styles.upNextText;
    case 'away':
      return styles.awayText;
    default:
      return styles.mutedRoundText;
  }
}

// NEW, 2026-10-12 - "Save my results". Shares the entry's results as plain text so
// an athlete can keep them in Notes, Messages, email or any app they like. Text, not
// an image, on purpose: it needs no new native module, so it ships as a normal update.
// On phones this opens the share sheet; in a mobile browser it uses the browser's
// share sheet, and on a desktop browser it copies the text.
function SaveResultsLink({ entry }: { entry: DrawProEntry }) {
  async function handleSave() {
    const text = buildResultsText(entry);
    try {
      if (Platform.OS === 'web') {
        const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : null;
        if (nav?.share) {
          await nav.share({ text });
        } else if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(text);
          showToast('Results copied. Paste them into a note or message.');
        } else {
          showToast('Could not save results on this browser');
        }
        return;
      }
      await Share.share({ message: text });
    } catch (err) {
      // A cancelled share sheet throws an AbortError on the web; that is not a failure.
      if (err instanceof Error && err.name === 'AbortError') return;
      showToast('Could not save results');
    }
  }
  return (
    <Pressable onPress={handleSave} hitSlop={8} style={styles.saveLink} accessibilityRole="button">
      <Text style={styles.saveLinkText}>Save my results</Text>
    </Pressable>
  );
}

// NEW, 2026-10-11 - migration 0085. What Draw Pro last reported for this
// entry. A left-out entrant gets no team notification by design, so without
// this line they would just see nothing and not know why. Only shown before a
// team exists and while no cancellation is pending; "Paid" shows any time.
function EntryStatusLine({ entry }: { entry: DrawProEntry }) {
  if (entry.draw_pro_status === 'left_out_unpaid' && entry.team_number == null && !entry.cancellation_requested_at) {
    return (
      <View style={styles.leftOutBox}>
        <Text style={styles.leftOutTitle}>Not in the draw yet</Text>
        <Text style={styles.leftOutBody}>
          Your entry hasn't been marked paid, so it wasn't included in the draw. Check with the producer at the window.
        </Text>
      </View>
    );
  }
  if (entry.draw_pro_status === 'paid') {
    return (
      <View style={styles.paidPill}>
        <Text style={styles.paidPillText}>Paid</Text>
      </View>
    );
  }
  return null;
}

// NEW, 2026-10-11 - see migration 0083_draw_pro_entry_code.sql and
// DOCS/steer-me-draw-pro-entry-code-handoff.md. At a cash roping an entrant
// who entered from their phone often pays at the window; Draw Pro gives each
// submission a short code plus a pay link, and the secretary opens that link
// from the QR to pull the entry up. The code is large and monospace because
// it gets read aloud and typed. pay_url is a secret: it only ever goes into
// the QR, never into text, a share sheet, a log or analytics.
function EntryCodeBlock({ entry }: { entry: DrawProEntry }) {
  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.codeLabel}>Entry code</Text>
          <Text style={styles.codeText} selectable>
            {entry.entry_code}
          </Text>
        </View>
        {entry.pay_url ? (
          <View style={styles.qrBox}>
            <QRCode value={entry.pay_url} size={104} backgroundColor={colors.bone} color={colors.espresso} />
          </View>
        ) : null}
      </View>
      <Text style={styles.codeCaption}>Show this at the window when you pay.</Text>
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

const styles = StyleSheet.create({
  teamCountText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.saddle },
  teamHeading: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.espresso },
  teamPartner: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle },
  roundList: { marginTop: 6, gap: 6 },
  upNextText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.oxblood },
  awayText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.espresso },
  mutedRoundText: { fontFamily: fonts.body, fontSize: 13, color: colors.saddle },
  standingInline: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle },
  saveLink: { alignSelf: 'flex-start', marginTop: 8 },
  saveLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.brass, textDecorationLine: 'underline' },
  teamBlockSeparated: { marginTop: 14, paddingTop: 14, borderTopWidth: 1.5, borderTopColor: colors.saddle, borderStyle: 'dashed' },
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
  staleBanner: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brass,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginBottom: 12,
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
  classLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.brass, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  metaText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle },
  submittedAtText: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 2 },
  tickerBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.green,
    backgroundColor: colors.bone,
  },
  tickerLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.green,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tickerHeadline: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.espresso, marginTop: 2 },
  tickerDetail: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginTop: 2 },
  tickerNote: { fontFamily: fonts.body, fontSize: 10.5, color: colors.saddle, marginTop: 6 },
  standingBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brass,
    backgroundColor: colors.bone,
  },
  standingLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.saddle,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  standingText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.espresso },
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
  leftOutBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.oxblood,
    backgroundColor: colors.bone,
  },
  leftOutTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.oxblood },
  leftOutBody: { fontFamily: fonts.body, fontSize: 12, color: colors.espresso, marginTop: 3, lineHeight: 17 },
  paidPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.green,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  paidPillText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.bone },
  codeBlock: {
    marginTop: 10,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brass,
    backgroundColor: colors.bone,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.saddle,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeText: { fontFamily: fonts.mono, fontSize: 40, letterSpacing: 4, color: colors.espresso, marginTop: 2 },
  qrBox: { padding: 6, backgroundColor: colors.bone },
  codeCaption: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginTop: 8 },
});
