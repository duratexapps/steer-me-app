import type { EventWithProducer } from '@/src/hooks/useEvents';
import type { TownDistanceMap } from '@/src/hooks/useTownDistances';
import type { Hotspot } from '@/src/hooks/useHotspots';
import { isEventStillUpcoming } from '@/src/lib/date';

// Real ask, directly from the user: "Users should be able to sort by state
// or dates (within a week, within a month etc)... Regardless they should
// at the very lease be able to filter out the ones that are in the past or
// farther than they are will to travel from their home area." This file is
// the filtering logic backing app/events.tsx's filter bar - kept separate
// from the screen component so the (non-trivial) rules are unit-testable
// and readable on their own.

export type DateWindow = 'week' | 'month' | 'all';

export const DATE_WINDOW_OPTIONS: { value: DateWindow; label: string }[] = [
  { value: 'week', label: 'Within a week' },
  { value: 'month', label: 'Within a month' },
  { value: 'all', label: 'Any time' },
];

// "Any distance" is represented as null, same convention as maxMiles below -
// keeps the pill list and the filter check using the exact same values.
export const MILES_OPTIONS: { value: number | null; label: string }[] = [
  { value: 100, label: 'Within 100 mi' },
  { value: 250, label: 'Within 250 mi' },
  { value: 500, label: 'Within 500 mi' },
  { value: null, label: 'Any distance' },
];

// Every event location is now either a real "City, ST" value (Autocomplete-
// Field-confirmed, as of 2026-07-29) or, for events created before that
// change, whatever free text a producer typed. Parsing the trailing
// 2-letter code after the last comma covers both cases the same way, and
// simply yields null (excluded from the state picker, never shown as a
// false state match) for anything that doesn't fit that shape.
export function parseStateFromLocation(location: string): string | null {
  const match = location.trim().match(/,\s*([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : null;
}

// Every distinct, real state among the given events, alphabetized - used
// to build the state filter's own option list so it only ever offers
// states that actually have an event posted, never a dead choice.
export function distinctStates(events: EventWithProducer[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    const state = parseStateFromLocation(e.location);
    if (state) set.add(state);
  }
  return [...set].sort();
}

// Checks whether the event's date RANGE overlaps [today, today+window] at
// all, not just whether its start date falls in that window - otherwise a
// multi-day event that already started (e.g. a Fri-Sun roping checked on
// Saturday) would wrongly disappear from "within a week" even though it's
// actively happening right now. Single-day events (eventEndDate null)
// collapse to start === end, unchanged from the original single-date check.
function withinDateWindow(eventDate: string, eventEndDate: string | null, window: DateWindow): boolean {
  if (window === 'all') return true;
  const days = window === 'week' ? 7 : 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);
  const start = new Date(`${eventDate}T00:00:00`);
  const end = new Date(`${eventEndDate || eventDate}T00:00:00`);
  return start <= cutoff && end >= today;
}

export type EventFilters = {
  showPast: boolean;
  state: string | null; // null = all states
  dateWindow: DateWindow;
  maxMiles: number | null; // null = any distance
  type: string | null; // event tag: wstr / ustrc / ntr / over40; null = all
  hotspot: string | null; // hotspots.id; null = everywhere
};

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  // Baseline ask, satisfied by default rather than requiring the user to
  // discover a toggle: "at the very lease be able to filter out the ones
  // that are in the past."
  showPast: false,
  state: null,
  dateWindow: 'all',
  maxMiles: null,
  type: null,
  hotspot: null,
};

// Real gap reported by the user (2026-09-18): tapping "Partners" on an
// event, then hitting back, used to remount events.tsx from scratch -
// wiping whatever filters were applied and losing the whole point of
// filtering in the first place ("users are more likely to just close the
// app/website when experiencing this kind of friction"). Reflecting
// filters into the URL's query params means the browser/router's own back
// navigation restores them for free - no separate state-persistence layer
// needed, since going back returns to the exact prior URL.
//
// Every key is always included, even for default values (as '') - this
// goes through router.setParams(), which merges into the existing params
// rather than replacing them wholesale, so omitting a key when a filter
// returns to its default would leave the OLD value stuck in the URL
// instead of clearing it.
export function filtersToParams(filters: EventFilters): Record<string, string> {
  return {
    showPast: filters.showPast ? '1' : '',
    state: filters.state ?? '',
    dateWindow: filters.dateWindow !== 'all' ? filters.dateWindow : '',
    maxMiles: filters.maxMiles != null ? String(filters.maxMiles) : '',
    type: filters.type ?? '',
    hotspot: filters.hotspot ?? '',
  };
}

export function filtersFromParams(params: {
  showPast?: string;
  state?: string;
  dateWindow?: string;
  maxMiles?: string;
  type?: string;
  hotspot?: string;
}): EventFilters {
  const dateWindow = params.dateWindow;
  return {
    showPast: params.showPast === '1',
    state: params.state || null,
    dateWindow: dateWindow === 'week' || dateWindow === 'month' ? dateWindow : 'all',
    maxMiles: params.maxMiles ? Number(params.maxMiles) : null,
    type: params.type || null,
    hotspot: params.hotspot || null,
  };
}

// Labels for the Type chips, in display order. Only types that actually
// appear on a posted event are offered (see distinctTypes).
export const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'over40', label: '40+' },
  { value: 'wstr', label: 'WSTR' },
  { value: 'ustrc', label: 'USTRC' },
  { value: 'ntr', label: 'NTR' },
  // Not an association tag: clinics are a separate flag (events.is_clinic). They never show in the main list,
  // only under this chip.
  { value: 'clinic', label: 'Clinics & schools' },
];

