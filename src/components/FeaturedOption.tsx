import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/src/components/ui/Button';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { colors, fonts } from '@/src/theme/theme';
import { showToast } from '@/src/state/toast-store';
import { useFeaturedPricing } from '@/src/hooks/useFeatured';
import { formatPrice, goToCheckout, isFeatured, startFeaturedCheckout, type FeaturedTarget } from '@/src/lib/featured';

// Two small pieces for featured listings (see src/lib/featured.ts). Both render nothing unless featuring is switched on
// and this is the website.

// "Feature this listing" switch for a posting form. The form reads `value` and, after saving the listing, starts checkout.
export function FeaturedToggle({ target, value, onToggle }: { target: FeaturedTarget; value: boolean; onToggle: () => void }) {
  const { pricing, offer } = useFeaturedPricing();
  if (!offer || !pricing) return null;
  const cents = target === 'event' ? pricing.clinic_cents : pricing.stop_cents;
  return (
    <ToggleRow
      title={`Feature this listing - ${formatPrice(cents)} for ${pricing.days} days`}
      description="Featured listings appear first and carry a Featured label. Featuring is advertising, not an endorsement by Steer Me. You pay securely with Stripe after the listing is saved."
      value={value}
      onToggle={onToggle}
    />
  );
}

// Button on a saved listing: shows when it is featured until, or lets the owner buy featuring now.
export function FeatureNowButton({ target, id, featuredUntil }: { target: FeaturedTarget; id: string; featuredUntil: string | null }) {
  const { pricing, offer } = useFeaturedPricing();
  const [busy, setBusy] = useState(false);
  const featured = isFeatured(featuredUntil);
  if (!offer || !pricing) {
    return featured ? <Text style={styles.until}>Featured until {new Date(featuredUntil!).toLocaleDateString()}</Text> : null;
  }
  const cents = target === 'event' ? pricing.clinic_cents : pricing.stop_cents;
  return (
    <View style={styles.wrap}>
      {featured ? <Text style={styles.until}>Featured until {new Date(featuredUntil!).toLocaleDateString()}</Text> : null}
      <Button
        label={featured ? `Extend ${pricing.days} days - ${formatPrice(cents)}` : `Feature this listing - ${formatPrice(cents)} for ${pricing.days} days`}
        variant="outline"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            goToCheckout(await startFeaturedCheckout(target, id));
          } catch (err) {
            showToast(err instanceof Error ? err.message : "We couldn't start checkout. Please try again.");
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  until: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.brass, marginBottom: 6 },
});
