import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { AutocompleteField } from '@/src/components/ui/AutocompleteField';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { FeaturedToggle } from '@/src/components/FeaturedOption';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { showToast } from '@/src/state/toast-store';
import { goBackOrHome } from '@/src/lib/navigation';
import { goToCheckout, startFeaturedCheckout } from '@/src/lib/featured';
import { useMyProducerProfile } from '@/src/hooks/useProducerProfile';
import { useSubmitLayoverListing, type LayoverKind } from '@/src/hooks/useLayoverListings';

const KINDS: { value: LayoverKind; label: string }[] = [
  { value: 'boarding_barn', label: 'Horse motel / barn' },
  { value: 'fairgrounds', label: 'Fairgrounds' },
  { value: 'equestrian_center', label: 'Equestrian center' },
  { value: 'arena', label: 'Arena' },
  { value: 'campground', label: 'RV park with horses' },
  { value: 'hotel', label: 'Hotel' },
];

// A layover spot or hotel owner adds a listing for the Layover Finder (migration 0109). It stays private until our team
// approves it, and can carry a paid Featured placement bought on the website.
export default function CreateLayover() {
  const { data: profile } = useMyProducerProfile();
  const submit = useSubmitLayoverListing();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LayoverKind | null>(null);
  const [place, setPlace] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [stalls, setStalls] = useState(false);
  const [pens, setPens] = useState(false);
  const [housingDetail, setHousingDetail] = useState('');
  const [rv, setRv] = useState(false);
  const [rvDetail, setRvDetail] = useState('');
  const [notes, setNotes] = useState('');
  const [wantFeatured, setWantFeatured] = useState(false);
  const [saving, setSaving] = useState(false);

  const isHotel = kind === 'hotel';

  async function handleSubmit() {
    const [city, state] = place.split(',').map((p) => p.trim());
    if (!name.trim() || !kind || !city || !state) {
      showToast('Fill in the name, what kind of place it is, and the town');
      return;
    }
    if (!phone.trim() && !website.trim()) {
      showToast('Add a phone number or website so ropers can reach you');
      return;
    }
    setSaving(true);
    try {
      const id = await submit.mutateAsync({
        name: name.trim(),
        kind,
        city,
        state,
        address: address.trim(),
        phone: phone.trim(),
        website: website.trim(),
        has_stalls: stalls,
        has_pens: pens,
        housing_detail: housingDetail.trim(),
        rv_hookups: rv,
        rv_detail: rvDetail.trim(),
        notes: notes.trim(),
      });
      if (wantFeatured) {
        try {
          showToast(`"${name.trim()}" saved - taking you to checkout`);
          goToCheckout(await startFeaturedCheckout('layover_spot', id));
          return;
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Saved, but we couldn't start checkout. Open it from your dashboard to feature it.");
          router.back();
          return;
        }
      }
      showToast(`"${name.trim()}" submitted - we will review it before it goes live`);
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save the listing');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="List a Layover Spot or Hotel" subtitle="Shown in the Layover Finder once our team approves it" onBack={() => goBackOrHome()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {profile && profile.verification_status !== 'verified' ? (
          <DividerNote>Your profile is pending verification. You can add listings now; none go public until you are verified and the listing is approved.</DividerNote>
        ) : null}

        <TextField label="Business name" value={name} onChangeText={setName} placeholder="e.g. Sagebrush Horse Hotel" required />

        <Text style={styles.label}>What kind of place is it?</Text>
        <View style={styles.pillWrap}>
          {KINDS.map((k) => (
            <Pill key={k.value} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />
          ))}
        </View>

        <AutocompleteField label="Town" value={place} onChange={setPlace} placeholder="e.g. Pocatello, ID" required />
        <TextField label="Street address" value={address} onChangeText={setAddress} placeholder="e.g. 1200 W Main St" />
        <TextField label="Phone" value={phone} onChangeText={setPhone} placeholder="e.g. (555) 123-4567" keyboardType="phone-pad" />
        <TextField label="Website or booking link" value={website} onChangeText={setWebsite} placeholder="e.g. https://yourplace.com" autoCapitalize="none" keyboardType="url" />

        {!isHotel ? (
          <>
            <ToggleRow title="Stalls" description="Covered or box stalls for overnight horses" value={stalls} onToggle={() => setStalls((v) => !v)} />
            <ToggleRow title="Pens / corrals" description="Outdoor pens or paddocks for overnight horses" value={pens} onToggle={() => setPens((v) => !v)} />
            <TextField label="Horse details (optional)" value={housingDetail} onChangeText={setHousingDetail} placeholder="e.g. 20 box stalls, shavings and hay on request, $30/night" />
          </>
        ) : null}
        <ToggleRow title="RV hookups" description="Power, water or sewer for a living-quarters trailer or RV" value={rv} onToggle={() => setRv((v) => !v)} />
        {rv ? <TextField label="Hookup details (optional)" value={rvDetail} onChangeText={setRvDetail} placeholder="e.g. 50-amp, water, full hookups $45/night" /> : null}
        <TextField label="Anything else ropers should know (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. arrival hours, Coggins required, trailer parking" multiline />

        <FeaturedToggle target="layover_spot" value={wantFeatured} onToggle={() => setWantFeatured((v) => !v)} />

        <Button label="Submit listing" onPress={handleSubmit} loading={saving} style={{ marginTop: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
});
