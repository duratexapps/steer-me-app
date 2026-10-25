import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pill } from '@/src/components/ui/Pill';
import { MembersGate } from '@/src/components/MembersGate';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { logFeature } from '@/src/lib/feature-log';
import { isFeatured } from '@/src/lib/date';

// Layover finder: where to stop overnight with horses on a haul, and whether the stop has RV hookups. Free for
// registered members (the database requires a signed-in user to read layover_spots). Every listing is curated data
// with its source and the date it was checked, and says plainly when nobody has confirmed it with the facility.
// Routes work by state, like the paperwork checker: pick where you leave from and go to, add the states in between,
// and the stops in those states are laid out in travel order with the straight-line distance between them.
// Usage is logged anonymously on the website only (see src/lib/feature-log.ts).

type Spot = {
  id: string; name: string; kind: 'fairgrounds' | 'equestrian_center' | 'boarding_barn' | 'arena' | 'campground' | 'hotel';
  state: string; city: string; address: string | null; lat: number; lng: number; phone: string | null; website: string | null;
  has_stalls: boolean; has_pens: boolean; housing_detail: string | null; rv_hookups: boolean; rv_detail: string | null;
  requirements: string | null; season_note: string | null; notes: string | null;
  featured_until: string | null;
  trailer_parking: boolean | null; parking_secure: boolean | null; parking_detail: string | null;
  verification: 'unverified' | 'confirmed'; confirmed_on: string | null; source_name: string; source_url: string; verified_on: string;
};
type StateRow = { code: string; name: string };

const REPORT_EMAIL = 'ropingtools@duratex-ie.com';
const KIND_LABEL: Record<Spot['kind'], string> = {
  fairgrounds: 'Fairgrounds', equestrian_center: 'Equestrian center', boarding_barn: 'Horse motel / barn', arena: 'Arena', campground: 'RV park with horses', hotel: 'Hotel',
};

// Rough state centers, used only to put stops in travel order along the line from where you start to where you finish.
const CENTER: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.2, -149.5], AZ: [34.2, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.7], CO: [39.0, -105.5], CT: [41.6, -72.7],
  DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.7, -83.4], HI: [20.8, -156.3], ID: [44.4, -114.6], IL: [40.0, -89.2],
  IN: [39.9, -86.3], IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2], MD: [39.0, -76.8],
  MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5],
  OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9], SD: [44.4, -100.2],
  TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.8], WA: [47.4, -120.5], WV: [38.6, -80.6],
  WI: [44.6, -90.0], WY: [43.0, -107.6],
};

type QuickRoute = { key: string; label: string; from: string; to: string; through: string[]; roads: string; south: boolean };
const QUICK_ROUTES: QuickRoute[] = [
  { key: 'mt-az', label: 'Montana to Arizona', from: 'MT', to: 'AZ', through: ['ID', 'UT'], roads: 'I-15', south: true },
  { key: 'mt-nv', label: 'Montana to Nevada', from: 'MT', to: 'NV', through: ['ID', 'UT'], roads: 'I-15', south: true },
  { key: 'mt-tx', label: 'Montana to Texas', from: 'MT', to: 'TX', through: ['WY', 'CO', 'NM'], roads: 'I-25, I-40', south: true },
  { key: 'az-mt', label: 'Arizona to Montana', from: 'AZ', to: 'MT', through: ['UT', 'ID'], roads: 'I-15', south: false },
  { key: 'nv-mt', label: 'Nevada to Montana', from: 'NV', to: 'MT', through: ['UT', 'ID'], roads: 'I-15', south: false },
  { key: 'tx-mt', label: 'Texas to Montana', from: 'TX', to: 'MT', through: ['NM', 'CO', 'WY'], roads: 'I-40, I-25', south: false },
];

