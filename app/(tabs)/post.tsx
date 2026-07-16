import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { NeedPostCard } from '@/src/components/NeedPostCard';
import { ReportModal } from '@/src/components/ReportModal';
import { colors, fonts } from '@/src/theme/theme';
import { useOpenNeedPosts, useMyNeedPosts, useDeleteNeedPost, type NeedPostWithPoster } from '@/src/hooks/useNeedPosts';
import { useSentRequests, useSendRequest } from '@/src/hooks/usePartnerRequests';
import { useBlockUser } from '@/src/hooks/useBlocking';
import { useSubmitUserReport, USER_REPORT_OFFENSES } from '@/src/hooks/useReporting';
import { useRequireSubscription } from '@/src/hooks/useSubscriptionStatus';
import { getCurrentCity } from '@/src/lib/location';
import { showToast } from '@/src/state/toast-store';

// Mirrors Screen 3 (#post), reimagined as a real browsable listing per user
// feedback: posting a need now captures the actual event (date, name,
// producer, optional flier/Facebook link) so other eligible athletes can
// judge schedule/availability before responding - not just a private
// classification calculator. Creation lives in create-need-post.tsx; this
// screen is the "everyone eligible can browse it" list, plus your own
// posted needs with the ability to take one down once it's filled.
export default function Post() {
  const { data: openPosts, isLoading: openLoading } = useOpenNeedPosts();
  const { data: myPosts, isLoading: myLoading } = useMyNeedPosts();
  const { data: sentRequests } = useSentRequests();
  const sendRequest = useSendRequest();
  const deleteNeedPost = useDeleteNeedPost();
  const blockUser = useBlockUser();
  const submitReport = useSubmitUserReport();
  const requireSubscription = useRequireSubscription();

  const [reportTarget, setReportTarget] = useState<NeedPostWithPoster | null>(null);
  const [useLocationOn, setUseLocationOn] = useState(false);
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const requestedNeedPostIds = useMemo(
    () => new Set((sentRequests ?? []).filter((r) => r.need_post_id).map((r) => r.need_post_id)),
    [sentRequests]
  );

  // Not the same thing as an event's actual venue - this toggle (same
  // pattern as Browse's) only ever compares YOUR current city against a
  // post's stored location string. No real geocoding/distance math, same
  // as everywhere else in the app that sorts by location.
  const sortedOpenPosts = useMemo(() => {
    if (!openPosts) return openPosts;
    if (!useLocationOn || !currentCity) return openPosts;
    return [...openPosts].sort((a, b) => Number(b.location === currentCity) - Number(a.location === currentCity));
  }, [openPosts, useLocationOn, currentCity]);

  async function toggleLocation() {
    if (useLocationOn) {
      setUseLocationOn(false);
      setCurrentCity(null);
      return;
    }
    setLocationLoading(true);
    const city = await getCurrentCity();
    setLocationLoading(false);
    if (city) {
      setUseLocationOn(true);
      setCurrentCity(city);
      showToast(`Showing needs near ${city} first`);
    }
  }

  async function handleRequest(post: NeedPostWithPoster) {
    if (!post.poster) return;
    if (!requireSubscription()) return;
    try {
      await sendRequest.mutateAsync({
        recipientId: post.poster.id,
        division: post.division,
        needPostId: post.id,
        isGoatRoping: post.is_goat_roping,
      });
      showToast(
        post.poster.is_minor
          ? `Request routed to ${post.poster.full_name}'s guardian for approval`
          : `Request sent to ${post.poster.full_name}`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send request');
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post a Need" subtitle="Post your event, or find one to fill" />
      <ScrollView contentContainerStyle={styles.content}>
        <Button label="+ Post a need" onPress={() => router.push('/create-need-post')} style={{ marginBottom: 20 }} />

        {myPosts && myPosts.length > 0 ? (
          <>
            <Text style={styles.eyebrow}>Your posted needs</Text>
            {myPosts.map((post) => (
              <NeedPostCard
                key={post.id}
                post={{ ...post, poster: null }}
                onDelete={() => deleteNeedPost.mutate(post.id)}
              />
            ))}
          </>
        ) : null}

        <Text style={styles.eyebrow}>Open needs you can fill</Text>
        <ToggleRow
          title="Use my current location"
          description="Show needs near where you are right now first, not just your home area"
          value={useLocationOn}
          onToggle={toggleLocation}
        />
        {locationLoading ? <Text style={styles.locationNote}>Requesting location access...</Text> : null}
        {openLoading || myLoading ? (
          <ActivityIndicator color={colors.rust} style={{ marginTop: 20 }} />
        ) : !sortedOpenPosts || sortedOpenPosts.length === 0 ? (
          <DividerNote>No open needs match your position and classification right now. Check back soon.</DividerNote>
        ) : (
          sortedOpenPosts.map((post) => (
            <NeedPostCard
              key={post.id}
              post={post}
              alreadyRequested={requestedNeedPostIds.has(post.id)}
              onRequest={() => handleRequest(post)}
              onReport={() => setReportTarget(post)}
              onBlock={() => post.poster && blockUser.mutate(post.poster.id)}
            />
          ))
        )}
      </ScrollView>

      {reportTarget?.poster ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          targetName={reportTarget.poster.full_name}
          contentRef={`Posted need — ${reportTarget.event_name}, by ${reportTarget.poster.full_name}`}
          offenses={USER_REPORT_OFFENSES}
          submitting={submitReport.isPending}
          onSubmit={(offense, description) =>
            submitReport.mutateAsync({
              targetUserId: reportTarget.poster!.id,
              offense,
              description,
              contentRef: `Posted need — ${reportTarget.event_name}, by ${reportTarget.poster!.full_name}`,
            })
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.rust,
    marginBottom: 8,
    marginTop: 4,
  },
  locationNote: { fontFamily: fonts.body, fontSize: 12, color: '#6b5c47', marginBottom: 14 },
});
