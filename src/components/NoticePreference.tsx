import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProfile, useInvalidateMyProfile } from '@/src/hooks/useMyProfile';
import { registerForPushNotifications, unregisterPushNotifications } from '@/src/lib/push-notifications';

// NEW, 2026-10-12 (migration 0090) - ONE setting for how a rider hears about
// their Draw Pro entries, replacing the old pair of switches (push on/off in
// Account Settings, "also email me" on My Entries).
//   both  push and email (default; a profile with no choice counts as both)
//   push  push only; Draw Pro still sends one backup email if a push is known to fail
//   email email only; no push is sent
//   none  neither; My Entries still shows teams, results and standings
// push_opted_out is the device-level switch the app honours: email/none opt the
// device out (token cleared, no automatic re-registering); both/push opt it in.
// email_draw_pro_notices is kept in step for Draw Pro's older rule.
export type NoticePref = 'both' | 'push' | 'email' | 'none';

const OPTIONS: { value: NoticePref; title: string; body: string }[] = [
  { value: 'both', title: 'Notification and email', body: 'Recommended. You get your team number both ways, so you never miss it.' },
  { value: 'push', title: 'Notification only', body: "A phone notification. We'll email you only if a notification can't be delivered." },
  { value: 'email', title: 'Email only', body: 'No phone notifications for your entries.' },
  { value: 'none', title: 'Neither', body: "We won't send you anything. Your teams, times and standing still show in My Entries." },
];

const LABEL: Record<NoticePref, string> = {
  both: 'Notification and email',
  push: 'Notification only',
  email: 'Email only',
  none: 'Neither',
};

export function NoticePreference({ variant }: { variant: 'settings' | 'entries' }) {
  const userId = useSessionStore((s) => s.session?.user.id);
  const { data: profile } = useMyProfile();
  const invalidateProfile = useInvalidateMyProfile();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(variant === 'settings');
  const [blocked, setBlocked] = useState(false);

  if (!profile) return null;
  const current: NoticePref = (profile.draw_pro_notice_pref as NoticePref | null) ?? 'both';

  async function choose(next: NoticePref) {
    if (!userId || saving || next === current) return;
    setSaving(true);
    setBlocked(false);
    try {
      const wantsPush = next === 'both' || next === 'push';
      if (wantsPush) {
        const result = await registerForPushNotifications(userId, { explicit: true });
        if (result === 'denied') {
          setBlocked(true);
          showToast('Notifications are blocked for Steer Me in your phone settings.');
        } else if (result === 'error' && Platform.OS === 'android') {
          showToast("This phone can't receive Steer Me notifications yet. We'll email you your team number instead.");
        } else if (result === 'error') {
          showToast("Couldn't turn on notifications on this phone. Your choice is saved.");
        }
      } else {
        await unregisterPushNotifications(userId);
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          draw_pro_notice_pref: next,
          // Draw Pro's older rule still reads this: email goes out for both/email.
          email_draw_pro_notices: next === 'both' || next === 'email',
        })
        .eq('id', userId);
      if (error) {
        showToast(error.message);
        return;
      }
      invalidateProfile();
      if (variant === 'entries') setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <Pressable onPress={() => variant === 'entries' && setOpen((o) => !o)} disabled={variant === 'settings'}>
        <Text style={styles.title}>How you'll hear about your entries</Text>
        {variant === 'entries' && !open ? (
          <View style={styles.row}>
            <Text style={styles.current}>{LABEL[current]}</Text>
            <Text style={styles.change}>Change</Text>
          </View>
        ) : (
          <Text style={styles.sub}>Your team number, results, standings and cancellations from Draw Pro.</Text>
        )}
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8 }}>
          {OPTIONS.map((o) => {
            const on = o.value === current;
            return (
              <Pressable key={o.value} style={[styles.option, on && styles.optionOn]} onPress={() => choose(o.value)}>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optTitle}>{o.title}</Text>
                  <Text style={styles.optBody}>{o.body}</Text>
                </View>
              </Pressable>
            );
          })}
          {saving ? <Text style={styles.sub}>Saving…</Text> : null}
          {blocked ? (
            <Pressable onPress={() => Linking.openSettings()}>
              <Text style={styles.link}>Open phone settings</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.espresso },
  sub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 2, lineHeight: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  current: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.espresso },
  change: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.brass },
  option: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    marginTop: 4,
  },
  optionOn: { borderColor: colors.brass, backgroundColor: colors.bone },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.saddle,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { borderColor: colors.brass },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brass },
  optTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.espresso },
  optBody: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 1, lineHeight: 16 },
  link: { fontFamily: fonts.body, fontSize: 12, color: colors.brass, textDecorationLine: 'underline', marginTop: 8 },
});
