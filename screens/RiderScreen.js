import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import LogoMenu from './LogoMenu';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const SURFACE2 = '#181818';
const BORDER = '#1e1e1e';
const MUTED = '#444';
const GREY = '#777';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';

const MOCK_JOBS = [
  { id: 'm1', pay: 78,  km: 5.8, time: 18, from: 'De Waterkant', to: 'Green Point' },
  { id: 'm2', pay: 52,  km: 3.2, time: 11, from: 'Cape Town CBD', to: 'Tamboerskloof' },
  { id: 'm3', pay: 103, km: 8.1, time: 26, from: 'Observatory', to: 'Camps Bay' },
];

function PulseRing({ delay, size }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.5, duration: 2200, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0, duration: 2200, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: false }),
      ]),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', width: size, height: size, borderRadius: size / 2,
      borderWidth: 1.5, borderColor: LIME, transform: [{ scale }], opacity,
    }} />
  );
}

function formatOrder(o) {
  const km = parseFloat((Math.random() * 8 + 2).toFixed(1));
  return { id: o.id, pay: o.price || Math.round(km * 6.5 + 15), km, time: Math.round(km * 3.2), from: o.from_address || 'Pickup', to: o.to_address || 'Drop-off' };
}

export default function RiderScreen({ navigation }) {
  const [online, setOnline] = useState(false);
  const [earnings, setEarnings] = useState(342);
  const [trips, setTrips] = useState(7);
  const [jobs, setJobs] = useState([]);
  const [view, setView] = useState('home');
  const [userId, setUserId] = useState(null);
  const sub = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  useEffect(() => {
    if (!online) { setJobs([]); sub.current?.unsubscribe(); return; }
    fetchOrders();
    sub.current = supabase.channel('pending_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.pending' }, (p) => {
        setJobs(prev => [formatOrder(p.new), ...prev]);
      }).subscribe();
    return () => sub.current?.unsubscribe();
  }, [online]);

  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10);
    setJobs(data?.length ? data.map(formatOrder) : MOCK_JOBS);
  };

  const acceptJob = async (job) => {
    if (!String(job.id).startsWith('m')) {
      await supabase.from('orders').update({ status: 'on_the_way', rider_id: userId }).eq('id', job.id);
    }
    setEarnings(p => p + job.pay);
    setTrips(p => p + 1);
    setJobs(p => p.filter(j => j.id !== job.id));
  };

  const skipJob = (id) => setJobs(p => p.filter(j => j.id !== id));

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const logoMenu = (
    <LogoMenu onSignOut={handleSignOut} onOrders={() => {}} onProfile={() => navigation.navigate('Profile')} onSettings={() => navigation.navigate('Settings')} />
  );

  const weekAmts = [210, 280, 140, 315, 245, earnings, 105];
  const maxAmt = Math.max(...weekAmts);

  if (view === 'home') return (
    <View style={s.container}>
      <StatusBar style="light" />
      {logoMenu}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={s.greeting}>
          <View>
            <Text style={s.greetLabel}>RIDER DASHBOARD</Text>
            <Text style={s.greetTitle}>Ready to{'\n'}earn?</Text>
          </View>
          <View style={s.ratingPill}>
            <Ionicons name="star" size={13} color={AMBER} />
            <Text style={s.ratingTxt}>4.9</Text>
          </View>
        </View>

        <View style={s.statsRow}>
          {[
            { val: trips,       label: 'Trips',    color: '#fff' },
            { val: `R${earnings}`, label: 'Today',    color: LIME  },
            { val: '4.9',       label: 'Rating',   color: GREEN },
          ].map((stat, i) => (
            <View key={i} style={s.statCard}>
              <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[s.onlineCard, online && s.onlineCardActive]} onPress={() => setOnline(!online)} activeOpacity={0.85}>
          <View style={s.onlineInner}>
            {online && <><PulseRing delay={0} size={110} /><PulseRing delay={800} size={110} /></>}
            <View style={[s.onlineCircle, online && s.onlineCircleActive]}>
              <Ionicons name={online ? 'bicycle' : 'bicycle-outline'} size={34} color={online ? BG : LIME} />
            </View>
          </View>
          <Text style={[s.onlineTitle, online && s.onlineTitleActive]}>
            {online ? "You're Online" : 'Go Online'}
          </Text>
          <Text style={s.onlineSub}>
            {online ? 'Taking orders · tap to go offline' : 'Tap to start accepting orders'}
          </Text>
        </TouchableOpacity>

        <View style={s.quickGrid}>
          {[
            { icon: 'wallet-outline',      label: 'Earnings',    color: LIME,   onPress: () => setView('earnings') },
            { icon: 'trending-up-outline', label: 'Performance', color: '#3b82f6', onPress: () => {} },
            { icon: 'time-outline',        label: 'History',     color: AMBER,  onPress: () => {} },
            { icon: 'headset-outline',     label: 'Support',     color: '#a78bfa', onPress: () => {} },
          ].map((t, i) => (
            <TouchableOpacity key={i} style={s.quickTile} onPress={t.onPress} activeOpacity={0.7}>
              <View style={[s.quickIcon, { backgroundColor: t.color + '15' }]}>
                <Ionicons name={t.icon} size={22} color={t.color} />
              </View>
              <Text style={s.quickLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {online && jobs.length > 0 && (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionLabel}>Nearby Orders</Text>
              <TouchableOpacity onPress={() => setView('jobs')}><Text style={s.sectionLink}>See all →</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={s.jobPreview} onPress={() => setView('jobs')} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={s.jobPreviewPay}>R {jobs[0].pay}</Text>
                <Text style={s.jobPreviewRoute}>{jobs[0].from} → {jobs[0].to}</Text>
                <Text style={s.jobPreviewMeta}>{jobs[0].km} km · ~{jobs[0].time} min</Text>
              </View>
              <TouchableOpacity style={s.acceptPill} onPress={() => acceptJob(jobs[0])}>
                <Text style={s.acceptPillTxt}>Accept</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </>
        )}

        {online && jobs.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🏍️</Text>
            <Text style={s.emptyTitle}>Watching for orders…</Text>
            <Text style={s.emptySub}>New jobs will appear here</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  if (view === 'jobs') return (
    <View style={s.container}>
      <StatusBar style="light" />
      {logoMenu}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
          <Ionicons name="arrow-back" size={18} color={GREY} />
          <Text style={s.backTxt}>Back</Text>
        </TouchableOpacity>
        <Text style={s.pageTitle}>Orders <Text style={{ color: LIME }}>Near You</Text></Text>
        {jobs.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🏍️</Text>
            <Text style={s.emptyTitle}>No orders right now</Text>
            <Text style={s.emptySub}>Stay online — orders will appear here</Text>
          </View>
        )}
        {jobs.map(job => (
          <View key={job.id} style={s.jobCard}>
            <View style={s.jobCardTop}>
              <Text style={s.jobPay}>R {job.pay}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.jobKm}>{job.km} km</Text>
                <Text style={s.jobTime}>~{job.time} min</Text>
              </View>
            </View>
            <View style={s.jobRoute}>
              <View style={s.jobStop}>
                <View style={[s.jobDot, { backgroundColor: GREEN }]} />
                <Text style={s.jobAddr}>{job.from}</Text>
              </View>
              <View style={s.jobConnector} />
              <View style={s.jobStop}>
                <View style={[s.jobDot, { backgroundColor: '#ef4444' }]} />
                <Text style={s.jobAddr}>{job.to}</Text>
              </View>
            </View>
            <View style={s.jobActions}>
              <TouchableOpacity style={s.acceptBtn} onPress={() => acceptJob(job)}>
                <Text style={s.acceptBtnTxt}>Accept · R {job.pay}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.skipBtn} onPress={() => skipJob(job.id)}>
                <Text style={s.skipBtnTxt}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  if (view === 'earnings') return (
    <View style={s.container}>
      <StatusBar style="light" />
      {logoMenu}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
          <Ionicons name="arrow-back" size={18} color={GREY} />
          <Text style={s.backTxt}>Back</Text>
        </TouchableOpacity>
        <Text style={s.pageTitle}>Earnings</Text>

        <View style={s.earnHero}>
          <Text style={s.earnLabel}>TODAY</Text>
          <Text style={s.earnAmt}>R {earnings}</Text>
          <Text style={s.earnSub}>{trips} deliveries</Text>
          <View style={s.cashRow}>
            <TouchableOpacity style={s.cashInstant}>
              <Ionicons name="flash" size={15} color={BG} />
              <Text style={s.cashInstantTxt}>Instant Cashout</Text>
              <Text style={s.cashInstantSub}>~5 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cashEod}>
              <Ionicons name="time-outline" size={15} color='#aaa' />
              <Text style={s.cashEodTxt}>End of Day</Text>
              <Text style={s.cashEodSub}>Auto 22:00</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.sectionLabel}>This Week</Text>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => (
          <View key={i} style={s.earnRow}>
            <Text style={s.earnDay}>{day}</Text>
            <View style={s.earnBarBg}>
              <View style={[s.earnBarFill, { width: `${Math.round((weekAmts[i] / maxAmt) * 100)}%` }]} />
            </View>
            <Text style={s.earnDayAmt}>R {weekAmts[i]}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 80 },
  greeting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greetLabel: { fontSize: 10, fontWeight: '700', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 },
  greetTitle: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -0.5, lineHeight: 36 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: SURFACE, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  ratingTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 18, padding: 16, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '900', marginBottom: 3 },
  statLabel: { fontSize: 11, color: GREY, fontWeight: '600' },
  onlineCard: { backgroundColor: SURFACE, borderRadius: 24, padding: 28, alignItems: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: '#1a1a1a' },
  onlineCardActive: { borderColor: LIME, backgroundColor: 'rgba(200,240,0,0.05)' },
  onlineInner: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  onlineCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: SURFACE2, borderWidth: 2, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  onlineCircleActive: { backgroundColor: LIME, borderColor: LIME },
  onlineTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  onlineTitleActive: { color: LIME },
  onlineSub: { fontSize: 12, color: GREY, marginTop: 5, fontWeight: '500' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  quickTile: { width: '47.5%', backgroundColor: SURFACE, borderRadius: 18, padding: 18 },
  quickIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  quickLabel: { fontSize: 14, fontWeight: '800', color: '#aaa' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
  sectionLink: { fontSize: 12, color: LIME, fontWeight: '700' },
  jobPreview: { backgroundColor: SURFACE, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center' },
  jobPreviewPay: { fontSize: 26, fontWeight: '900', color: GREEN, marginBottom: 4 },
  jobPreviewRoute: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 2 },
  jobPreviewMeta: { fontSize: 12, color: GREY },
  acceptPill: { backgroundColor: LIME, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, marginLeft: 14 },
  acceptPillTxt: { fontSize: 14, fontWeight: '900', color: BG },
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 5 },
  emptySub: { fontSize: 13, color: GREY },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },
  pageTitle: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 20 },
  jobCard: { backgroundColor: SURFACE, borderRadius: 20, padding: 18, marginBottom: 10 },
  jobCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  jobPay: { fontSize: 36, fontWeight: '900', color: GREEN },
  jobKm: { fontSize: 18, fontWeight: '800', color: '#fff' },
  jobTime: { fontSize: 12, color: GREY, fontWeight: '500' },
  jobRoute: { backgroundColor: '#0e0e0e', borderRadius: 14, padding: 14, marginBottom: 14, gap: 6 },
  jobStop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  jobConnector: { width: 1, height: 8, backgroundColor: '#2a2a2a', marginLeft: 3 },
  jobAddr: { fontSize: 14, fontWeight: '700', color: '#fff' },
  jobActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, backgroundColor: LIME, borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center' },
  acceptBtnTxt: { fontSize: 15, fontWeight: '900', color: BG },
  skipBtn: { backgroundColor: '#0e0e0e', borderRadius: 14, paddingHorizontal: 18, height: 48, alignItems: 'center', justifyContent: 'center' },
  skipBtnTxt: { fontSize: 14, fontWeight: '700', color: GREY },
  earnHero: { backgroundColor: 'rgba(200,240,0,0.07)', borderWidth: 1, borderColor: 'rgba(200,240,0,0.12)', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 28 },
  earnLabel: { fontSize: 10, fontWeight: '700', color: '#5a8020', letterSpacing: 3, marginBottom: 8 },
  earnAmt: { fontSize: 72, fontWeight: '900', color: LIME, letterSpacing: -2, lineHeight: 76 },
  earnSub: { fontSize: 13, color: '#5a8020', marginBottom: 20, fontWeight: '600' },
  cashRow: { flexDirection: 'row', gap: 10, width: '100%' },
  cashInstant: { flex: 1, backgroundColor: LIME, borderRadius: 14, padding: 14, alignItems: 'center', gap: 3 },
  cashInstantTxt: { fontSize: 13, fontWeight: '900', color: BG },
  cashInstantSub: { fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: '600' },
  cashEod: { flex: 1, backgroundColor: SURFACE2, borderRadius: 14, padding: 14, alignItems: 'center', gap: 3 },
  cashEodTxt: { fontSize: 13, fontWeight: '800', color: '#ccc' },
  cashEodSub: { fontSize: 11, color: GREY, fontWeight: '500' },
  earnRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  earnDay: { fontSize: 12, fontWeight: '700', color: GREY, width: 28 },
  earnBarBg: { flex: 1, height: 5, backgroundColor: SURFACE, borderRadius: 3, overflow: 'hidden' },
  earnBarFill: { height: '100%', backgroundColor: LIME, borderRadius: 3 },
  earnDayAmt: { fontSize: 13, fontWeight: '800', color: '#fff', width: 54, textAlign: 'right' },
});
