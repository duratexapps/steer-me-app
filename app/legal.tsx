import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Pill } from '@/src/components/ui/Pill';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@/src/content/legal';

// NEW, added 2026-07-28 - "present but not overly conspicuous": reachable
// from a small text link on role-select/sign-up (see those files) rather
// than a tab or header icon, since this isn't something someone needs to
// reach from every screen the way Report/Refer are - it's a reference
// page, not an action. See src/content/legal/ for the actual document
// content and why it's a separately-maintained clean copy rather than
// the internal DOCS/*.md drafts rendered directly.
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const initial = LEGAL_DOCUMENTS.some((d) => d.id === doc) ? (doc as LegalDocumentId) : 'terms';
  const [activeId, setActiveId] = useState<LegalDocumentId>(initial);

  const active = LEGAL_DOCUMENTS.find((d) => d.id === activeId)!;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Legal" subtitle="Terms, privacy, and community rules" onBack={() => router.back()} />
      <View style={styles.pillRow}>
        {LEGAL_DOCUMENTS.map((d) => (
          <Pill key={d.id} label={d.title} selected={d.id === activeId} onPress={() => setActiveId(d.id)} />
        ))}
      </View>

      <View style={styles.acknowledgment}>
        <Text style={styles.acknowledgmentText}>
          Using Steer Me serves as your acknowledgment of the rules and regulations outlined here.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Markdown style={markdownStyles}>{active.content}</Markdown>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
  },
  acknowledgment: {
    marginHorizontal: 20,
    marginTop: spacing.md,
    padding: 12,
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
  },
  acknowledgmentText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.espresso,
    lineHeight: 17,
  },
  content: { padding: 20, paddingTop: spacing.md, ...webMaxWidth },
});

// Kept close to the app's own type scale (fonts.display*/body*) rather
// than the library's defaults, so this reads as part of the app, not a
// bolted-on document viewer.
const markdownStyles = {
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, lineHeight: 20 },
  heading1: {
    fontFamily: fonts.displayBold,
    fontSize: 22,
    color: colors.espresso,
    marginTop: 4,
    marginBottom: 12,
  },
  heading2: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    color: colors.espresso,
    marginTop: 20,
    marginBottom: 8,
  },
  heading3: {
    fontFamily: fonts.bodyBold,
    fontSize: 14.5,
    color: colors.espresso,
    marginTop: 14,
    marginBottom: 6,
  },
  strong: { fontFamily: fonts.bodyBold },
  em: { fontFamily: fonts.body, fontStyle: 'italic' as const },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginBottom: 4 },
  hr: { backgroundColor: colors.saddle, height: 1, marginVertical: 16 },
};
