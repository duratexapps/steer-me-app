import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pill } from '@/src/components/ui/Pill';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';

// Public hauling-paperwork checker (NEW 2026-10-08). No login: it is meant to be shared in roping groups and
// opened from My Horses. All rule text lives in the database (travel_rules / travel_alerts / travel_states), so a
// correction is a data edit, not an app release. Every rule shows its source and the date it was last checked.
// Rules are a GUIDE: the page says so, links the state office, and links the national official report tool.
// Usage is logged anonymously (log_feature_event) to tell us whether this earns a bigger build.

type Rule = {
  id: string; state: string; species: 'horse' | 'cattle' | 'both'; applies: 'entering' | 'leaving' | 'transit';
  kind: 'required' | 'conditional' | 'check'; title: string; window_text: string | null; detail: string;
  confidence: 'official' | 'secondary'; source_name: string; source_url: string; verified_on: string; sort: number;
};
type Alert = { id: string; kind: string; title: string; body: string; states: string[]; source_name: string; source_url: string; verified_on: string };
type StateRow = { code: string; name: string; office_name: string | null; office_url: string | null; office_phone: string | null; office_email: string | null };

const OFFICIAL_TOOL = 'https://www.interstatelivestock.com/';
const REPORT_EMAIL = 'ropingtools@duratex-ie.com';
const KIND_LABEL: Record<Rule['kind'], string> = { required: 'Usually required', conditional: 'If it applies', check: 'Confirm' };

let memoryVisitorId: string | null = null;
function visitorId(): string {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    let id = ls?.getItem('travel_visitor');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      ls?.setItem('travel_visitor', id);
    }
    return id;
  } catch {
    memoryVisitorId ??= Math.random().toString(36).slice(2) + Date.now().toString(36);
    return memoryVisitorId;
  }
}
function logEvent(event: string, props: Record<string, unknown> = {}) {
  supabase.rpc('log_feature_event', { p_feature: 'travel_checker', p_event: event, p_props: props, p_visitor: visitorId() }).then(() => {}, () => {});
}
const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function useTravelData() {
  return useQuery({
    queryKey: ['travel-data'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [s, r, a] = await Promise.all([
        supabase.from('travel_states').select('*').order('name'),
        supabase.from('travel_rules').select('*'),
        supabase.from('travel_alerts').select('*'),
      ]);
      if (s.error) throw s.error;
      if (r.error) throw r.error;
      if (a.error) throw a.error;
      return { states: s.data as StateRow[], rules: r.data as Rule[], alerts: a.data as Alert[] };
    },
  });
}

function StateGrid({ states, selected, onToggle }: { states: StateRow[]; selected: string[]; onToggle: (code: string) => void }) {
  return (
    <View style={styles.grid}>
      {states.map((s) => (
        <Pill key={s.code} label={s.code} selected={selected.includes(s.code)} onPress={() => onToggle(s.code)} />
      ))}
    </View>
  );
}

function RuleCard({ rule }: { rule: Rule }) {
  return (
    <View style={styles.rule}>
      <View style={styles.ruleHead}>
        <Text style={[styles.badge, rule.kind === 'required' ? styles.badgeReq : styles.badgeOther]}>{KIND_LABEL[rule.kind]}</Text>
        <Text style={styles.ruleTitle}>{rule.title}</Text>
      </View>
      {rule.window_text ? <Text style={styles.window}>{rule.window_text}</Text> : null}
      <Text style={styles.detail}>{rule.detail}</Text>
      <Text style={styles.src}>
        Checked {fmtDate(rule.verified_on)} ·{' '}
        <Text style={styles.link} onPress={() => Linking.openURL(rule.source_url)}>
          {rule.source_name}
        </Text>
        {rule.confidence === 'secondary' ? ' · secondary source, confirm with the state' : ''}
      </Text>
    </View>
  );
}

