import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { TextField } from '@/src/components/ui/TextField';
import { DateField } from '@/src/components/ui/DateField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { Tag } from '@/src/components/ui/Tag';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { DIVISION_OPTIONS, OPEN_CAP, formatPosition } from '@/src/lib/matching';
import { formatDateDisplay } from '@/src/lib/date';
import { useCreateNeedPost, type NeedPostVisibility } from '@/src/hooks/useNeedPosts';
import { useSearchPublishedEvents, useNeedPostCountForEvent, type EventWithProducer } from '@/src/hooks/useEvents';
import { useFavorites } from '@/src/hooks/useFavorites';
import { showToast } from '@/src/state/toast-store';

type Selection = { kind: 'cap'; value: number } | { kind: 'goat' } | null;

const VISIBILITY_OPTIONS: { value: NeedPostVisibility; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'favorites', label: 'My Favorites' },
  { value: 'selected', label: 'Select Favorites' },
];

// The event details this collects (date, event name, producer name,
// location, optional flier + Facebook link) are what makes a posted need a
// real browsable listing instead of a private calculator - other athletes
// use them to judge schedule/availability, and a producer who isn't on
// Steer Me yet still gets surfaced to everyone who sees the post.
//
// Searching for and linking an already-listed event is optional, not
// required - it exists so multiple athletes posting a need for the SAME
// real event end up genuinely consolidated (queryable by shared event_id)
// instead of each typing a disconnected copy of the same event's details.
// Fields stay editable either way, matching the "review before you
// submit" pattern used everywhere else a form gets pre-filled.
export default function CreateNeedPost() {
  const createNeedPost = useCreateNeedPost();
  const { data: favorites } = useFavorites();
  const [selection, setSelection] = useState<Selection>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [eventSearch, setEventSearch] = useState('');
  const [linkedEvent, setLinkedEvent] = useState<EventWithProducer | null>(null);
  const { data: searchResults, isLoading: searching } = useSearchPublishedEvents(eventSearch);
  const { data: otherPostCount } = useNeedPostCountForEvent(linkedEvent?.id ?? null);

  const [eventDate, setEventDate] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [producerName, setProducerName] = useState('');
  const [location, setLocation] = useState('');
  const [facebookLink, setFacebookLink] = useState('');
  const [flierOpen, setFlierOpen] = useState(false);
  const [flierUri, setFlierUri] = useState<string | null>(null);
  const [flierPath, setFlierPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [visibility, setVisibility] = useState<NeedPostVisibility>('everyone');
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<string[]>([]);

  function toggleSelectedFavorite(id: string) {
    setSelectedFavoriteIds((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  function handleLinkEvent(event: EventWithProducer) {
    setLinkedEvent(event);
    setEventSearch('');
    setEventName(event.name);
    setEventDate(event.event_date);
    setProducerName(event.producer_org_name ?? '');
    setLocation(event.location);
  }

  function handleUnlink() {
    setLinkedEvent(null);
  }

  async function handleFlierPicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setFlierUri(image.uri);
    try {
      const path = await uploadUserFile('need-fliers', user.id, image, `flier-${Date.now()}`);
      setFlierPath(path);
    } catch {
      showToast('Could not upload flier - try again');
    }
  }

  const canSubmit =
    selection !== null &&
    !!eventDate &&
    eventName.trim().length > 0 &&
    producerName.trim().length > 0 &&
    location.trim().length > 0 &&
    (visibility !== 'selected' || selectedFavoriteIds.length > 0);

  async function handleSubmit() {
    if (!canSubmit || !selection || !eventDate) return;
    setSubmitting(true);
    try {
      await createNeedPost.mutateAsync({
        is_goat_roping: selection.kind === 'goat',
        division: selection.kind === 'cap' ? selection.value : null,
        event_id: linkedEvent?.id ?? null,
        event_date: eventDate,
        event_name: eventName.trim(),
        producer_name: producerName.trim(),
        location: location.trim(),
        flier_path: flierPath,
        facebook_link: facebookLink.trim() || null,
        visibility,
        selected_favorite_ids: visibility === 'selected' ? selectedFavoriteIds : [],
      });
      showToast(`Posted: need a partner for ${eventName.trim()}`);
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post a Need" subtitle="Give others the details to check their schedule" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Choose your event cap</Text>
        <DividerNote>
          Goat roping is usually a youth event and isn't bound by the classification number system - pick
          it instead of a cap if that's what you're posting for.
        </DividerNote>
        <View style={styles.pillRow}>
          <Pill label="Goat Roping" selected={selection?.kind === 'goat'} onPress={() => setSelection({ kind: 'goat' })} />
        </View>
        <Text style={styles.eyebrow}>Or a classification cap</Text>
        <View style={styles.pillWrap}>
          {DIVISION_OPTIONS.map((c) => (
            <Pill
              key={c}
              label={c === OPEN_CAP ? 'Open' : `#${c}`}
              selected={selection?.kind === 'cap' && selection.value === c}
              onPress={() => setSelection({ kind: 'cap', value: c })}
            />
          ))}
        </View>

        {linkedEvent ? (
          <View style={styles.linkedCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkedName}>✓ Linked to {linkedEvent.name}</Text>
              <Text style={styles.linkedMeta}>
                {linkedEvent.producer_org_name} · {formatDateDisplay(linkedEvent.event_date)}
              </Text>
              {otherPostCount ? (
                <Text style={styles.linkedCount}>
                  {otherPostCount} other athlete{otherPostCount === 1 ? ' has' : 's have'} also posted for this event
                </Text>
              ) : null}
            </View>
            <Pressable onPress={handleUnlink}>
              <Text style={styles.unlinkLink}>Unlink</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextField
              label="Is your event already listed here? (optional)"
              value={eventSearch}
              onChangeText={setEventSearch}
              placeholder="Search events already listed on Steer Me..."
            />
            {searching ? <Text style={styles.helperNote}>Searching...</Text> : null}
            {searchResults && searchResults.length > 0 ? (
              <View style={styles.resultsWrap}>
                {searchResults.map((event) => (
                  <Pressable key={event.id} style={styles.resultRow} onPress={() => handleLinkEvent(event)}>
                    <Text style={styles.resultName}>{event.name}</Text>
                    <Text style={styles.resultMeta}>
                      {event.producer_org_name} · {formatDateDisplay(event.event_date)} · {event.location}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.helperNote}>
              Not listed, or saw it elsewhere? No problem - just fill in the details below yourself.
            </Text>
          </>
        )}

        <DateField label="Event date" value={eventDate} onChange={setEventDate} minimumDate={new Date()} />
        <TextField label="Event name" value={eventName} onChangeText={setEventName} placeholder="e.g. Fall Qualifier" />
        <TextField label="Producer name" value={producerName} onChangeText={setProducerName} placeholder="e.g. Mathews Land & Cattle" />
        <TextField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Wickenburg, AZ" />
        <TextField
          label="Facebook event link (optional)"
          value={facebookLink}
          onChangeText={setFacebookLink}
          placeholder="e.g. https://facebook.com/events/..."
          autoCapitalize="none"
          keyboardType="url"
        />

        <Text style={styles.label}>Event flier (optional)</Text>
        <Pressable style={styles.dropzone} onPress={() => setFlierOpen(true)}>
          {flierUri ? (
            <>
              <Image source={{ uri: flierUri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Flier attached</Text>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={26} color={colors.espresso} />
              <Text style={styles.dropzoneText}>Upload the event flier</Text>
              <Text style={styles.dropzoneSub}>Shown to everyone who sees your post</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.eyebrow}>Who can see this post?</Text>
        <View style={styles.pillRow}>
          {VISIBILITY_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              label={opt.label}
              selected={visibility === opt.value}
              onPress={() => setVisibility(opt.value)}
            />
          ))}
        </View>

        {visibility === 'favorites' ? (
          <DividerNote>
            {favorites && favorites.length > 0
              ? `Only visible to the ${favorites.length} roper${favorites.length === 1 ? '' : 's'} on your favorites list.`
              : "You haven't favorited anyone yet, so this post won't be visible to anyone until you do. Favorite someone from Browse or after connecting through a request."}
          </DividerNote>
        ) : null}

        {visibility === 'selected' ? (
          !favorites || favorites.length === 0 ? (
            <DividerNote>
              You haven't favorited anyone yet. Favorite someone from Browse or after connecting through a
              request, then come back here to pick who sees this post.
            </DividerNote>
          ) : (
            <View style={styles.favoritesWrap}>
              {favorites.map((f) => {
                const picked = selectedFavoriteIds.includes(f.id);
                return (
                  <Pressable
                    key={f.id}
                    style={[styles.favoriteRow, picked && styles.favoriteRowPicked]}
                    onPress={() => toggleSelectedFavorite(f.id)}
                  >
                    <Tag value={f.global_classification} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.favoriteName}>{f.full_name}</Text>
                      <Text style={styles.favoriteMeta}>
                        {formatPosition(f.position)} · {f.home_area}
                      </Text>
                    </View>
                    <Ionicons
                      name={picked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={picked ? colors.brass : colors.saddle}
                    />
                  </Pressable>
                );
              })}
            </View>
          )
        ) : null}

        <Button label="Post & show me matches" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} style={{ marginTop: 8 }} />
      </ScrollView>
      <PhotoChooserSheet visible={flierOpen} onClose={() => setFlierOpen(false)} onPicked={handleFlierPicked} />
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="create-need-post" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.brass,
    marginBottom: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
  helperNote: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginBottom: 14, lineHeight: 16 },
  resultsWrap: { marginBottom: 8 },
  resultRow: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 6,
  },
  resultName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.espresso },
  resultMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 2 },
  linkedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 16,
  },
  linkedName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.espresso },
  linkedMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 2 },
  linkedCount: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.brass, marginTop: 4 },
  unlinkLink: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.brass, textDecorationLine: 'underline' },
  dropzone: {
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    backgroundColor: colors.tanLight,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  dropzoneImage: { width: '100%', height: 140, borderRadius: radii.md, marginBottom: 8 },
  dropzoneText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso, marginTop: 6 },
  dropzoneSub: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 2 },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
  favoritesWrap: { marginBottom: 16 },
  favoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 8,
  },
  favoriteRowPicked: { borderColor: colors.brass, borderWidth: 1.5 },
  favoriteName: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.espresso },
  favoriteMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 1 },
});
