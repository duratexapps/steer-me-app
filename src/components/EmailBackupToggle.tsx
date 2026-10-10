import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProfile, useInvalidateMyProfile } from '@/src/hooks/useMyProfile';

// NEW, 2026-10-09 - the "also email me my Draw Pro notices" opt-in
// (profiles.email_draw_pro_notices, migration 0082). One component, two
// homes, so the logic can't drift: Account Settings ('settings') and My
// Entries ('entries'), where an entrant lands right after entering and is
// about to wait for their team number. Draw Pro emails the team number to a
// Steer Me entrant only when they have no push token, the push fails, or
// they opt in here - see DOCS/steer-me-draw-pro-email-backup-toggle-handoff.md.
//
// Native only: web has no push, so web users are emailed automatically and
// the callers do not render this on web.
export function EmailBackupToggle({ variant }: { variant: 'settings' | 'entries' }) {
  const userId = useSessionStore((s) => s.session?.user.id);
  const { data: profile } = useMyProfile();
  const invalidateProfile = useInvalidateMyProfile();
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;

  const enabled = !!profile.email_draw_pro_notices;
  const pushOn = !!profile.expo_push_token;

  // On My Entries only: with push off there is nothing to choose, Draw Pro
  // already emails them. Say so instead of showing a toggle that does nothing.
  if (variant === 'entries' && !pushOn) {
    return (
      <View style={styles.note}>
        <Text style={styles.noteText}>
          Notifications are off, so we'll email you your team number instead. (Turn notifications on in Account Settings
          to get it on your phone.)
        </Text>
      </View>
    );
  }

  async function handleToggle() {
    if (!userId) return;
    setSubmitting(true);
    const { error } = await supabase
      .from('profiles')
      .update({ email_draw_pro_notices: !enabled })
      .eq('id', userId);
    setSubmitting(false);
    if (error) {
      showToast(error.message);
      return;
    }
    invalidateProfile();
  }

  return (
    <>
      <ToggleRow
        title={
          variant === 'entries'
            ? "You'll get your team number as a notification. Want an email too?"
            : 'Also email me my Draw Pro notices'
        }
        description={
          variant === 'entries'
            ? 'Turn this on to also get your team number by email, a backup in case you miss a notification.'
            : 'Get your team number by email too, as a backup to the notification on your phone. Useful if you sometimes miss notifications.'
        }
        value={enabled}
        onToggle={handleToggle}
      />
      {submitting ? <Text style={styles.updating}>Updating…</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  noteText: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, lineHeight: 16 },
  updating: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginBottom: 12 },
});
