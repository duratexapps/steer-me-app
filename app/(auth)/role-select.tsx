import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { ActionTile } from '@/src/components/ui/ActionTile';
import { BackToRopingToolsLink } from '@/src/components/ui/BackToRopingToolsLink';
import { colors, fonts } from '@/src/theme/theme';

// Mirrors Screen 0 (#role-select). The prototype has no sign-in concept at
// all - it's a pure client demo that starts cold every time. A real app
// needs somewhere for a returning user to log back in, so this screen adds
// a "Sign in" link the prototype doesn't have.
export default function RoleSelect() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <BackToRopingToolsLink />
      <ScreenHeader
        title="Steer Me"
        subtitle="Find your own partner. Skip the ~$40 draw-in fee."
        big
        logo
        onHelp={() => setHelpOpen(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* First choice offered on the whole screen, alongside "Sign in"
            below - a new visitor should be able to see what Steer Me
            actually does before committing to an account. */}
        <Pressable style={styles.tourBtn} onPress={() => router.push('/(auth)/tour')}>
          <Text style={styles.tourBtnText}>Take a Tour</Text>
        </Pressable>

        <Text style={styles.eyebrow}>Get started</Text>
        <Text style={styles.h2}>How will you use Steer Me?</Text>
        <Text style={styles.helper}>
          You can add the other role later from your Profile or Producer dashboard - this just decides
          where to start.
        </Text>

        <ActionTile
          icon="trophy-outline"
          title="I'm an athlete"
          description="Verify your Global classification and find partners"
          onPress={() => router.push({ pathname: '/(auth)/create-account', params: { role: 'athlete' } })}
        />
        <ActionTile
          icon="pricetag-outline"
          title="I'm a producer"
          description="List and manage your own ropings - no athlete profile required"
          onPress={() => router.push({ pathname: '/(auth)/create-account', params: { role: 'producer' } })}
        />
        <ActionTile
          icon="people-outline"
          title="Both"
          description="Start with your athlete profile, then add producer tools from Home"
          onPress={() => router.push({ pathname: '/(auth)/create-account', params: { role: 'both' } })}
        />

        <Pressable style={styles.signInLink} onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={styles.signInText}>Already have an account? Sign in</Text>
        </Pressable>
      </ScrollView>
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="role-select" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.brass,
    marginBottom: 6,
  },
  h2: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.espresso, marginBottom: 4 },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginBottom: 16, lineHeight: 17 },
  signInLink: { marginTop: 8, alignItems: 'center', padding: 10 },
  signInText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.espresso,
    textDecorationLine: 'underline',
  },
  tourBtn: {
    borderWidth: 1.5,
    borderColor: colors.espresso,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  tourBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.espresso },
});
