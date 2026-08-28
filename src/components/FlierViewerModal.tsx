import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/theme';

type FlierViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  uri: string | null;
};

// Full-resolution, tap-to-dismiss flier view - EventCard/NeedPostCard only
// ever show a resized thumbnail (see publicUrlFor's transform option),
// this is where a contestant actually reads the fine print. Same custom
// Modal pattern as HelpModal/ReportModal/RatingModal, not a new UI
// dependency. contentFit="contain" so a tall or wide flier always fits
// the screen without cropping - no pinch-zoom yet, flag if small print
// still isn't legible enough once this is live.
export function FlierViewerModal({ visible, onClose, uri }: FlierViewerModalProps) {
  const { width, height } = useWindowDimensions();

  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Image
          source={{ uri }}
          style={{ width: width * 0.92, height: height * 0.82 }}
          contentFit="contain"
        />
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.bone} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18,12,8,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(30,20,15,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
