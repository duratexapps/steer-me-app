import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { takePhoto, pickFromLibrary, PickedImage } from '@/src/lib/image-picker';

type PhotoChooserSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPicked: (image: PickedImage) => void;
};

// Mirrors the prototype's #photo-chooser-overlay - "Take a photo" / "Choose
// from library" modal, reused for avatar, Global Handicap screenshot, and
// (Phase 4) producer verification document uploads.
export function PhotoChooserSheet({ visible, onClose, onPicked }: PhotoChooserSheetProps) {
  async function handleCamera() {
    onClose();
    const image = await takePhoto();
    if (image) onPicked(image);
  }

  async function handleLibrary() {
    onClose();
    const image = await pickFromLibrary();
    if (image) onPicked(image);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Add a photo</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.espresso} />
            </Pressable>
          </View>
          <Button label="Take a photo" variant="outline" onPress={handleCamera} style={styles.firstButton} />
          <Button label="Choose from library" variant="outline" onPress={handleLibrary} style={styles.button} />
          <Text style={styles.note}>
            Camera and photo library access are requested separately, only the first time you use each.
          </Text>
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
  card: {
    backgroundColor: colors.bone,
    borderRadius: radii.xl,
    padding: 18,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontFamily: fonts.displayBold, fontSize: 19, color: colors.espresso, letterSpacing: 0.4 },
  firstButton: { marginTop: 0 },
  button: { marginTop: 10 },
  note: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.saddle,
    textAlign: 'center',
    marginTop: 10,
  },
});
