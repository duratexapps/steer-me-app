import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { PartnerCard } from '@/src/components/PartnerCard';
import { ReportModal } from '@/src/components/ReportModal';
import { colors, fonts } from '@/src/theme/theme';
import { goBackOrHome } from '@/src/lib/navigation';
import { formatDivision } from '@/src/lib/matching';
import { activeFinaleYears, FINALE_CLASSES } from '@/src/lib/finale';
import { showToast } from '@/src/state/toast-store';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useMyFinaleFlags, useSaveFinaleFlags, type FinaleFlag } from '@/src/hooks/useFinaleFlags';
import { useEligiblePartners, type PublicProfile } from '@/src/hooks/useEligiblePartners';
import { useSentRequests, useSendRequest } from '@/src/hooks/usePartnerRequests';
import { useBlockUser } from '@/src/hooks/useBlocking';
import { useFavorites, useToggleFavorite } from '@/src/hooks/useFavorites';
import { useSubmitUserReport, USER_REPORT_OFFENSES } from '@/src/hooks/useReporting';
import { useRequireSubscription } from '@/src/hooks/useSubscriptionStatus';

// WSTR Finale partner board. There is no blind draw at the Finale, so a
// roper who qualified but lost their partner (drawn partner already in,
// injury, family emergency, travel costs) has to find someone else in the
// same class. Both flags are self-reported and permanent - ropers can flip
// them on and off any time of year as they qualify or change their mind.
// Flags are kept per Finale year (migration 0070) and two years are always
// open: next year's qualifiers start before this year's Finale has run.
// Eligibility reuses the same canPair() math as Browse, via
// useEligiblePartners(cap).
export default function FinaleBoard() {
  const { data: me } = useMyProfile();
  const { data: myFlags } = useMyFinaleFlags();
  const saveFlag = useSaveFinaleFlags();
  const requireSubscription = useRequireSubscription();
  const years = activeFinaleYears();
  const [year, setYear] = useState<number>(years[0]);

  const [cap, setCap] = useState<number>(FINALE_CLASSES[3]);
  const [saving, setSaving] = useState(false);
  // A class pill tapped while listed as qualified, but that isn't one of my
  // qualified classes yet - asks before adding so browsing never changes what
  // other ropers see about me.
  const [pendingClass, setPendingClass] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<PublicProfile | null>(null);

  const { data: partners, isLoading } = useEligiblePartners(cap, null);
  const { data: sentRequests } = useSentRequests();
  const sendRequest = useSendRequest();
  const blockUser = useBlockUser();
  const submitReport = useSubmitUserReport();
  const { data: favorites } = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const requestedIds = useMemo(() => new Set((sentRequests ?? []).map((r) => r.recipient_id)), [sentRequests]);
  const favoriteIds = useMemo(() => new Set((favorites ?? []).map((f) => f.id)), [favorites]);

  const qualified = (partners ?? []).filter((p) => !!p.finale_flags?.[year]?.classes?.includes(cap));
  const buyIn = (partners ?? []).filter((p) => !!p.finale_flags?.[year]?.buyIn && !qualified.includes(p));
  const rows: { section: string; p: PublicProfile }[] = [
    ...qualified.map((p) => ({ section: 'q', p })),
    ...buyIn.map((p) => ({ section: 'b', p })),
  ];

  if (!me) return null;

  const myFlag: FinaleFlag = myFlags?.[year] ?? { classes: null, buyIn: false };
  const myClasses = [...(myFlag.classes ?? [])].sort((a, b) => a - b);
  const iAmQualified = myClasses.length > 0;
  const iWillBuyIn = myFlag.buyIn;

  async function saveClasses(classes: number[]) {
    await saveFlags({ ...myFlag, classes: classes.length ? classes : null });
  }

  function pickClass(c: number) {
    setCap(c);
    setPendingClass(iAmQualified && !myClasses.includes(c) ? c : null);
  }

  async function saveFlags(flag: FinaleFlag) {
    setSaving(true);
    try {
      await saveFlag.mutateAsync({ year, flag });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save');
    }
    setSaving(false);
  }

  async function handleRequest(partner: PublicProfile) {
    if (!requireSubscription()) return;
    try {
      await sendRequest.mutateAsync({ recipientId: partner.id, division: cap });
      showToast(
        partner.is_minor ? `Request routed to ${partner.full_name}'s guardian for approval` : `Request sent to ${partner.full_name}`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send request');
    }
  }

  const noClassification =
    me.position === 'Switch'
      ? me.header_classification == null && me.heeler_classification == null
      : me.global_classification == null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="WSTR Finale Partners"
        subtitle={`Qualified ropers who need a partner · Finale ${year}`}
        onBack={() => goBackOrHome()}
      />
      <FlatList
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(item) => `${item.section}-${item.p.id}`}
        ListHeaderComponent={
          <>
            <DividerNote>
              There's no blind draw at the Finale. If you qualified but your partner can't go, or your drawn
              partner was already in, find someone in your class here. Both options below are self-reported and
              not checked by Steer Me.
            </DividerNote>

            <Text style={styles.eyebrow}>Finale year</Text>
            <View style={styles.pillWrap}>
              {years.map((y) => (
                <Pill
                  key={y}
                  label={`${y} Finale`}
                  selected={year === y}
                  onPress={() => {
                    setYear(y);
                    setPendingClass(null);
                  }}
                />
              ))}
            </View>
            <Text style={styles.sub}>
              Next year's qualifiers start before this year's Finale, so you can flag both.
            </Text>

            <Text style={styles.eyebrow}>Your status</Text>
            <ToggleRow
              title={`I'm qualified for the ${year} Finale and need a partner`}
              description={iAmQualified ? `Listed as qualified in ${myClasses.map((c) => formatDivision(c)).join(', ')}` : `Pick your class below, then turn this on`}
              value={iAmQualified}
              onToggle={() => {
                if (saving) return;
                if (iAmQualified) saveClasses([]);
                else if (noClassification) showToast('Verify your classification first');
                else saveClasses([cap]);
              }}
            />
            <ToggleRow
              title="I'll buy in for a qualified roper who needs a partner"
              description="Ropers in your class can find you if you're willing to travel and enter"
              value={iWillBuyIn}
              onToggle={() => {
                if (saving) return;
                if (iWillBuyIn) saveFlags({ ...myFlag, buyIn: false });
                else if (noClassification) showToast('Verify your classification first');
                else saveFlags({ ...myFlag, buyIn: true });
              }}
            />

            {iAmQualified ? (
              <>
                <Text style={styles.eyebrow}>You're listed in</Text>
                <View style={styles.pillWrap}>
                  {myClasses.map((c) => (
                    <Pill
                      key={c}
                      label={`#${c}  ✕`}
                      selected
                      onPress={() => {
                        if (saving) return;
                        setPendingClass(null);
                        saveClasses(myClasses.filter((x) => x !== c));
                      }}
                    />
                  ))}
                </View>
                <Text style={styles.sub}>Tap one to remove it. You can be qualified in more than one class.</Text>
              </>
            ) : null}

            <Text style={styles.eyebrow}>Finale class</Text>
            <View style={styles.pillWrap}>
              {FINALE_CLASSES.map((c) => (
                <Pill key={c} label={`#${c}`} selected={cap === c} onPress={() => pickClass(c)} />
              ))}
            </View>
            {pendingClass != null ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>
                  Are you also qualified in {formatDivision(pendingClass)}? Other ropers will see it on your card.
                </Text>
                <Button
                  label={`Yes, add ${formatDivision(pendingClass)}`}
                  loading={saving}
                  onPress={async () => {
                    await saveClasses([...myClasses, pendingClass]);
                    setPendingClass(null);
                  }}
                />
                <Button label="No, just looking" variant="ghost" onPress={() => setPendingClass(null)} style={{ marginTop: 6 }} />
              </View>
            ) : null}
            <Text style={styles.sub}>
              Partners who fit a {formatDivision(cap)} team with you: qualified ropers first, then ropers
              willing to buy in.
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <PartnerCard
            partner={item.p}
            alreadyRequested={requestedIds.has(item.p.id)}
            isFavorite={favoriteIds.has(item.p.id)}
            onToggleFavorite={() => toggleFavorite.mutate({ favoriteId: item.p.id, isFavorite: favoriteIds.has(item.p.id) })}
            onRequest={() => handleRequest(item.p)}
            onReport={() => setReportTarget(item.p)}
            onBlock={() => blockUser.mutate(item.p.id)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.brass} style={{ marginTop: 20 }} />
          ) : (
            <DividerNote>
              Nobody on the board fits a {formatDivision(cap)} team with you yet. Turn on your status above so
              others in your class can find you, or{' '}
              <Text style={styles.link} onPress={() => router.push('/(tabs)/browse')}>
                browse all eligible partners
              </Text>
              .
            </DividerNote>
          )
        }
      />
      {reportTarget ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          targetName={reportTarget.full_name}
          contentRef={`Finale board card — ${reportTarget.full_name}, ${reportTarget.position}, ${reportTarget.home_area}`}
          offenses={USER_REPORT_OFFENSES}
          submitting={submitReport.isPending}
          onSubmit={(offense, description) =>
            submitReport.mutateAsync({
              targetUserId: reportTarget.id,
              offense,
              description,
              contentRef: `Finale board card — ${reportTarget.full_name}, ${reportTarget.position}, ${reportTarget.home_area}`,
            })
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.brass,
    marginBottom: 8,
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginBottom: 14 },
  confirmBox: {
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  confirmText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso, marginBottom: 10 },
  link: { fontFamily: fonts.bodySemiBold, color: colors.saddle, textDecorationLine: 'underline' },
});
