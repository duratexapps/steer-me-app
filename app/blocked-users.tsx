import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { Tag } from '@/src/components/ui/Tag';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { useBlockedProfiles, useUnblockUser } from '@/src/hooks/useBlocking';

export default function BlockedUsers() {
  const { data: blocked } = useBlockedProfiles();
  const unblock = useUnblockUser();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="Blocked Users"
        subtitle="They can't contact you, request you, or appear in your matches"
        onBack={() => router.back()}
        onHelp={() => setHelpOpen(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!blocked || blocked.length === 0 ? (
          <DividerNote>You haven't blocked anyone.</DividerNote>
        ) : (
          blocked.map((p) => (
            <View key={p.id} style={styles.card}>
              <Tag value={p.global_classification ?? '—'} />
              <View style={styles.info}>
                <Text style={styles.name}>{p.full_name}</Text>
                <Text style={styles.meta}>{p.home_area}</Text>
              </View>
              <Pressable style={styles.unblockBtn} onPress={() => unblock.mutate(p.id)}>
                <Text style={styles.unblockText}>Unblock</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="blocked-users" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
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
  unblockBtn: { backgroundColor: colors.espresso, borderRadius: radii.sm, paddingVertical: 8, paddingHorizontal: 12 },
  unblockText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.bone },
});
