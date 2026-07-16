import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionTile } from '@/src/components/ui/ActionTile';
import { Tag } from '@/src/components/ui/Tag';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useEligiblePartners } from '@/src/hooks/useEligiblePartners';
import { useSentRequests } from '@/src/hooks/usePartnerRequests';
import { publicUrlFor } from '@/src/lib/storage-upload';
import { formatPosition } from '@/src/lib/matching';

export default function Home() {
  const hasAthleteProfile = useSessionStore((s) => s.hasAthleteProfile);
  const hasProducerProfile = useSessionStore((s) => s.hasProducerProfile);
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { data: eligible } = useEligiblePartners(10.5, null);
  const { data: sent } = useSentRequests();

  const avatarUrl = publicUrlFor('avatars', profile?.avatar_url);
  const pendingCount = (sent ?? []).filter((r) => r.status === 'pending' || r.status === 'pending_guardian').length;
  const bookedCount = (sent ?? []).filter((r) => r.status === 'accepted').length;

  // hasAthleteProfile flips true at session bootstrap, slightly before
  // useMyProfile's own fetch resolves - without this guard, that gap
  // briefly renders the "no profile yet" hero for an athlete who very much
  // has one.
  if (hasAthleteProfile && profileLoading) {
    return <SafeAreaView style={styles.screen} edges={['bottom']} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {hasAthleteProfile && profile ? (
          <View style={styles.hero}>
            <Text style={styles.greet}>Welcome back</Text>
            <View style={styles.nameLine}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarThumb} />
              ) : (
                <Tag value={profile.global_classification ?? '—'} />
              )}
              <View>
                <Text style={styles.who}>{profile.full_name}</Text>
                <Text style={styles.role}>
                  {formatPosition(profile.position)} · {profile.home_area}
                </Text>
                {profile.is_minor ? <Text style={styles.minorBadge}>Guardian-managed profile</Text> : null}
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{eligible?.length ?? '—'}</Text>
                <Text style={styles.statLbl}>Eligible now</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{pendingCount}</Text>
                <Text style={styles.statLbl}>Pending</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{bookedCount}</Text>
                <Text style={styles.statLbl}>Booked</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.greet}>Welcome</Text>
            <Text style={styles.who}>{hasProducerProfile ? 'Producer account' : 'Your account'}</Text>
            <Text style={styles.role}>
              {hasProducerProfile
                ? "You haven't set up an athlete profile yet - you're using Steer Me as a producer only."
                : 'Set up a profile to get started.'}
            </Text>
          </View>
        )}

        <View style={styles.tiles}>
          {hasAthleteProfile ? (
            <>
              <ActionTile
                icon="flag-outline"
                title="Post that you need a partner"
                description="Share your event details and see who else is eligible"
                onPress={() => router.push('/(tabs)/post')}
              />
              <ActionTile
                icon="search-outline"
                title="Browse ropers seeking partners"
                description="Only see people you're actually eligible with"
                onPress={() => router.push('/(tabs)/browse')}
              />
              <ActionTile
                icon="mail-outline"
                title="My requests"
                description="Track who you've reached out to"
                onPress={() => router.push('/my-requests')}
              />
            </>
          ) : (
            <ActionTile
              icon="trophy-outline"
              title="Set up an athlete profile"
              description="Verify your Global classification to find and post partner needs"
              onPress={() => router.push('/(auth)/sign-up')}
            />
          )}

          <ActionTile
            icon="calendar-outline"
            title="Browse events"
            description="Find ropings from real producers and mark your plans to attend"
            onPress={() => router.push('/events')}
          />
          <ActionTile
            icon="pricetag-outline"
            title={hasProducerProfile ? 'Producer dashboard' : 'Producer tools'}
            description={
              hasProducerProfile ? 'Manage your events' : 'Set up a producer profile to list your own events'
            }
            onPress={() => router.push('/producer')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { paddingBottom: 24 },
  hero: {
    backgroundColor: colors.espresso,
    padding: 20,
    paddingTop: 26,
  },
  greet: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.saddle },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  avatarThumb: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.saddle },
  who: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.bone, letterSpacing: 0.5 },
  role: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginTop: 2 },
  minorBadge: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.brass,
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 0.4,
  },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  stat: {
    flex: 1,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statNum: { fontFamily: fonts.mono, fontSize: 20, color: colors.brass },
  statLbl: {
    fontFamily: fonts.body,
    fontSize: 10,
    textTransform: 'uppercase',
    color: colors.espresso,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  tiles: { padding: 20 },
});
