import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { showToast } from '@/src/state/toast-store';

type ReportModalProps = {
  visible: boolean;
  onClose: () => void;
  targetName: string;
  contentRef: string;
  offenses: string[];
  onSubmit: (offense: string, description: string) => void | Promise<void>;
  submitting?: boolean;
};

// Mirrors #report-modal-overlay - shared by user-conduct reports (Browse
// cards, requests) and, once Phase 4 lands, event-accuracy reports.
export function ReportModal({
  visible,
  onClose,
  targetName,
  contentRef,
  offenses,
  onSubmit,
  submitting,
}: ReportModalProps) {
  const [offense, setOffense] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  function handleClose() {
    setOffense(null);
    setDescription('');
    onClose();
  }

  async function handleSubmit() {
    if (!offense) {
      showToast('Select an offense before submitting');
      return;
    }
    if (!description.trim()) {
      showToast('Add a brief description before submitting');
      return;
    }
    await onSubmit(offense, description.trim());
    handleClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Report {targetName}</Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.espresso} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            <Text style={styles.label}>
              What's the issue? <Text style={styles.required}>*required</Text>
            </Text>
            {offenses.map((item) => (
              <Pressable key={item} style={styles.offenseRow} onPress={() => setOffense(item)}>
                <View style={[styles.radio, offense === item && styles.radioSelected]}>
                  {offense === item ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={styles.offenseText}>{item}</Text>
              </Pressable>
            ))}

            <Text style={styles.label}>
              Brief description <Text style={styles.required}>*required</Text>
            </Text>
            <TextInput
              style={styles.textarea}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell us what happened..."
              placeholderTextColor="#9c8a6b"
              multiline
              numberOfLines={4}
            />

            <Text style={styles.label}>Content being reported</Text>
            <Text style={styles.contentRef}>{contentRef}</Text>
          </ScrollView>

          <Button label="Submit report" onPress={handleSubmit} loading={submitting} style={{ marginTop: 14 }} />
          <Button label="Cancel" variant="ghost" onPress={handleClose} style={{ marginTop: 8 }} />
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
  title: { fontFamily: fonts.displayBold, fontSize: 19, color: colors.espresso, letterSpacing: 0.4 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginTop: 12,
    marginBottom: 6,
  },
  required: { color: colors.brass, textTransform: 'none' },
  offenseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.saddle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.brass },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brass },
  offenseText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, flex: 1 },
  textarea: {
    borderWidth: 1.5,
    borderColor: colors.saddle,
    borderRadius: radii.md,
    backgroundColor: colors.tanLight,
    padding: 12,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  contentRef: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    color: colors.saddle,
    backgroundColor: colors.tanLight,
    borderRadius: radii.sm,
    padding: 10,
  },
});
