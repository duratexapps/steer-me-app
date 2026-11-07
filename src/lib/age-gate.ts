import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';

// Age screen for new accounts (Justin, 2026-11-06): Steer Me is for ropers 13 and older, and nothing may be collected
// from someone younger. The screen asks for a birth month and year BEFORE the email and password, on purpose: asking
// after the account exists means a child's email was already collected. It never says what the cutoff is until it
// blocks, so the number is not an invitation to type a different one.
//
// What is stored: on the device only, a lock after an under-13 answer (so going back and typing another year gets the
// same stop) and a "passed" mark (so a half-finished older sign-up is asked once). The birth month and year themselves
// are NEVER stored or sent anywhere. The website also counts blocks anonymously (no user id, no email), the same way
// the travel tools do; the native apps send nothing, because the store privacy labels say they collect no usage data.

export const MIN_AGE = 13;

const LOCK_KEY = 'steerme_age_gate_lock';
const PASSED_KEY = 'steerme_age_gate_passed';

export type AgeCheck =
  | { ok: true }
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'under'; message: string };

// Age on the given date from a birth month (1-12) and year only. With no day we cannot know which side of the
// birthday today falls on during the birth month, so that month counts as "not yet": the person is treated as the
// younger age. A real 13-year-old in their birthday month is asked to come back next month; a child is never let in.
export function ageFromMonthYear(month: number, year: number, now: Date = new Date()): number {
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 <= month) age -= 1;
  return age;
}

export function checkBirthMonthYear(monthText: string, yearText: string, now: Date = new Date()): AgeCheck {
  const month = Number(monthText.trim());
  const year = Number(yearText.trim());
  const thisYear = now.getFullYear();
  const monthOk = Number.isInteger(month) && month >= 1 && month <= 12;
  const yearOk = /^\d{4}$/.test(yearText.trim()) && year >= 1900 && year <= thisYear;
  if (!monthOk || !yearOk) {
    return { ok: false, reason: 'invalid', message: 'Enter your birth month as a number from 1 to 12 and your birth year as four digits.' };
  }
  if (year === thisYear && month > now.getMonth() + 1) {
    return { ok: false, reason: 'invalid', message: 'That date is in the future. Check the month and year.' };
  }
  if (ageFromMonthYear(month, year, now) < MIN_AGE) {
    return { ok: false, reason: 'under', message: UNDER_AGE_MESSAGE };
  }
  return { ok: true };
}

export const UNDER_AGE_MESSAGE =
  "Steer Me accounts are for ropers 13 and older, so we can't set one up. We haven't saved anything about you. Thanks for stopping by, and good luck out there.";

async function readKey(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web' && typeof window === 'undefined') return null;
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeKey(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof window === 'undefined') return;
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private browsing). The check still ran; only the memory of it is lost.
  }
}

export async function isAgeLocked(): Promise<boolean> {
  return (await readKey(LOCK_KEY)) !== null;
}

export async function hasPassedAgeGate(): Promise<boolean> {
  return (await readKey(PASSED_KEY)) !== null;
}

export async function recordAgeGateBlocked(): Promise<void> {
  await writeKey(LOCK_KEY, new Date().toISOString().slice(0, 10));
  logAgeGate('blocked_under_13');
}

export async function recordAgeGatePassed(): Promise<void> {
  await writeKey(PASSED_KEY, new Date().toISOString().slice(0, 10));
  logAgeGate('passed');
}

// Anonymous count, website only (see the note at the top). Best effort; never blocks the screen.
function logAgeGate(event: 'blocked_under_13' | 'passed') {
  if (Platform.OS !== 'web') return;
  let visitor: string | null = null;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    visitor = ls?.getItem('travel_visitor') ?? null;
    if (!visitor) {
      visitor = Math.random().toString(36).slice(2) + Date.now().toString(36);
      ls?.setItem('travel_visitor', visitor);
    }
  } catch {
    visitor = null;
  }
  supabase
    .rpc('log_feature_event', { p_feature: 'age_gate', p_event: event, p_props: {}, p_visitor: visitor })
    .then(() => {}, () => {});
}
