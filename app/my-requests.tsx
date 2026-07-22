import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { Pill } from '@/src/components/ui/Pill';
import { Tag } from '@/src/components/ui/Tag';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { colors, fonts, radii } from '@/src/theme/theme';
import {
  useSentRequests,
  useReceivedRequests,
  useRespondToRequest,
  fetchRequestContact,
  type PartnerRequestWithProfile,
} from '@/src/hooks/usePartnerRequests';
import { useFavorites, useToggleFavorite } from '@/src/hooks/useFavorites';
import { useResponsiveColumns, gridItemWidthPercent } from '@/src/hooks/useResponsiveColumns';
import { signedUrlFor } from '@/src/lib/storage-upload';
import { formatDivision } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';

const STATUS_LABEL: Record<PartnerRequestWithProfile['status'], string> = {
  pending: 'Pending',
  pending_guardian: 'Pending guardian approval',
  accepted: 'Accepted',
  declined: 'Declined',
};

function digitsOnly(phone: string) {
  return phone.replace(/[^0-9+]/g, '');
}

function RequestCard({
  request,
  mode,
  isFavorite,
  onToggleFavorite,
}: {
  request: PartnerRequestWithProfile;
  mode: 'sent' | 'received';
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const respond = useRespondToRequest();
  const { data: contact } = useQuery({
    queryKey: ['request-contact', request.id],
    enabled: request.status === 'accepted',
    queryFn: () => fetchRequestContact(request.id),
  });

  const [cardOpen, setCardOpen] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  async function handleToggleCard() {
    if (cardOpen) {
      setCardOpen(false);
      return;
    }
    if (!cardUrl) {
      setCardLoading(true);
      // Signed URLs expire quickly (see signedUrlFor) - fetch a fresh one
      // each time this is opened rather than caching it indefinitely.
      const url = await signedUrlFor('verification-screenshots', contact?.verification_screenshot_path);
      setCardLoading(false);
      if (!url) {
        showToast('Could not load verification card');
        return;
      }
      setCardUrl(url);
    }
    setCardOpen(true);
  }

  const name = request.counterpart?.full_name ?? 'Unknown';
  const canRespond = mode === 'received' && (request.status === 'pending' || request.status === 'pending_guardian');

  return (
    <View style={styles.card}>
      <Tag value={request.counterpart?.global_classification ?? '—'} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          {request.status === 'accepted' && request.counterpart ? (
            <Pressable onPress={onToggleFavorite} hitSlop={8}>
              <Ionicons
                name={isFavorite ? 'star' : 'star-outline'}
                size={18}
                color={isFavorite ? colors.brass : colors.saddle}
              />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.meta}>
          {request.is_goat_roping ? 'Goat Roping' : `${formatDivision(request.division)} roping`} · {request.counterpart?.home_area}
        </Text>
        <Text style={styles.status}>{STATUS_LABEL[request.status]}</Text>

        {canRespond ? (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => respond.mutate({ requestId: request.id, status: 'accepted' })}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => respond.mutate({ requestId: request.id, status: 'declined' })}
            >
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
          </View>
        ) : null}

        {request.status === 'accepted' && contact?.contact ? (
          <View style={styles.contactRow}>
            {contact.is_guardian ? (
              <Text style={styles.contactLabel}>Guardian contact ({contact.guardian_name ?? 'guardian'})</Text>
            ) : null}
            <View style={styles.contactLinks}>
              <Pressable onPress={() => Linking.openURL(`tel:${digitsOnly(contact.contact!)}`)}>
                <Text style={styles.callLink}>Call</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(`sms:${digitsOnly(contact.contact!)}`)}>
                <Text style={styles.textLink}>Text</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {request.status === 'accepted' && contact?.verification_screenshot_path ? (
          <View style={styles.contactRow}>
            <Pressable onPress={handleToggleCard}>
              <Text style={styles.callLink}>
                {cardLoading ? 'Loading card...' : cardOpen ? 'Hide verification card' : 'View verification card'}
              </Text>
            </Pressable>
            {cardOpen && cardUrl ? <Image source={{ uri: cardUrl }} style={styles.cardImage} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function MyRequests() {
  const [tab, setTab] = useState<'sent' | 'received'>('sent');
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: sent, isLoading: sentLoading } = useSentRequests();
  const { data: received, isLoading: receivedLoading } = useReceivedRequests();
  const { data: favorites } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const favoriteIds = new Set((favorites ?? []).map((f) => f.id));
  const numColumns = useResponsiveColumns();
  const itemWidth = gridItemWidthPercent(numColumns);

  const list = tab === 'sent' ? sent : received;
  const isLoading = tab === 'sent' ? sentLoading : receivedLoading;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="My Requests" subtitle="Track your outgoing and incoming requests" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
      <View style={styles.tabRow}>
        <Pill label="Sent" selected={tab === 'sent'} onPress={() => setTab('sent')} />
        <Pill label="Received" selected={tab === 'received'} onPress={() => setTab('received')} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <ActivityIndicator color={colors.brass} style={{ marginTop: 20 }} />
        ) : !list || list.length === 0 ? (
          <DividerNote>
            {tab === 'sent'
              ? 'No requests sent yet. Head to Browse to find a partner.'
              : 'No requests received yet.'}
          </DividerNote>
        ) : (
          <View style={styles.grid}>
            {list.map((r) => (
              <View key={r.id} style={{ width: itemWidth }}>
                <RequestCard
                  request={r}
                  mode={tab}
                  isFavorite={!!r.counterpart && favoriteIds.has(r.counterpart.id)}
                  onToggleFavorite={() =>
                    r.counterpart &&
                    toggleFavorite.mutate({ favoriteId: r.counterpart.id, isFavorite: favoriteIds.has(r.counterpart.id) })
                  }
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="my-requests" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  content: { padding: 20, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.espresso, marginTop: 2 },
  status: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    color: colors.bone,
    backgroundColor: colors.brass,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    overflow: 'hidden',
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { borderRadius: radii.sm, paddingVertical: 7, paddingHorizontal: 14, cursor: 'pointer' },
  acceptBtn: { backgroundColor: colors.green },
  acceptText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.bone },
  declineBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.brass },
  declineText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.brass },
  contactRow: { marginTop: 8 },
  contactLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.brass },
  contactLinks: { flexDirection: 'row', gap: 14, marginTop: 4 },
  callLink: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso },
  textLink: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.brass },
  cardImage: { width: '100%', height: 200, borderRadius: radii.md, marginTop: 8 },
});
