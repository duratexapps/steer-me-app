import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatDateDisplay, toISODateString } from '@/src/lib/date';

type DateFieldProps = {
  label: string;
  value: string | null; // ISO date string (YYYY-MM-DD)
  onChange: (isoDate: string) => void;
  minimumDate?: Date;
};

// Real date picker, not free text - a free-text "date" field that gets
// parsed straight into a Postgres `date` column breaks on completely
// normal input (an ordinal "20th" instead of "20" is enough to make
// Postgres reject it outright), and this is also what "prompted to select
// a date" actually asked for. iOS renders the picker inline inside a small
// sheet; Android's imperative API already shows its own native modal, so
// nothing extra needs to be rendered there.
export function DateField({ label, value, onChange, minimumDate }: DateFieldProps) {
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const currentDate = value ? new Date(`${value}T00:00:00`) : new Date();

  function handlePress() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        minimumDate,
        onChange: (_event, selectedDate) => {
          if (selectedDate) onChange(toISODateString(selectedDate));
        },
      });
    } else if (Platform.OS === 'ios') {
      setIosPickerOpen(true);
    }
    // web: nothing to do here - the real <input type="date"> below handles
    // its own click/open natively, there's no imperative "open" step.
  }

  // Web has no equivalent to either native picker - @react-native-community/
  // datetimepicker doesn't render usably in a browser, and the modal+spinner
  // approach built for iOS was silently rendering nothing at all on web
  // (gated on `Platform.OS === 'ios'` with no web branch), so tapping a date
  // field did nothing visible - no way to pick a date, which blocked Create
  // Event and Post a Need entirely on web. A real native <input type="date">
  // is the standard, reliable fix - browsers already ship a perfectly good
  // date picker UI for it, no extra library needed.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <input
          type="date"
          value={value ?? ''}
          min={minimumDate ? toISODateString(minimumDate) : undefined}
          onChange={(e: { target: { value: string } }) => {
            if (e.target.value) onChange(e.target.value);
          }}
          style={webInputStyle}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={handlePress}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDateDisplay(value) : 'Tap to select a date'}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Modal visible={iosPickerOpen} transparent animationType="slide" onRequestClose={() => setIosPickerOpen(false)}>
          <View style={styles.overlay}>
            <View style={styles.card}>
              <DateTimePicker
                value={currentDate}
                mode="date"
                display="spinner"
                minimumDate={minimumDate}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) onChange(toISODateString(selectedDate));
                }}
              />
              <Button label="Done" onPress={() => setIosPickerOpen(false)} style={{ marginTop: 8 }} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// Plain CSS-in-JS object, not an RN StyleSheet entry - this is a real HTML
// <input>, not a View/Text, so it takes DOM style props directly rather
// than going through react-native-web's style translation.
const webInputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '12px 14px',
  borderRadius: radii.md,
  border: `1.5px solid ${colors.saddle}`,
  backgroundColor: colors.tanLight,
  fontFamily: fonts.body,
  fontSize: 14,
  color: colors.ink,
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.saddle,
    backgroundColor: colors.tanLight,
  },
  valueText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  placeholderText: { fontFamily: fonts.body, fontSize: 14, color: colors.placeholder },
  overlay: { flex: 1, backgroundColor: 'rgba(42,35,28,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: colors.bone, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 18 },
});
