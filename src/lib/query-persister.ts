import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Native only - see query-client.ts's sibling comment / supabase.ts's own
// AsyncStorage-on-web fix (2026-07-30) for why: this app's web build is a
// static, prerendered export where `window` doesn't exist yet at the point
// AsyncStorage's web shim would try to touch it. The connectivity problem
// this exists to solve (bad cell service at a rodeo arena) is a native-app
// scenario anyway, so scoping to native isn't a real loss - see
// app/_layout.tsx for the Platform.OS branch that keeps this off web.
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'steer-me-query-cache',
  throttleTime: 1_000,
});

// REAL BUG, found live 2026-09-05: a query whose `data` is a Map/Set
// (useAttendanceCounts, useMyAttendance, useRatingSummaries - see
// useEvents.ts) doesn't survive this persister's plain JSON serialization.
// JSON.stringify(new Map(...)) silently produces "{}" (a Map's own
// enumerable properties are empty), and restoring that on the next cold
// start hands components a plain object instead of a real Map/Set. Every
// consumer (EventCard.tsx, app/events.tsx) calls .get()/.has() on it
// unconditionally - on a plain object that throws immediately, and an
// uncaught render exception is fatal on an Android release build with no
// error boundary: this is exactly what force-closed the app the instant
// someone opened Browse Events, on the very first build that ever shipped
// with a persister at all (confirmed by reading useAttendanceCounts/
// useMyAttendance/useRatingSummaries's actual return types, not guessed).
//
// Checking the actual runtime type of query.state.data here (rather than
// hardcoding a list of the three query keys above) also protects any
// future query that returns a Map/Set the same way - a hardcoded key
// blocklist would silently miss a new one and reintroduce this exact
// crash. These three queries simply don't get persisted at all now - they
// refetch fresh on cold start, identical to their behavior before this
// persister existed. Nothing else about the persistence feature changes.
//
// Takes a minimal structural type rather than importing `Query` from
// `@tanstack/react-query` - react-query-persist-client depends on its own
// newer nested copy of @tanstack/query-core (5.102.8 vs the app's
// 5.101.2), and TypeScript treats that Query class as a distinct nominal
// type from the one @tanstack/react-query exports (private class fields
// make the two incompatible even though they're structurally identical).
// Reimplementing defaultShouldDehydrateQuery's one-line check directly
// (query.state.status === 'success' - confirmed from its actual source)
// sidesteps the mismatch entirely instead of fighting the type checker
// over two copies of the same library.
export function shouldPersistQuery(query: { state: { status: string; data: unknown } }): boolean {
  if (query.state.status !== 'success') return false;
  const data = query.state.data;
  return !(data instanceof Map || data instanceof Set);
}
