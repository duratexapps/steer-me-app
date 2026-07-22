import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';
import { HOME_AREAS, type HomeAreaEntry } from '@/src/data/home-areas';

type AutocompleteFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
};

function labelFor(entry: HomeAreaEntry) {
  return `${entry.city}, ${entry.state}`;
}

function search(query: string): HomeAreaEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const startsWith: HomeAreaEntry[] = [];
  const contains: HomeAreaEntry[] = [];
  for (const entry of HOME_AREAS) {
    const city = entry.city.toLowerCase();
    if (city.startsWith(q)) {
      startsWith.push(entry);
    } else if (labelFor(entry).toLowerCase().includes(q)) {
      contains.push(entry);
    }
  }
  return [...startsWith, ...contains].slice(0, 8);
}

// Home area must resolve to one real, specific place - not whatever text
// happens to be sitting in the input - so partner search/filtering
// elsewhere in the app has something consistent to match on. Typing "Hou"
// suggests Houston, TX; typing a name that exists in multiple states
// (Sheridan, WY vs. Sheridan, TX) surfaces both as separate choices. There
// is no bypass: text that was never confirmed by tapping a suggestion is
// discarded on blur, and `value` (what the parent screen actually stores)
// only ever changes via handleSelect.
export function AutocompleteField({ label, value, onChange, placeholder, required }: AutocompleteFieldProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const selectingRef = useRef(false);

  const results = useMemo(() => search(query), [query]);

  function handleChangeText(text: string) {
    setQuery(text);
    setOpen(true);
    if (value) onChange(''); // editing after a confirmed pick invalidates it until reselected
  }

  function handleSelect(entry: HomeAreaEntry) {
    selectingRef.current = true;
    const picked = labelFor(entry);
    setQuery(picked);
    onChange(picked);
    setOpen(false);
  }

  function handleBlur() {
    // A suggestion tap blurs the input right before its onPress fires -
    // give that a beat to land before wiping unconfirmed text.
    setTimeout(() => {
      if (!selectingRef.current && query !== value) {
        setQuery(value);
      }
      selectingRef.current = false;
      setOpen(false);
    }, 150);
  }

  const showHint = open === false && query.trim().length > 0 && !value;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *required</Text> : null}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          placeholder={placeholder}
          placeholderTextColor="#9c8a6b"
          style={styles.input}
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          autoCapitalize="words"
        />
        {open && query.trim().length > 0 ? (
          <View style={styles.dropdown}>
            {results.length > 0 ? (
              results.map((entry) => (
                <Pressable
                  key={labelFor(entry)}
                  style={styles.option}
                  onPress={() => handleSelect(entry)}
                >
                  <Text style={styles.optionText}>{labelFor(entry)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.noMatch}>No matching towns - try a different spelling or a nearby city</Text>
            )}
          </View>
        ) : null}
      </View>
      {showHint ? <Text style={styles.hint}>Select a suggestion from the list to set your home area.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, zIndex: 10 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
  required: { color: colors.brass, textTransform: 'none' },
  inputRow: { position: 'relative' },
  input: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.saddle,
    backgroundColor: colors.tanLight,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: colors.tanLight,
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.md,
    paddingVertical: 4,
    zIndex: 20,
    elevation: 6,
  },
  option: { paddingVertical: 10, paddingHorizontal: 14 },
  optionText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  noMatch: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.saddle,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.brass,
    marginTop: 4,
  },
});
