import * as Location from 'expo-location';
import { showToast } from '@/src/state/toast-store';

// Real device location + reverse geocode, replacing the prototype's fake
// setTimeout(() => currentCity = "Tucson, AZ"). Off by default, and only
// accessed at the moment the user turns the Browse toggle on - never in the
// background - per Privacy Policy section 6.
export async function getCurrentCity(): Promise<string | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    showToast('Location access is needed to find partners near you');
    return null;
  }

  const position = await Location.getCurrentPositionAsync({});
  const [address] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  if (!address) return null;
  if (address.city && address.region) return `${address.city}, ${address.region}`;
  return address.city ?? address.region ?? null;
}
