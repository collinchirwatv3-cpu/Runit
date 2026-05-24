import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  Animated, TextInput, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
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

const BASE = 15;
const RATE = 6.5;

// ─── Distance calculation ─────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const geocodeCache = {};

async function geocode(query) {
  const key = query.trim().toLowerCase();
  if (geocodeCache[key]) return geocodeCache[key];
  try {
    const q = encodeURIComponent(query + ', Cape Town, South Africa');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'RunIt/1.0 (delivery app)' } }
    );
    const data = await res.json();
    if (data[0]) {
      const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      geocodeCache[key] = result;
      return result;
    }
  } catch (_) {}
  return null;
}

// road-distance correction factor for Cape Town's peninsula geography
const ROAD_FACTOR = 1.35;

async function getDistanceKm(fromAddr, toAddr) {
  const [a, b] = await Promise.all([geocode(fromAddr), geocode(toAddr)]);
  if (a && b) {
    const straight = haversine(a.lat, a.lon, b.lat, b.lon);
    return Math.round(straight * ROAD_FACTOR * 10) / 10;
  }
  return null;
}

function etaMin(km) {
  // ~22 km/h avg in Cape Town traffic
  return Math.max(5, Math.round((km / 22) * 60));
}

// ─── Pulse ring (shared) ──────────────────────────────────────────────────

function PulseRing({ delay, size }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.55, duration: 2200, useNativeDriver: false }),
          Animated.timing(opacity, { toValue: 0, duration: 2200, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: false }),
          Animated.timing(opacity, { toValue: 0.45, duration: 0, useNativeDriver: false }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', width: size, height: size,
      borderRadius: size / 2, borderWidth: 1.5, borderColor: LIME,
      transform: [{ scale }], opacity,
    }} />
  );
}

// ─── Route visual ─────────────────────────────────────────────────────────

