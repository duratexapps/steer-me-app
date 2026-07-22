import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { HELP_CONTENT, HELP_TOPIC_ORDER } from '@/src/lib/help-content';

type HelpModalProps = {
  visible: boolean;
  onClose: () => void;
  topic: string;
};

// Mirrors #help-modal-overlay - the contextual "?" help button shown on
// every screen's header opens this with that screen's topic pre-selected.
// "Browse all topics" switches to a flat tappable list of every topic in
// the app; tapping one shows its content in the same modal.
export function HelpModal({ visible, onClose, topic }: HelpModalProps) {
  const [activeTopic, setActiveTopic] = useState(topic);
  const [showingList, setShowingList] = useState(false);

  // Reset to the screen's own topic each time the modal is freshly opened,
  // rather than keeping whatever was last browsed.
  useEffect(() => {
    if (visible) {
      setActiveTopic(topic);
      setShowingList(false);
    }
  }, [visible, topic]);

  const content = HELP_CONTENT[activeTopic];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{showingList ? 'All help topics' : content?.title ?? 'Help'}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.espresso} />
            </Pressable>
          </View>

          {showingList ? (
            <ScrollView style={{ maxHeight: 420 }}>
              {HELP_TOPIC_ORDER.map((id) => (
                <Pressable
                  key={id}
                  style={styles.topicRow}
                  onPress={() => {
                    setActiveTopic(id);
                    setShowingList(false);
                  }}
                >
                  <Text style={styles.topicText}>{HELP_CONTENT[id]?.title ?? id}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.body}>{content?.body}</Text>
          )}

          <Button
            label="Browse all topics"
            variant="outline"
            onPress={() => setShowingList(true)}
            style={{ marginTop: 14 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(42,35,28,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: { backgroundColor: colors.bone, borderRadius: radii.xl, padding: 18, width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontFamily: fonts.displayBold, fontSize: 19, color: colors.espresso, letterSpacing: 0.4, flex: 1 },
  body: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.ink, marginBottom: 4 },
  topicRow: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: 'rgba(169,129,46,0.4)',
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  topicText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.espresso },
});
