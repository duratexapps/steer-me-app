import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pill } from '@/src/components/ui/Pill';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { colors, fonts, radii } from '@/src/theme/theme';
import { DATE_WINDOW_OPTIONS, MILES_OPTIONS, type EventFilters } from '@/src/lib/event-filters';

type EventFiltersBarProps = {
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
  states: string[];
  homeArea: string | null | undefined;
  resultCount: number;
};

// Real ask, directly from the user: "Users should be able to sort by state
// or dates (within a week, within a month etc)... Regardless they should at
// the very lease be able to filter out the ones that are in the past or
// farther than they are will to travel from their home area." Deliberately
// built as pill/toggle rows (not dropdowns) - every option is visible and
// tappable in one glance, no extra menu to open, on a screen that's mostly
// about scanning a list quickly.
export function EventFiltersBar({ filters, onChange, states, homeArea, resultCount }: EventFiltersBarProps) {
  return (
    <View style={styles.wrap}>
      <ToggleRow
        title="Show past events"
        description="Off by default - most people only want what's still upcoming"
        value={filters.showPast}
        onToggle={() => onChange({ ...filters, showPast: !filters.showPast })}
      />

      <Text style={styles.label}>When</Text>
      <View style={styles.pillRow}>
        {DATE_WINDOW_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            label={opt.label}
            selected={filters.dateWindow === opt.value}
            onPress={() => onChange({ ...filters, dateWindow: opt.value })}
          />
        ))}
      </View>

      {/* Farther than I'm willing to travel - real driven miles from home_area,
          not straight-line (see useTownDistances/get-town-distance). Only
          shown once the user actually has a home area set on their profile -
          there's nothing to measure distance FROM otherwise. */}
      {homeArea ? (
        <>
          <Text style={styles.label}>How far you'll travel from {homeArea}</Text>
          <View style={styles.pillRow}>
            {MILES_OPTIONS.map((opt) => (
              <Pill
                key={opt.label}
                label={opt.label}
                selected={filters.maxMiles === opt.value}
                onPress={() => onChange({ ...filters, maxMiles: opt.value })}
              />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.hint}>Set a home area on your profile to filter events by driving distance.</Text>
      )}

      {states.length > 0 ? (
        <>
          <Text style={styles.label}>State</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRowScroll}>
            <Pill label="All states" selected={filters.state === null} onPress={() => onChange({ ...filters, state: null })} />
            {states.map((state) => (
              <Pill key={state} label={state} selected={filters.state === state} onPress={() => onChange({ ...filters, state })} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <Text style={styles.resultCount}>
        {resultCount} event{resultCount === 1 ? '' : 's'} match{resultCount === 1 ? 'es' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 8,
    marginTop: 4,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  pillRowScroll: { flexDirection: 'row', gap: 8, marginBottom: 6, paddingRight: 6 },
  hint: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11.5,
    color: colors.saddle,
    marginBottom: 6,
  },
  resultCount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    color: colors.brass,
    marginTop: 8,
  },
});
