import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { showToast } from '@/src/state/toast-store';

type RatingModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (stars: number, review: string) => void | Promise<void>;
  submitting?: boolean;
};

// Mirrors #rating-modal-overlay - the eligibility rules themselves (attended
// before the event date, event passed, within 30 days, one per athlete) are
// enforced server-side by the enforce_rating_eligibility() trigger; this is
// only ever shown once the caller is already known to be eligible.
export function RatingModal({ visible, onClose, onSubmit, submitting }: RatingModalProps) {
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');

  function handleClose() {
    setStars(0);
    setReview('');
    onClose();
  }

  async function handleSubmit() {
    if (stars < 1) {
      showToast('Pick a star rating before submitting');
      return;
    }
    await onSubmit(stars, review.trim());
    handleClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Rate this event</Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.espresso} />
            </Pressable>
          </View>

          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} hitSlop={4}>
                <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color={colors.brass} style={styles.star} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Review (optional)</Text>
          <TextInput
            style={styles.textarea}
            value={review}
            onChangeText={setReview}
            placeholder="What was the event like? Cattle, organization, payout..."
            placeholderTextColor="#9c8a6b"
            multiline
            numberOfLines={4}
          />
          <Text style={styles.note}>
            Only visible to other users if it follows our Community Guidelines. Submitting a knowingly
            false rating is itself a guidelines violation.
          </Text>

          <Button label="Submit rating" onPress={handleSubmit} loading={submitting} style={{ marginTop: 12 }} />
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
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 6 },
  star: { marginHorizontal: 2 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginTop: 14,
    marginBottom: 6,
  },
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
  note: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.saddle,
    marginTop: 8,
    lineHeight: 15,
  },
});