export default function Travel() {
  const { src } = useLocalSearchParams<{ src?: string }>();
  const { data, isLoading, error } = useTravelData();
  const [species, setSpecies] = useState<'horse' | 'cattle'>('horse');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [through, setThrough] = useState<string[]>([]);
  const [unload, setUnload] = useState(false);
  const [open, setOpen] = useState<'from' | 'to' | 'through' | null>(null);
  const [voted, setVoted] = useState(false);
  const viewLogged = useRef(false);
  const lastCheck = useRef('');

  useEffect(() => {
    if (!viewLogged.current) {
      viewLogged.current = true;
      logEvent('view');
      if (src === 'app') logEvent('open_from_app');
    }
  }, []);

  const stateName = (c: string | null) => (c ? data?.states.find((s) => s.code === c)?.name ?? c : null);
  const route = useMemo(() => [from, to, ...through].filter(Boolean) as string[], [from, to, through]);

  useEffect(() => {
    if (!from || !to) return;
    const key = `${species}|${from}|${to}|${through.join(',')}|${unload}`;
    if (key === lastCheck.current) return;
    lastCheck.current = key;
    logEvent('check', { species, from, to, through, unload });
    setVoted(false);
  }, [species, from, to, through, unload]);

  const matches = (r: Rule) => r.species === 'both' || r.species === species;
  const rules = (data?.rules ?? []).filter(matches);
  const ruleSort = (a: Rule, b: Rule) => a.sort - b.sort;
  const baseline = rules.filter((r) => r.state === 'US' && r.applies === 'entering').sort(ruleSort);
  const transitRules = rules.filter((r) => r.state === 'US' && r.applies === 'transit').sort(ruleSort);
  const leaving = from ? rules.filter((r) => r.state === from && r.applies === 'leaving').sort(ruleSort) : [];
  const entering = to ? rules.filter((r) => r.state === to && r.applies === 'entering').sort(ruleSort) : [];
  const stops = unload ? through.map((st) => ({ st, list: rules.filter((r) => r.state === st && r.applies === 'entering').sort(ruleSort) })) : [];
  const alerts = (data?.alerts ?? []).filter((a) => a.states.some((s) => route.includes(s)));
  const officeFor = (code: string | null) => data?.states.find((s) => s.code === code);

  const ready = !!from && !!to;
  const toggleSingle = (setter: (v: string | null) => void, current: string | null) => (code: string) => {
    setter(current === code ? null : code);
    setOpen(null);
  };
  const toggleThrough = (code: string) => setThrough((t) => (t.includes(code) ? t.filter((x) => x !== code) : [...t, code]));

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Head>
        <title>Hauling Paperwork Check for Horses & Roping Cattle | Steer Me</title>
        <meta
          name="description"
          content="Pick where you're hauling from and to. See the health papers, Coggins, permits and screwworm, EHV and vesicular stomatitis rules that may apply, with sources and dates."
        />
        <link rel="canonical" href="https://steerme.ropingtools.com/travel" />
      </Head>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>STEER ME · FREE · NO ACCOUNT NEEDED</Text>
        <Text style={styles.h1}>Hauling paperwork check</Text>
        <Text style={styles.sub}>
          Pick where you are leaving from and going to, and see the papers that may be needed for your horses or roping cattle. Screwworm, EHV and vesicular stomatitis rules are changing fast, so each item shows where it came from and when it was last checked.
        </Text>

        <Text style={styles.label}>What are you hauling?</Text>
        <View style={styles.row}>
          <Pill label="Horses" selected={species === 'horse'} onPress={() => setSpecies('horse')} />
          <Pill label="Roping cattle" selected={species === 'cattle'} onPress={() => setSpecies('cattle')} />
        </View>

        {isLoading ? <Text style={styles.sub}>Loading the rules…</Text> : null}
        {error ? <Text style={styles.err}>Could not load the rules. Check your connection and refresh. You can still use the national tool below.</Text> : null}

        {data ? (
          <>
            <Text style={styles.label}>Leaving from</Text>
            <Pressable style={styles.picker} onPress={() => setOpen(open === 'from' ? null : 'from')}>
              <Text style={styles.pickerText}>{from ? `${stateName(from)} (${from})` : 'Choose a state'}</Text>
            </Pressable>
            {open === 'from' ? <StateGrid states={data.states} selected={from ? [from] : []} onToggle={toggleSingle(setFrom, from)} /> : null}

            <Text style={styles.label}>Going to</Text>
            <Pressable style={styles.picker} onPress={() => setOpen(open === 'to' ? null : 'to')}>
              <Text style={styles.pickerText}>{to ? `${stateName(to)} (${to})` : 'Choose a state'}</Text>
            </Pressable>
            {open === 'to' ? <StateGrid states={data.states} selected={to ? [to] : []} onToggle={toggleSingle(setTo, to)} /> : null}

            <Text style={styles.label}>States you pass through (optional)</Text>
            <Pressable style={styles.picker} onPress={() => setOpen(open === 'through' ? null : 'through')}>
              <Text style={styles.pickerText}>{through.length ? through.join(', ') : 'Add states'}</Text>
            </Pressable>
            {open === 'through' ? <StateGrid states={data.states} selected={through} onToggle={toggleThrough} /> : null}
            {through.length ? (
              <Pressable style={styles.check} onPress={() => setUnload((u) => !u)}>
                <Text style={styles.checkBox}>{unload ? '☑' : '☐'}</Text>
                <Text style={styles.checkText}>The animals will unload or stay overnight in one of these states</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {ready && data ? (
          <View style={styles.results}>
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Please read first</Text>
              <Text style={styles.noticeText}>
                We gathered this from scattered state and federal sources as a free convenience, and it may be incomplete or out of date. It is a guide, not legal or veterinary advice. Each item shows its source and the date we last checked it, and the state offices to call are listed below. Please confirm with them, the event and your veterinarian before you haul. Steer Me does not verify documents or decide whether an animal can travel.
              </Text>
            </View>
            {alerts.length ? (
              <>
                <Text style={styles.h2}>Active alerts on your route</Text>
                {alerts.map((a) => (
                  <View key={a.id} style={styles.alert}>
                    <Text style={styles.alertTitle}>{a.title}</Text>
                    <Text style={styles.detail}>{a.body}</Text>
                    <Text style={styles.src}>
                      Checked {fmtDate(a.verified_on)} ·{' '}
                      <Text style={styles.link} onPress={() => Linking.openURL(a.source_url)}>
                        {a.source_name}
                      </Text>
                    </Text>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={styles.h2}>Most trips</Text>
            {baseline.map((r) => <RuleCard key={r.id} rule={r} />)}

            {leaving.length ? (
              <>
                <Text style={styles.h2}>Leaving {stateName(from)}</Text>
                {leaving.map((r) => <RuleCard key={r.id} rule={r} />)}
              </>
            ) : null}

            <Text style={styles.h2}>Entering {stateName(to)}</Text>
            {entering.length ? (
              entering.map((r) => <RuleCard key={r.id} rule={r} />)
            ) : (
              <Text style={styles.detail}>
                I haven't mapped {stateName(to)}'s rules for {species === 'horse' ? 'horses' : 'roping cattle'} yet. Use the national report below and call the state office.
              </Text>
            )}

            {through.length ? (
              <>
                <Text style={styles.h2}>Passing through {through.map((c) => stateName(c)).join(', ')}</Text>
                {unload ? (
                  stops.map(({ st, list }) =>
                    list.length ? (
                      <View key={st}>
                        <Text style={styles.stateLine}>If you unload or stay overnight in {stateName(st)}:</Text>
                        {list.map((r) => <RuleCard key={r.id} rule={r} />)}
                      </View>
                    ) : (
                      <Text key={st} style={styles.detail}>
                        {stateName(st)}: not mapped yet. If you unload there, check its entry rules.
                      </Text>
                    )
                  )
                ) : (
                  transitRules.map((r) => <RuleCard key={r.id} rule={r} />)
                )}
              </>
            ) : null}

            <Text style={styles.h2}>Confirm with the state</Text>
            {[from, to, ...(unload ? through : [])].filter((c, i, a) => c && a.indexOf(c) === i).map((c) => {
              const o = officeFor(c);
              return (
                <Text key={c} style={styles.detail}>
                  <Text style={styles.bold}>{stateName(c)}:</Text>{' '}
                  {o?.office_name ? (
                    <>
                      <Text style={styles.link} onPress={() => o.office_url && Linking.openURL(o.office_url)}>{o.office_name}</Text>
                      {o.office_phone ? ` · ${o.office_phone}` : ''}
                      {o.office_email ? ` · ${o.office_email}` : ''}
                    </>
                  ) : (
                    'search for the state veterinarian or department of agriculture, or use the national report below.'
                  )}
                </Text>
              );
            })}

            <View style={styles.official}>
              <Text style={styles.bold}>Get the official report for any state</Text>
              <Text style={styles.detail}>
                InterstateLivestock.com is run for the national animal-health groups and covers every state. Choose the same states and animals there.
              </Text>
              <Pressable
                style={styles.btn}
                onPress={() => {
                  logEvent('open_official', { from, to });
                  Linking.openURL(OFFICIAL_TOOL);
                }}
              >
                <Text style={styles.btnText}>Open InterstateLivestock.com</Text>
              </Pressable>
            </View>

            <View style={styles.feedback}>
              {voted ? (
                <Text style={styles.detail}>Thanks, that helps.</Text>
              ) : (
                <>
                  <Text style={styles.bold}>Was this helpful?</Text>
                  <View style={styles.row}>
                    <Pill label="Yes" onPress={() => { setVoted(true); logEvent('helpful_yes', { from, to, species }); }} />
                    <Pill label="Not really" onPress={() => { setVoted(true); logEvent('helpful_no', { from, to, species }); }} />
                  </View>
                </>
              )}
              <Text
                style={styles.link}
                onPress={() => {
                  logEvent('report_error', { from, to, species });
                  Linking.openURL(`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent('Hauling paperwork check: something looks wrong')}&body=${encodeURIComponent(`Route: ${from} to ${to}\nHauling: ${species}\nWhat looks wrong:\n`)}`);
                }}
              >
                Something look wrong or out of date? Tell us.
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>Choose your starting and ending states to see the list.</Text>
        )}

        <Text style={styles.disclaimer}>
          This is a guide, not legal or veterinary advice. Rules change often and can be stricter at a specific event or venue. Always confirm with the destination state and the event, and ask your accredited veterinarian to issue the certificate. Steer Me does not verify any document or decide whether an animal may travel.
        </Text>

        <View style={styles.cta}>
          <Text style={styles.ctaTitle}>Keep your Coggins on your phone</Text>
          <Text style={styles.ctaBody}>Steer Me is a free app for finding team roping partners. It also stores each horse's Coggins and shows it at the gate with a QR code.</Text>
          <Pressable style={styles.btn} onPress={() => Linking.openURL('https://steerme.ropingtools.com/get')}>
            <Text style={styles.btnText}>Get Steer Me</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 60 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, color: colors.brass, marginBottom: 8 },
  h1: { fontFamily: fonts.displayBold, fontSize: 30, color: colors.espresso, marginBottom: 8 },
  h2: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.espresso, marginTop: 24, marginBottom: 8 },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.saddle, lineHeight: 20, marginBottom: 12 },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: colors.brass, marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  picker: { backgroundColor: colors.tanLight, borderWidth: 1.5, borderColor: colors.saddle, borderRadius: radii.md, padding: 14 },
  pickerText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.espresso },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  checkBox: { fontSize: 20, color: colors.espresso },
  checkText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, color: colors.espresso },
  results: { marginTop: 8 },
  notice: { backgroundColor: colors.espresso, borderRadius: radii.md, padding: 14, marginBottom: 4 },
  noticeTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.brassLight, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  noticeText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, lineHeight: 19 },
  rule: { backgroundColor: colors.tanLight, borderWidth: 1, borderColor: colors.saddle, borderRadius: radii.md, padding: 14, marginBottom: 10 },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ruleTitle: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.espresso },
  badge: { fontFamily: fonts.bodyBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radii.pill, overflow: 'hidden' },
  badgeReq: { backgroundColor: colors.brass, color: colors.bone },
  badgeOther: { backgroundColor: '#F1E2B4', color: colors.espresso },
  window: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.brass, marginTop: 6 },
  detail: { fontFamily: fonts.body, fontSize: 13.5, color: colors.espresso, lineHeight: 19, marginTop: 6 },
  src: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 8, lineHeight: 16 },
  link: { fontFamily: fonts.bodySemiBold, color: colors.saddle, textDecorationLine: 'underline' },
  bold: { fontFamily: fonts.bodyBold, color: colors.espresso },
  stateLine: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.espresso, marginTop: 8, marginBottom: 4 },
  alert: { backgroundColor: '#FBEFD2', borderWidth: 1.5, borderColor: colors.brass, borderRadius: radii.md, padding: 14, marginBottom: 10 },
  alertTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.espresso },
  official: { marginTop: 18, padding: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.saddle, backgroundColor: colors.tanLight },
  feedback: { marginTop: 18, gap: 8 },
  btn: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.brass, borderRadius: radii.md, paddingVertical: 12, paddingHorizontal: 18 },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bone },
  hint: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: colors.saddle, marginTop: 20 },
  err: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.oxblood, marginTop: 12 },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, lineHeight: 17, marginTop: 28 },
  cta: { marginTop: 24, padding: 16, borderRadius: radii.md, backgroundColor: colors.espresso },
  ctaBody: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, lineHeight: 19, marginTop: 6 },
  ctaTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.bone },
});
