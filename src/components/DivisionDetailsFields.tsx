import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatDivision } from '@/src/lib/matching';

type DivisionDetailsFieldsProps = {
  divisions: number[];
  details: Record<string, string>;
  onChange: (details: Record<string, string>) => void;
};

// NEW, added 2026-07-30 alongside migration 0041 - real ask, directly
// from the user: "The human eye naturally drifts to the event classes
// your subconsciously interested in only to realize those details are
// not there. They are grouped above with everything else... Details
// pertaining to each class (cost to enter, end caps, max entries etc)
// should be listed WITH the checkbox indicating attendance." Renders one
// optional free-text field per currently-selected division, so a
// producer/admin transcribing a flier can enter each class's own detail
// right where it belongs - EventCard.tsx then shows it alongside that
// exact division's own attendance checkbox, not mixed into the shared,
// whole-event description. Shared between create-event.tsx,
// admin-post-event.tsx, and admin-edit-event.tsx rather than duplicated
// three times over.
export function DivisionDetailsFields({ divisions, details, onChange }: DivisionDetailsFieldsProps) {
  if (divisions.length === 0) return null;

  function setDetail(division: number, text: string) {
    onChange({ ...details, [String(division)]: text });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Per-class details (optional)</Text>
      <Text style={styles.helper}>
        Cost to enter, caps, max entries, steer count, etc. for each class - shown right next to that class's own
        attendance checkbox instead of buried in the description below. Leave blank for a class that just uses the
        shared entry fee above.
      </Text>
      {divisions.map((d) => (
        <View key={d} style={styles.row}>
          <Text style={styles.divisionLabel}>{formatDivision(d)}</Text>
          <TextInput
            style={styles.input}
            value={details[String(d)] ?? ''}
            onChangeText={(text) => setDetail(d, text)}
            placeholder="e.g. $140/man, capped #5.5, P1/D2/D3, enter 4x, 3 steer avg"
            placeholderTextColor="#9c8a6b"
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 4,
  },
  helper: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginBottom: 10, lineHeight: 15 },
  row: { marginBottom: 8 },
  divisionLabel: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.brass, marginBottom: 3 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.saddle,
    borderRadius: radii.md,
    backgroundColor: colors.tanLight,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
  },
});
