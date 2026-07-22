import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { Tag } from '@/src/components/ui/Tag';
import { HelpModal } from '@/src/components/HelpModal';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useFavorites, useToggleFavorite } from '@/src/hooks/useFavorites';
import { formatPosition } from '@/src/lib/matching';

// Accessible from Profile rather than a Home-page tab, per the earlier
// decision to keep Favorites scoped to "add via a star on partner cards,
// use to target who sees a Post a Need listing" - this screen just gives
// people a place to see and edit that list, mirroring the blocked-users
// management pattern.
export default function MyFavorites() {
  const { data: favorites } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="Favorites"
        subtitle="Ropers you've saved for quick access"
        onBack={() => router.back()}
        onHelp={() => setHelpOpen(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!favorites || favorites.length === 0 ? (
          <DividerNote>
            No favorites yet. Star someone from Browse or an accepted request to save them here.
          </DividerNote>
        ) : (
          favorites.map((p) => (
            <View key={p.id} style={styles.card}>
              <Tag value={p.global_classification ?? '—'} />
              <View style={styles.info}>
                <Text style={styles.name}>{p.full_name}</Text>
                <Text style={styles.meta}>
                  {formatPosition(p.position)} · {p.home_area}
                </Text>
              </View>
              <Pressable
                style={styles.removeBtn}
                onPress={() => toggleFavorite.mutate({ favoriteId: p.id, isFavorite: true })}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="my-favorites" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20 },
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderLeftWidth: 4,
    borderLeftColor: colors.brass,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
  },
  info: { flex: 1 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.espresso, marginTop: 2 },
  removeBtn: { backgroundColor: colors.espresso, borderRadius: radii.sm, paddingVertical: 8, paddingHorizontal: 12 },
  removeText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.bone },
});