export function distinctTypes(events: EventWithProducer[]): { value: string; label: string }[] {
  const present = new Set<string>();
  for (const e of events) {
    if (e.is_clinic) present.add('clinic');
    for (const t of e.tags ?? []) present.add(t);
  }
  return TYPE_OPTIONS.filter((o) => present.has(o.value));
}

// An event is "in" a hotspot when its "City, ST" location names one of the
// hotspot's towns in that hotspot's state.
function inHotspot(location: string, hotspot: Hotspot): boolean {
  if (parseStateFromLocation(location) !== hotspot.state.toUpperCase()) return false;
  const city = location.split(',')[0].trim().toLowerCase();
  return hotspot.towns.some((t) => t.trim().toLowerCase() === city);
}

export function applyEventFilters(
  events: EventWithProducer[],
  filters: EventFilters,
  distances: TownDistanceMap,
  hotspots: Hotspot[] = []
): EventWithProducer[] {
  const activeHotspot = filters.hotspot ? hotspots.find((h) => h.id === filters.hotspot) ?? null : null;
  return events.filter((event) => {
    if (!filters.showPast && !isEventStillUpcoming(event.event_date, event.event_end_date)) {
      return false;
    }
    if (filters.state && parseStateFromLocation(event.location) !== filters.state) {
      return false;
    }
    // Clinics & schools live only under their own chip, never mixed into the ropings.
    if (filters.type === 'clinic' ? !event.is_clinic : event.is_clinic) {
      return false;
    }
    if (filters.type && filters.type !== 'clinic' && !(event.tags ?? []).includes(filters.type)) {
      return false;
    }
    if (activeHotspot && !inHotspot(event.location, activeHotspot)) {
      return false;
    }
    if (filters.dateWindow !== 'all' && !withinDateWindow(event.event_date, event.event_end_date, filters.dateWindow)) {
      return false;
    }
    if (filters.maxMiles != null) {
      const miles = distances.get(event.location);
      // Fail soft, same rule as useTownDistances itself: a still-loading
      // (undefined) or genuinely uncomputable (null) distance never hides
      // an event - only a KNOWN distance over the limit does. Otherwise a
      // slow/failed lookup would silently disappear real events with no
      // indication why.
      if (typeof miles === 'number' && miles > filters.maxMiles) {
        return false;
      }
    }
    return true;
  });
}