function RouteVisual({ from, to, dist, eta }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: false }),
    ]).start();
  }, []);

  const fromShort = from.length > 16 ? from.slice(0, 14) + '…' : from;
  const toShort = to.length > 16 ? to.slice(0, 14) + '…' : to;

  return (
    <Animated.View style={[s.routeCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

      {/* Route bar */}
      <View style={s.routeBar}>
        {/* From pin */}
        <View style={s.routeEndpoint}>
          <View style={[s.routeDot, { backgroundColor: LIME, shadowColor: LIME, shadowRadius: 8, shadowOpacity: 0.6, elevation: 4 }]} />
          <Text style={s.routeEndpointLbl} numberOfLines={1}>{fromShort}</Text>
        </View>

        {/* Line + distance chip */}
        <View style={s.routeTrack}>
          <View style={s.routeTrackLine} />
          <View style={s.distChip}>
            <Text style={s.distChipTxt}>{dist} km</Text>
          </View>
          <View style={s.routeTrackLine} />
        </View>

        {/* To pin */}
        <View style={s.routeEndpoint}>
          <View style={[s.routeDot, { backgroundColor: '#ef4444', shadowColor: '#ef4444', shadowRadius: 8, shadowOpacity: 0.5, elevation: 4 }]} />
          <Text style={s.routeEndpointLbl} numberOfLines={1}>{toShort}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={s.routeStats}>
        <View style={s.routeStat}>
          <Ionicons name="navigate-outline" size={13} color={GREY} />
          <Text style={s.routeStatTxt}>{dist} km</Text>
        </View>
        <View style={s.routeStatSep} />
        <View style={s.routeStat}>
          <Ionicons name="time-outline" size={13} color={GREY} />
          <Text style={s.routeStatTxt}>~{eta} min</Text>
        </View>
        <View style={s.routeStatSep} />
        <View style={s.routeStat}>
          <Ionicons name="speedometer-outline" size={13} color={GREY} />
          <Text style={s.routeStatTxt}>R{RATE}/km</Text>
        </View>
      </View>

    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────

export default function CustomerScreen({ navigation }) {
  const [screen, setScreen] = useState('home');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [packageSize, setPackageSize] = useState('small');
  const [price, setPrice] = useState(null);
  const [dist, setDist] = useState(null);
  const [eta, setEta] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [trackEta, setTrackEta] = useState(12);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [userId, setUserId] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const debounceRef = useRef(null);
  const etaRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const scheduleCalc = (f, t, size = packageSize) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (f.length < 3 || t.length < 3) {
      setDist(null); setPrice(null); setEta(null);
      return;
    }
    setCalculating(true);
    setDist(null); setPrice(null); setEta(null);
    debounceRef.current = setTimeout(async () => {
      const km = await getDistanceKm(f, t);
      if (km !== null) {
        const e = etaMin(km);
        const p = Math.round((BASE + km * RATE) * (size === 'large' ? 1.4 : 1));
        setDist(km);
        setEta(e);
        setPrice(p);
      }
      setCalculating(false);
    }, 600);
  };

  const handleSend = async () => {
    if (!from || !to) { Alert.alert('Missing Info', 'Enter pickup and drop-off'); return; }
    setLoading(true);
    const { error } = await supabase.from('orders').insert([{
      from_address: from, to_address: to, price,
      status: 'pending', user_id: userId, package_size: packageSize,
    }]);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setScreen('tracking');
    let e = 12;
    setTrackEta(e);
    etaRef.current = setInterval(() => {
      e--;
      setTrackEta(Math.max(0, e));
      if (e <= 0) { clearInterval(etaRef.current); showToast('Delivered! 🎉'); }
    }, 3000);
  };

  const cancelOrder = () => {
    clearInterval(etaRef.current);
    setScreen('home');
    setFrom(''); setTo(''); setPrice(null); setDist(null); setEta(null);
    setPackageSize('small');
  };

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const logoMenu = (
    <LogoMenu
      onSignOut={handleSignOut}
      onOrders={() => navigation.navigate('Orders')}
      onProfile={() => navigation.navigate('Profile')}
      onSettings={() => navigation.navigate('Settings')}
    />
  );

  // ── HOME ────────────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        {logoMenu}
        <View style={s.homeContent}>
          <View>
            <Text style={s.homeTitle}>Send a</Text>
            <Text style={s.homeTitleAccent}>Package.</Text>
          </View>
          <View style={s.btnWrap}>
            <PulseRing delay={0} size={240} />
            <PulseRing delay={800} size={240} />
            <TouchableOpacity style={s.sendBtn} activeOpacity={0.85} onPress={() => setScreen('booking')}>
              <Text style={s.sendLabel}>SEND</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Orders')} style={s.ordersLink}>
            <Text style={s.ordersLinkTxt}>My Orders</Text>
            <Ionicons name="chevron-forward" size={14} color={GREY} />
          </TouchableOpacity>
        </View>
        {toastMsg ? <View style={s.toast}><Text style={s.toastTxt}>{toastMsg}</Text></View> : null}
      </View>
    );
  }

  // ── BOOKING ─────────────────────────────────────────────────────────────
  if (screen === 'booking') {
    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <StatusBar style="light" />
        {logoMenu}

        <Text style={s.pageTitle}>Where{'\n'}<Text style={s.pageTitleAccent}>to?</Text></Text>

        {/* Address card */}
        <View style={s.addrCard}>
          <View style={s.addrRow}>
            <View style={[s.addrDot, { backgroundColor: LIME }]} />
            <View style={s.addrCol}>
              <Text style={s.addrLbl}>Collecting from</Text>
              <TextInput
                style={[s.addrInput, focusedField === 'from' && { color: '#fff' }]}
                placeholder="Area or street"
                placeholderTextColor={MUTED}
                value={from}
                onChangeText={v => { setFrom(v); scheduleCalc(v, to); }}
                onFocus={() => setFocusedField('from')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>
          <View style={s.addrSep}><View style={s.addrLine} /></View>
          <View style={s.addrRow}>
            <View style={[s.addrDot, { backgroundColor: '#ef4444' }]} />
            <View style={s.addrCol}>
              <Text style={s.addrLbl}>Delivering to</Text>
              <TextInput
                style={[s.addrInput, focusedField === 'to' && { color: '#fff' }]}
                placeholder="Area or street"
                placeholderTextColor={MUTED}
                value={to}
                onChangeText={v => { setTo(v); scheduleCalc(from, v); }}
                onFocus={() => setFocusedField('to')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>
        </View>

        {/* Route visual */}
        {calculating && (
          <View style={s.calcRow}>
            <ActivityIndicator size="small" color={LIME} />
            <Text style={s.calcTxt}>Calculating route…</Text>
          </View>
        )}
        {!calculating && dist !== null && (
          <RouteVisual from={from} to={to} dist={dist} eta={eta} />
        )}

        {/* Package size */}
        <Text style={s.sectionLabel}>Package Size</Text>
        <View style={s.sizeRow}>
          {[
            { id: 'small', icon: '📦', name: 'Small',  hint: 'Fits in a backpack' },
            { id: 'large', icon: '📫', name: 'Larger', hint: 'Box or bag' },
          ].map(sz => (
            <TouchableOpacity
              key={sz.id}
              style={[s.sizeCard, packageSize === sz.id && s.sizeCardOn]}
              onPress={() => { setPackageSize(sz.id); scheduleCalc(from, to, sz.id); }}
              activeOpacity={0.75}
            >
              <Text style={s.sizeIcon}>{sz.icon}</Text>
              <Text style={[s.sizeName, packageSize === sz.id && { color: '#fff' }]}>{sz.name}</Text>
              <Text style={s.sizeHint}>{sz.hint}</Text>
              {packageSize === sz.id && (
                <View style={s.sizeCheck}><Text style={s.sizeCheckMark}>✓</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Price */}
        {price !== null && (
          <View style={s.priceCard}>
            <View>
              <Text style={s.priceNum}>R {price}</Text>
              <Text style={s.priceMeta}>
                {dist} km · R{RATE}/km{packageSize === 'large' ? ' · large ×1.4' : ''}
              </Text>
            </View>
            <View style={s.bestRate}><Text style={s.bestRateTxt}>Best Rate</Text></View>
          </View>
        )}

        <TouchableOpacity
          style={[s.primaryBtn, (!from || !to || calculating) && s.primaryBtnDim, loading && s.primaryBtnDim]}
          onPress={handleSend}
          disabled={!from || !to || calculating || loading}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnTxt}>{loading ? 'Finding rider…' : '🏍️  Send Now'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setScreen('home')} style={s.backLink}>
          <Text style={s.backLinkTxt}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── TRACKING ─────────────────────────────────────────────────────────────
  if (screen === 'tracking') {
    const delivered = trackEta === 0;
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        {logoMenu}
        <View style={s.trackContent}>
          <Text style={s.trackStatus}>{delivered ? 'Delivered' : 'On the Way'}</Text>
          <View style={s.trackBtnWrap}>
            {!delivered && <PulseRing delay={0} size={240} />}
            {!delivered && <PulseRing delay={800} size={240} />}
            <View style={[s.trackCircle, delivered && s.trackCircleDone]}>
              <Text style={s.trackEta}>{delivered ? '✓' : trackEta}</Text>
              {!delivered && <Text style={s.trackEtaUnit}>min</Text>}
            </View>
          </View>

          {/* Route summary in tracking */}
          {dist && (
            <View style={s.trackRoute}>
              <View style={s.trackRouteRow}>
                <View style={[s.trackDot, { backgroundColor: LIME }]} />
                <Text style={s.trackAddr} numberOfLines={1}>{from}</Text>
              </View>
              <View style={s.trackConnector}>
                <View style={s.trackConnLine} />
                <Text style={s.trackDistLabel}>{dist} km · ~{eta} min</Text>
                <View style={s.trackConnLine} />
              </View>
              <View style={s.trackRouteRow}>
                <View style={[s.trackDot, { backgroundColor: '#ef4444' }]} />
                <Text style={s.trackAddr} numberOfLines={1}>{to}</Text>
              </View>
            </View>
          )}

          <View style={s.driverCard}>
            <View style={s.driverAvatar}>
              <Text style={s.driverAvatarTxt}>SM</Text>
            </View>
            <View style={s.driverInfo}>
              <Text style={s.driverName}>Sipho M.</Text>
              <Text style={s.driverBike}>🏍️ Honda CB · CT 4521</Text>
            </View>
            <View style={s.driverRating}>
              <Ionicons name="star" size={12} color="#f59e0b" />
              <Text style={s.driverRatingTxt}>4.9</Text>
            </View>
          </View>

          <TouchableOpacity onPress={cancelOrder} style={s.cancelBtn}>
            <Text style={s.cancelTxt}>Cancel Order</Text>
          </TouchableOpacity>
        </View>
        {toastMsg ? <View style={s.toast}><Text style={s.toastTxt}>{toastMsg}</Text></View> : null}
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 60 },

  // Home
  homeContent: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingTop: 100, paddingBottom: 48 },
  homeTitle: { fontSize: 64, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 68 },
  homeTitleAccent: { fontSize: 64, fontWeight: '900', color: LIME, letterSpacing: -1, lineHeight: 68 },
  btnWrap: { alignSelf: 'center', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  sendBtn: {
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 70, elevation: 30,
  },
  sendLabel: { fontSize: 40, fontWeight: '900', color: BG, letterSpacing: 5 },
  ordersLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  ordersLinkTxt: { fontSize: 14, color: GREY, fontWeight: '600' },

  // Booking
  pageTitle: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 56, marginBottom: 28 },
  pageTitleAccent: { color: LIME },
  addrCard: { backgroundColor: SURFACE, borderRadius: 22, overflow: 'hidden', marginBottom: 16 },
  addrRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, gap: 16 },
  addrDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  addrCol: { flex: 1 },
  addrLbl: { fontSize: 10, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  addrInput: { fontSize: 17, fontWeight: '700', color: '#888', outlineStyle: 'none' },
  addrSep: { paddingLeft: 44, paddingRight: 20 },
  addrLine: { height: 1, backgroundColor: BORDER },

  // Calculating indicator
  calcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, paddingHorizontal: 4 },
  calcTxt: { fontSize: 13, color: GREY, fontWeight: '600' },

  // Route visual
  routeCard: {
    backgroundColor: SURFACE, borderRadius: 20,
    padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: LIME + '20',
  },
  routeBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  routeEndpoint: { alignItems: 'center', gap: 6, width: 70 },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeEndpointLbl: { fontSize: 11, fontWeight: '700', color: '#aaa', textAlign: 'center' },
  routeTrack: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  routeTrackLine: { flex: 1, height: 1.5, backgroundColor: '#222' },
  distChip: {
    backgroundColor: 'rgba(200,240,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(200,240,0,0.2)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    marginHorizontal: 8,
  },
  distChipTxt: { fontSize: 13, fontWeight: '900', color: LIME },
  routeStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
  routeStat: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center' },
  routeStatTxt: { fontSize: 13, fontWeight: '700', color: GREY },
  routeStatSep: { width: 1, height: 14, backgroundColor: '#222' },

  // Package size
  sectionLabel: { fontSize: 11, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },
  sizeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sizeCard: {
    flex: 1, backgroundColor: SURFACE, borderRadius: 18, padding: 16,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#1a1a1a', position: 'relative',
  },
  sizeCardOn: { borderColor: LIME, backgroundColor: 'rgba(200,240,0,0.06)' },
  sizeIcon: { fontSize: 28, marginBottom: 8 },
  sizeName: { fontSize: 14, fontWeight: '800', color: '#777', marginBottom: 3 },
  sizeHint: { fontSize: 11, color: MUTED, textAlign: 'center' },
  sizeCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9, backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  sizeCheckMark: { fontSize: 10, fontWeight: '900', color: BG },

  // Price
  priceCard: {
    backgroundColor: 'rgba(200,240,0,0.07)',
    borderWidth: 1, borderColor: 'rgba(200,240,0,0.15)',
    borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
  },
  priceNum: { fontSize: 48, fontWeight: '900', color: LIME, letterSpacing: -1 },
  priceMeta: { fontSize: 12, color: '#5a7a1a', marginTop: 2, fontWeight: '600' },
  bestRate: { backgroundColor: LIME, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  bestRateTxt: { fontSize: 12, fontWeight: '900', color: BG },

  primaryBtn: {
    backgroundColor: LIME, borderRadius: 16, height: 58,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: LIME, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
  },
  primaryBtnDim: { opacity: 0.35, shadowOpacity: 0 },
  primaryBtnTxt: { fontSize: 17, fontWeight: '900', color: BG },
  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkTxt: { fontSize: 14, color: GREY, fontWeight: '600' },

  // Tracking
  trackContent: { flex: 1, paddingHorizontal: 24, paddingTop: 100, paddingBottom: 40, alignItems: 'center', justifyContent: 'space-between' },
  trackStatus: { fontSize: 15, fontWeight: '700', color: GREY, letterSpacing: 2, textTransform: 'uppercase', alignSelf: 'flex-start' },
  trackBtnWrap: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  trackCircle: {
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 70, elevation: 30,
  },
  trackCircleDone: { shadowOpacity: 0.3 },
  trackEta: { fontSize: 72, fontWeight: '900', color: BG, letterSpacing: -2 },
  trackEtaUnit: { fontSize: 14, fontWeight: '800', color: 'rgba(0,0,0,0.4)', marginTop: -8, letterSpacing: 1 },

  // Tracking route summary
  trackRoute: { width: '100%', backgroundColor: SURFACE, borderRadius: 18, padding: 16 },
  trackRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackDot: { width: 8, height: 8, borderRadius: 4 },
  trackAddr: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  trackConnector: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 3.5, paddingVertical: 6 },
  trackConnLine: { flex: 1, height: 1, backgroundColor: '#222' },
  trackDistLabel: { fontSize: 11, fontWeight: '700', color: GREY },

  driverCard: {
    width: '100%', backgroundColor: SURFACE, borderRadius: 22, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  driverAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
  },
  driverAvatarTxt: { fontSize: 16, fontWeight: '900', color: BG },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 3 },
  driverBike: { fontSize: 12, color: GREY },
  driverRating: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: SURFACE2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
  },
  driverRatingTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  cancelBtn: { paddingVertical: 12 },
  cancelTxt: { fontSize: 14, color: MUTED, fontWeight: '600' },

  // Toast
  toast: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 24,
    paddingHorizontal: 22, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