const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const miles = (a: Spot, b: Spot) => {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

function useStates() {
  return useQuery({
    queryKey: ['travel-states'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('travel_states').select('code,name').order('name');
      if (error) throw error;
      return data as StateRow[];
    },
  });
}

function useSpots() {
  return useQuery({
    queryKey: ['layover-spots'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Owner-submitted listings are visible to their owner while pending (RLS), and have no coordinates until approved,
      // so the finder only takes approved ones.
      const { data, error } = await supabase.from('layover_spots').select('*').eq('review_status', 'approved');
      if (error) throw error;
      return (data as Spot[]).filter((s) => s.lat != null && s.lng != null).map((s) => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) }));
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

function SpotCard({ spot, onAction }: { spot: Spot; onAction: (event: string) => void }) {
  const housing = [spot.has_stalls ? 'Stalls' : null, spot.has_pens ? 'Pens / corrals' : null].filter(Boolean).join(' and ');
  return (
    <View style={[styles.spot, isFeatured(spot.featured_until) && styles.spotFeatured]}>
      <View style={styles.spotHead}>
        {isFeatured(spot.featured_until) ? <Text style={[styles.badge, styles.featuredBadge]}>Featured</Text> : null}
        <Text style={styles.badge}>{KIND_LABEL[spot.kind]}</Text>
        <Text style={styles.spotName}>{spot.name}</Text>
      </View>
      <Text style={styles.where}>{spot.city}, {spot.state}</Text>
      {spot.address ? <Text style={styles.address}>{spot.address}</Text> : null}
      {housing || spot.housing_detail ? (
        <Text style={styles.detail}><Text style={styles.bold}>Horses: </Text>{[housing, spot.housing_detail].filter(Boolean).join('. ')}</Text>
      ) : null}
      {spot.rv_hookups ? (
        <Text style={styles.detail}><Text style={styles.bold}>RV hookups: </Text>{spot.rv_detail ?? 'Yes (details not stated)'}</Text>
      ) : spot.rv_detail ? (
        <Text style={styles.detail}><Text style={styles.bold}>RV: </Text>{spot.rv_detail}</Text>
      ) : null}
      {spot.trailer_parking ? (
        <Text style={styles.detail}>
          <Text style={styles.bold}>Trailer parking: </Text>
          {spot.parking_secure === false ? <Text style={styles.warn}>NOT secure. Park at your own risk. </Text> : spot.parking_secure ? 'Secure. ' : ''}
          {spot.parking_detail ?? ''}
        </Text>
      ) : null}
      {spot.requirements ? <Text style={styles.detail}><Text style={styles.bold}>Good to know: </Text>{spot.requirements}</Text> : null}
      {spot.season_note ? <Text style={styles.detail}><Text style={styles.bold}>Timing: </Text>{spot.season_note}</Text> : null}
      {spot.notes ? <Text style={styles.detail}>{spot.notes}</Text> : null}

      {spot.source_name === 'Submitted by the owner' ? (
        <Text style={styles.src}>Submitted by the owner. A listing on Steer Me is not an endorsement by Steer Me.</Text>
      ) : null}
      <Text style={spot.verification === 'confirmed' ? styles.confirmed : styles.callAhead}>
        {spot.verification === 'confirmed' && spot.confirmed_on
          ? `Confirmed with the facility ${fmtDate(spot.confirmed_on)}`
          : 'Call ahead to confirm stalls, availability and rates.'}
      </Text>
      <Text style={styles.src}>
        Listing checked {fmtDate(spot.verified_on)} ·{' '}
        <Text style={styles.link} onPress={() => Linking.openURL(spot.source_url)}>{spot.source_name}</Text>
      </Text>

      <View style={styles.actions}>
        {spot.phone ? (
          <Pressable style={styles.action} onPress={() => { onAction('spot_call'); Linking.openURL(`tel:${spot.phone}`); }}>
            <Text style={styles.actionText}>Call {spot.phone}</Text>
          </Pressable>
        ) : null}
        {spot.website ? (
          <Pressable style={styles.action} onPress={() => { onAction('spot_website'); Linking.openURL(spot.website!); }}>
            <Text style={styles.actionText}>Website</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.action} onPress={() => { onAction('spot_directions'); Linking.openURL(mapsUrl(spot.address && /\d/.test(spot.address) ? `${spot.name}, ${spot.address}` : `${spot.name}, ${spot.city}, ${spot.state}`)); }}>
          <Text style={styles.actionText}>Map</Text>
        </Pressable>
        {spot.kind !== 'hotel' ? (
          <Pressable
            style={styles.action}
            onPress={() => {
              onAction('spot_hotels');
              Linking.openURL(`https://www.google.com/maps/search/hotels/@${spot.lat},${spot.lng},13z`);
            }}
          >
            <Text style={styles.actionText}>Hotels nearby</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Layovers() {
  const params = useLocalSearchParams<{ from?: string; to?: string; through?: string }>();
  const states = useStates();
  const spots = useSpots();
  const [from, setFrom] = useState<string | null>(params.from ?? null);
  const [to, setTo] = useState<string | null>(params.to ?? null);
  const [through, setThrough] = useState<string[]>(params.through ? params.through.split(',').filter(Boolean) : []);
  const [rv, setRv] = useState<boolean | null>(null);
  const [open, setOpen] = useState<'from' | 'to' | 'through' | null>(null);
  const [voted, setVoted] = useState(false);
  const viewLogged = useRef(false);
  const lastSearch = useRef('');

  useEffect(() => {
    if (!viewLogged.current) {
      viewLogged.current = true;
      logFeature('layover_finder', 'view');
    }
  }, []);

  const log = (event: string, props: Record<string, unknown> = {}) => logFeature('layover_finder', event, { from, to, through, rv, ...props });
  const stateName = (c: string | null) => (c ? states.data?.find((s) => s.code === c)?.name ?? c : null);
  const ready = !!from && !!to && rv !== null;

  useEffect(() => {
    if (!ready) return;
    const key = `${from}|${to}|${through.join(',')}|${rv}`;
    if (key === lastSearch.current) return;
    lastSearch.current = key;
    logFeature('layover_finder', 'search', { from, to, through, rv });
    setVoted(false);
  }, [ready, from, to, through, rv]);

  const routeStates = useMemo(() => [from, ...through, to].filter((c, i, a): c is string => !!c && a.indexOf(c) === i), [from, to, through]);

  const ordered = useMemo(() => {
    if (!ready || !spots.data) return [] as Spot[];
    const list = spots.data.filter((s) => routeStates.includes(s.state)).filter((s) => (rv ? s.rv_hookups : true));
    const a = CENTER[from!], b = CENTER[to!];
    if (!a || !b || from === to) return list.sort((x, y) => x.name.localeCompare(y.name));
    const k = 0.8; // longitude shrinks with latitude across the western states
    const vx = (b[1] - a[1]) * k, vy = b[0] - a[0];
    const t = (s: Spot) => (s.lng - a[1]) * k * vx + (s.lat - a[0]) * vy;
    return list.sort((x, y) => t(x) - t(y));
  }, [ready, spots.data, routeStates, rv, from, to]);

  // Paid-for featured stops sit in their own block above the route; the rest stay in travel order.
  const featuredStops = useMemo(() => ordered.filter((s) => isFeatured(s.featured_until)), [ordered]);
  const regularStops = useMemo(() => ordered.filter((s) => !isFeatured(s.featured_until)), [ordered]);

  const withoutListings = routeStates.filter((st) => !ordered.some((s) => s.state === st));
  const season = new Date().getMonth();
  const southSeason = season >= 8 || season <= 2; // September to March: southbound is the busy direction

  const pick = (setter: (v: string | null) => void, current: string | null) => (code: string) => {
    setter(current === code ? null : code);
    setOpen(null);
  };
  const toggleThrough = (code: string) => setThrough((t) => (t.includes(code) ? t.filter((x) => x !== code) : [...t, code]));
  const applyQuick = (r: QuickRoute) => {
    setFrom(r.from);
    setTo(r.to);
    setThrough(r.through);
    setOpen(null);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Head>
        <title>Overnight Layover Spots for Horses & RVs | Steer Me</title>
        <meta name="description" content="Find overnight stalls, pens and RV hookups for your horses along your route, with sources and the date each listing was checked." />
      </Head>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>STEER ME · FREE FOR MEMBERS</Text>
        <Text style={styles.h1}>Layover spots for your horses</Text>
        <Text style={styles.sub}>
          Pick where you leave from and where you are going, add the states in between, and see places to stop overnight in the order you will reach them. We are starting with the north-south routes between Montana and Arizona, Nevada and Texas and adding more.
        </Text>

        <Text style={styles.label}>Popular this time of year</Text>
        <View style={styles.row}>
          {QUICK_ROUTES.filter((r) => r.south === southSeason).map((r) => (
            <Pill key={r.key} label={r.label} selected={from === r.from && to === r.to} onPress={() => applyQuick(r)} />
          ))}
        </View>
        <Text style={styles.label}>The other direction</Text>
        <View style={styles.row}>
          {QUICK_ROUTES.filter((r) => r.south !== southSeason).map((r) => (
            <Pill key={r.key} label={r.label} selected={from === r.from && to === r.to} onPress={() => applyQuick(r)} />
          ))}
        </View>

        {states.data ? (
          <>
            <Text style={styles.label}>Leaving from</Text>
            <Pressable style={styles.picker} onPress={() => setOpen(open === 'from' ? null : 'from')}>
              <Text style={styles.pickerText}>{from ? `${stateName(from)} (${from})` : 'Choose a state'}</Text>
            </Pressable>
            {open === 'from' ? <StateGrid states={states.data} selected={from ? [from] : []} onToggle={pick(setFrom, from)} /> : null}

            <Text style={styles.label}>Going to</Text>
            <Pressable style={styles.picker} onPress={() => setOpen(open === 'to' ? null : 'to')}>
              <Text style={styles.pickerText}>{to ? `${stateName(to)} (${to})` : 'Choose a state'}</Text>
            </Pressable>
            {open === 'to' ? <StateGrid states={states.data} selected={to ? [to] : []} onToggle={pick(setTo, to)} /> : null}

            <Text style={styles.label}>States you pass through</Text>
            <Pressable style={styles.picker} onPress={() => setOpen(open === 'through' ? null : 'through')}>
              <Text style={styles.pickerText}>{through.length ? through.join(', ') : 'Add states'}</Text>
            </Pressable>
            {open === 'through' ? <StateGrid states={states.data} selected={through} onToggle={toggleThrough} /> : null}
          </>
        ) : states.error ? (
          <Text style={styles.err}>Could not load. Check your connection and refresh.</Text>
        ) : (
          <Text style={styles.sub}>Loading…</Text>
        )}

        <Text style={styles.label}>Do you want an RV hookup?</Text>
        <View style={styles.row}>
          <Pill label="Yes, I need hookups" selected={rv === true} onPress={() => setRv(true)} />
          <Pill label="No, just the horses" selected={rv === false} onPress={() => setRv(false)} />
        </View>
        <Text style={styles.hintSmall}>
          Yes shows only places that also have RV hookups. No shows every stop, each with a button to see hotels near it.
        </Text>

        {ready ? (
          <View style={styles.results}>
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Please read first</Text>
              <Text style={styles.noticeText}>
                We pulled these together from public listings so you do not have to search for them one by one. Listings can be out of date: stalls fill up for events, prices change, and outbreaks such as EHV can close them to travelers. Call ahead and ask about stalls, hay and bedding, whether they need a Coggins or health certificate, and your arrival time. Distances are straight-line, not driving. Steer Me does not book or guarantee any stop, and a listing on Steer Me is not an endorsement.
              </Text>
            </View>

            {spots.isLoading ? <Text style={styles.sub}>Loading stops…</Text> : null}
            {spots.error ? <Text style={styles.err}>Could not load the stops. Check your connection and refresh.</Text> : null}

            <Text style={styles.h2}>
              {ordered.length ? `${ordered.length} ${ordered.length === 1 ? 'stop' : 'stops'}, in travel order` : 'No stops listed for this route yet'}
            </Text>
            {rv && !ordered.length ? (
              <Text style={styles.detail}>No place with RV hookups is listed in {routeStates.map((c) => stateName(c)).join(', ')} yet. Try "No, just the horses", or tell us about one below.</Text>
            ) : null}

            {featuredStops.length ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.featuredHead}>Featured stops</Text>
                {featuredStops.map((s) => (
                  <View key={s.id} style={{ marginBottom: 6 }}>
                    <SpotCard spot={s} onAction={(e) => log(e, { spot: s.name, featured: true })} />
                  </View>
                ))}
              </View>
            ) : null}

            {regularStops.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? (
                  <Text style={styles.gap}>about {Math.round(miles(regularStops[i - 1], s))} mi straight-line from the stop above</Text>
                ) : null}
                <SpotCard spot={s} onAction={(e) => log(e, { spot: s.name })} />
              </View>
            ))}

            {ordered.length && withoutListings.length ? (
              <Text style={styles.detail}>
                Nothing listed yet in {withoutListings.map((c) => stateName(c)).join(', ')}. If you know a good stop there, tell us below.
              </Text>
            ) : null}

            <View style={styles.official}>
              <Text style={styles.bold}>Check the paperwork for this route</Text>
              <Text style={styles.detail}>See the health papers, Coggins and outbreak rules that may apply for the same states.</Text>
              <Pressable
                style={styles.btn}
                onPress={() => router.push({ pathname: '/travel', params: { from: from!, to: to!, through: through.join(',') } })}
              >
                <Text style={styles.btnText}>Open the paperwork check</Text>
              </Pressable>
            </View>

            <View style={styles.feedback}>
              {voted ? (
                <Text style={styles.detail}>Thanks, that helps.</Text>
              ) : (
                <>
                  <Text style={styles.bold}>Was this helpful?</Text>
                  <View style={styles.row}>
                    <Pill label="Yes" onPress={() => { setVoted(true); log('helpful_yes'); }} />
                    <Pill label="Not really" onPress={() => { setVoted(true); log('helpful_no'); }} />
                  </View>
                </>
              )}
              <Text
                style={styles.link}
                onPress={() => {
                  log('suggest_spot');
                  Linking.openURL(`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent('Layover spots: add or correct a stop')}&body=${encodeURIComponent(`Route: ${from} to ${to} through ${through.join(', ') || 'n/a'}\nName and town of the stop:\nPhone or website:\nWhat to add or correct (stalls, hookups, price, closed?):\n`)}`);
                }}
              >
                Know a stop we are missing, or see something wrong? Tell us.
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>Choose where you are leaving from, where you are going and whether you want an RV hookup to see the list.</Text>
        )}

        <Text style={styles.disclaimer}>
          This is a guide, not a booking service. Listings come from public sources and can be out of date. Always confirm with the facility, and check the health paperwork your destination and any state you stop in requires.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function LayoversScreen() {
  return (
    <MembersGate
      feature="layover_finder"
      path="/layovers"
      title="Layover spots for your horses"
      pitch="Find places to stop overnight with horses on a long haul: stalls and pens, plus RV hookups if you need them, laid out along your route."
      headTitle="Overnight Layover Spots for Horses & RVs | Steer Me"
      headDescription="Find overnight stalls, pens and RV hookups for your horses along your route. Free for Steer Me members."
    >
      <Layovers />
    </MembersGate>
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
  hintSmall: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, lineHeight: 17, marginTop: 8 },
  results: { marginTop: 8 },
  notice: { backgroundColor: colors.espresso, borderRadius: radii.md, padding: 14, marginBottom: 4 },
  noticeTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.brassLight, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  noticeText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, lineHeight: 19 },
  spot: { backgroundColor: colors.tanLight, borderWidth: 1, borderColor: colors.saddle, borderRadius: radii.md, padding: 14, marginBottom: 6 },
  spotHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  spotName: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.espresso },
  featuredBadge: { backgroundColor: colors.espresso },
  spotFeatured: { borderColor: colors.brass, borderWidth: 2 },
  featuredHead: { fontFamily: fonts.bodyBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: colors.brass, marginBottom: 6 },
  badge: { fontFamily: fonts.bodyBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: colors.brass, color: colors.bone },
  where: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.brass, marginTop: 6 },
  detail: { fontFamily: fonts.body, fontSize: 13.5, color: colors.espresso, lineHeight: 19, marginTop: 6 },
  confirmed: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.espresso, marginTop: 10 },
  callAhead: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.saddle, marginTop: 10 },
  address: { fontFamily: fonts.body, fontSize: 13, color: colors.espresso, marginTop: 2 },
  src: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 4, lineHeight: 16 },
  link: { fontFamily: fonts.bodySemiBold, color: colors.saddle, textDecorationLine: 'underline' },
  warn: { fontFamily: fonts.bodyBold, color: colors.oxblood },
  bold: { fontFamily: fonts.bodyBold, color: colors.espresso },
  gap: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 12, color: colors.saddle, textAlign: 'center', marginVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  action: { borderWidth: 1.5, borderColor: colors.saddle, borderRadius: radii.pill, paddingVertical: 7, paddingHorizontal: 12 },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.espresso },
  official: { marginTop: 18, padding: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.saddle, backgroundColor: colors.tanLight },
  feedback: { marginTop: 18, gap: 8 },
  btn: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.brass, borderRadius: radii.md, paddingVertical: 12, paddingHorizontal: 18 },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bone },
  hint: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: colors.saddle, marginTop: 20 },
  err: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.oxblood, marginTop: 12 },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, lineHeight: 17, marginTop: 28 },
});
