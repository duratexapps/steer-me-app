import * as ImagePicker from 'expo-image-picker';
import { showToast } from '@/src/state/toast-store';

export type PickedImage = { uri: string; mimeType: string };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
};

// Camera and photo library permissions are requested separately, only at
// the moment the user picks that specific option - never both at once and
// never before they tap, matching the Privacy Policy section 9 commitment.
export async function takePhoto(): Promise<PickedImage | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    showToast('Camera access is needed to take a photo');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
  return toPickedImage(result);
}

export async function pickFromLibrary(): Promise<PickedImage | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    showToast('Photo library access is needed to choose a photo');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  return toPickedImage(result);
}

function toPickedImage(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}
