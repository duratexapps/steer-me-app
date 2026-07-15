import { Redirect } from 'expo-router';
import { useSessionStore } from '@/src/state/session-store';

// Root layout already gates rendering until fonts + the initial session
// check are ready, so by the time this runs, session state is settled.
export default function Index() {
  const session = useSessionStore((s) => s.session);
  return <Redirect href={session ? '/(tabs)' : '/(auth)/role-select'} />;
}
