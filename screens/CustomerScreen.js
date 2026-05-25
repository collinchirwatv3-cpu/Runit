import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  Animated, TextInput, ScrollView, Alert, ActivityIndicator, Platform, Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import WebView from 'react-native-webview';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import TopBar from './TopBar';
import BottomBar from './BottomBar';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const SURFACE2 = '#181818';
const BORDER = '#1e1e1e';
const MUTED = '#444';
const GREY = '#777';
const BASE = 15;
const RATE = 6.5;

// ─── Geocoding ────────────────────────────────────────────────────────────

async function fetchSuggestions(query) {
  if (query.length < 2) return [];
  try {
    const q = encodeURIComponent(query + ', Cape Town, South Africa');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5`,
      { headers: { 'User-Agent': 'RunIt/1.0' } }
    );
    const data = await res.json();
    return data.map(item => ({
      label: item.display_name.split(', ').slice(0, 4).join(', '),
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }));
  } catch (_) { return []; }
}

const geocodeCache = {};
async function geocode(query) {
  const key = query.trim().toLowerCase();
  if (geocodeCache[key]) return geocodeCache[key];
  try {
    const q = encodeURIComponent(query + ', Cape Town, South Africa');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'RunIt/1.0' } }
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

// ─── OSRM routing ────────────────────────────────────────────────────────

async function getRoute(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]) {
      const route = data.routes[0];
      return {
        coords: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
        distKm: Math.round(route.distance / 100) / 10,
        durationMin: Math.round(route.duration / 60),
      };
    }
  } catch (_) {}
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const straight = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return {
    coords: [[a.lat, a.lon], [b.lat, b.lon]],
    distKm: Math.round(straight * 1.35 * 10) / 10,
    durationMin: Math.round((straight * 1.35 / 22) * 60),
  };
}

// ─── Map HTML builder ─────────────────────────────────────────────────────

function buildMapHtml(fromCoords, toCoords, routeCoords, fromLabel, toLabel) {
  const routeJson = JSON.stringify(routeCoords);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#080808}#map{width:100%;height:100%}.leaflet-control-attribution,.leaflet-control-zoom{display:none}.tip{background:rgba(8,8,8,0.92);border:1px solid #1e1e1e;color:#fff;font-size:11px;font-weight:700;font-family:-apple-system,sans-serif;padding:4px 10px;border-radius:20px;white-space:nowrap;box-shadow:none}.tip::before{display:none}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:18}).addTo(map);
var routeCoords=${routeJson};
var A=[${fromCoords.lat},${fromCoords.lon}];
var B=[${toCoords.lat},${toCoords.lon}];
L.polyline(routeCoords,{color:'#c8f000',weight:3,opacity:0.85}).addTo(map);
L.polyline(routeCoords,{color:'#c8f000',weight:8,opacity:0.12}).addTo(map);
var iconA=L.divIcon({html:'<div style="width:16px;height:16px;border-radius:50%;background:#c8f000;border:3px solid #080808;box-shadow:0 0 14px 3px rgba(200,240,0,0.7)"></div>',iconSize:[16,16],iconAnchor:[8,8],className:''});
var iconB=L.divIcon({html:'<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:3px solid #080808;box-shadow:0 0 14px 3px rgba(239,68,68,0.6)"></div>',iconSize:[16,16],iconAnchor:[8,8],className:''});
var iconR=L.divIcon({html:'<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.95)) drop-shadow(0 0 14px rgba(200,240,0,0.55))">🏍️</div>',iconSize:[36,28],iconAnchor:[18,14],className:''});
L.marker(A,{icon:iconA}).bindTooltip('${fromLabel.replace(/'/g,"\\'")}',{permanent:true,direction:'top',className:'tip',offset:[0,-10]}).addTo(map);
L.marker(B,{icon:iconB}).bindTooltip('${toLabel.replace(/'/g,"\\'")}',{permanent:true,direction:'bottom',className:'tip',offset:[0,10]}).addTo(map);
map.fitBounds(L.latLngBounds([A,B]).pad(0.35));
var riderMarker=null;
window.updateRider=function(lat,lon){if(riderMarker){riderMarker.setLatLng([lat,lon]);}else{riderMarker=L.marker([lat,lon],{icon:iconR}).bindTooltip('Rider',{permanent:true,direction:'top',className:'tip',offset:[0,-12]}).addTo(map);}};
window.addEventListener('message',function(e){if(e.data&&e.data.type==='updateRider'){window.updateRider(e.data.lat,e.data.lon);}});
</script></body></html>`;
}

// ─── Route map — web + native ─────────────────────────────────────────────

function RouteMap({ fromCoords, toCoords, routeCoords, fromLabel, toLabel, riderLocation }) {
  const webViewRef = useRef(null);
  const iframeRef = useRef(null);

  // Push rider location updates into the map without re-mounting
  useEffect(() => {
    if (!riderLocation) return;
    const { lat, lon } = riderLocation;
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage({ type: 'updateRider', lat, lon }, '*');
    } else {
      webViewRef.current?.injectJavaScript(`window.updateRider&&window.updateRider(${lat},${lon});true;`);
    }
  }, [riderLocation]);

  if (!fromCoords || !toCoords || !routeCoords) return null;
  const html = buildMapHtml(fromCoords, toCoords, routeCoords, fromLabel, toLabel);

  if (Platform.OS === 'web') {
    return (
      <View style={s.mapCard}>
        <iframe ref={iframeRef} srcDoc={html} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} sandbox="allow-scripts" />
      </View>
    );
  }
  return (
    <View style={s.mapCard}>
      <WebView ref={webViewRef} source={{ html }} style={{ flex: 1, backgroundColor: BG }} scrollEnabled={false} originWhitelist={['*']} />
    </View>
  );
}

// ─── Route visual strip ───────────────────────────────────────────────────

function RouteVisual({ from, to, dist, eta }) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: false }),
      Animated.timing(slide, { toValue: 0, duration: 320, useNativeDriver: false }),
    ]).start();
  }, []);
  const short = (str) => str.length > 16 ? str.slice(0, 14) + '…' : str;
  return (
    <Animated.View style={[s.routeCard, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <View style={s.routeBar}>
        <View style={s.routeEndpoint}>
          <View style={[s.routeDotPin, { backgroundColor: LIME, shadowColor: LIME }]} />
          <Text style={s.routePinLbl} numberOfLines={1}>{short(from)}</Text>
        </View>
        <View style={s.routeTrack}>
          <View style={s.routeTrackLine} />
          <View style={s.distChip}><Text style={s.distChipTxt}>{dist} km</Text></View>
          <View style={s.routeTrackLine} />
        </View>
        <View style={s.routeEndpoint}>
          <View style={[s.routeDotPin, { backgroundColor: '#ef4444', shadowColor: '#ef4444' }]} />
          <Text style={s.routePinLbl} numberOfLines={1}>{short(to)}</Text>
        </View>
      </View>
      <View style={s.routeStats}>
        <View style={s.routeStat}><Ionicons name="navigate-outline" size={13} color={GREY} /><Text style={s.routeStatTxt}>{dist} km</Text></View>
        <View style={s.routeStatSep} />
        <View style={s.routeStat}><Ionicons name="time-outline" size={13} color={GREY} /><Text style={s.routeStatTxt}>~{eta} min</Text></View>
        <View style={s.routeStatSep} />
        <View style={s.routeStat}><Ionicons name="speedometer-outline" size={13} color={GREY} /><Text style={s.routeStatTxt}>R{RATE}/km</Text></View>
      </View>
    </Animated.View>
  );
}

// ─── Pulse ring ───────────────────────────────────────────────────────────

function PulseRing({ delay, size }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.55, duration: 2200, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0, duration: 2200, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.45, duration: 0, useNativeDriver: false }),
      ]),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: LIME, transform: [{ scale }], opacity }} />
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────

export default function CustomerScreen({ navigation }) {
  const [screen, setScreen] = useState('home');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [packageSize, setPackageSize] = useState('small');
  const [notes, setNotes] = useState('');
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [price, setPrice] = useState(null);
  const [dist, setDist] = useState(null);
  const [eta, setEta] = useState(null);
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [orderStatus, setOrderStatus] = useState('pending');
  const [deliveryPin, setDeliveryPin] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [userId, setUserId] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const [fromConfirmed, setFromConfirmed] = useState(false);
  const [toConfirmed, setToConfirmed] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionField, setSuggestionField] = useState(null);
  const debounceRef = useRef(null);
  const suggestDebounceRef = useRef(null);
  const orderSubRef = useRef(null);
  const riderLocSubRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
      orderSubRef.current?.unsubscribe();
      riderLocSubRef.current?.unsubscribe();
    };
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const scheduleCalc = (f, t, size = packageSize) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (f.length < 3 || t.length < 3) {
      setDist(null); setPrice(null); setEta(null);
      setFromCoords(null); setToCoords(null); setRouteCoords(null);
      return;
    }
    setCalculating(true);
    setDist(null); setPrice(null); setEta(null);
    setFromCoords(null); setToCoords(null); setRouteCoords(null);
    debounceRef.current = setTimeout(async () => {
      const [a, b] = await Promise.all([geocode(f), geocode(t)]);
      if (a && b) {
        const route = await getRoute(a, b);
        const p = Math.round((BASE + route.distKm * RATE) * (size === 'large' ? 1.4 : 1));
        setFromCoords(a); setToCoords(b); setRouteCoords(route.coords);
        setDist(route.distKm); setEta(route.durationMin); setPrice(p);
      }
      setCalculating(false);
    }, 700);
  };

  // Direct route calc when coords are already known (from a suggestion tap)
  const calcRouteWithCoords = async (a, b, size) => {
    setCalculating(true);
    setDist(null); setPrice(null); setEta(null); setRouteCoords(null);
    const route = await getRoute(a, b);
    const p = Math.round((BASE + route.distKm * RATE) * (size === 'large' ? 1.4 : 1));
    setFromCoords(a); setToCoords(b); setRouteCoords(route.coords);
    setDist(route.distKm); setEta(route.durationMin); setPrice(p);
    setCalculating(false);
  };

  const scheduleSuggestions = (query, field) => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (query.length < 2) { setSuggestions([]); setSuggestionField(null); return; }
    suggestDebounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(query);
      setSuggestions(results);
      setSuggestionField(results.length ? field : null);
    }, 350);
  };

  const selectSuggestion = async (sug, field) => {
    setSuggestions([]);
    setSuggestionField(null);
    if (field === 'from') {
      setFrom(sug.label);
      setFromConfirmed(true);
      const a = { lat: sug.lat, lon: sug.lon };
      setFromCoords(a);
      if (toCoords) await calcRouteWithCoords(a, toCoords, packageSize);
    } else {
      setTo(sug.label);
      setToConfirmed(true);
      const b = { lat: sug.lat, lon: sug.lon };
      setToCoords(b);
      if (fromCoords) await calcRouteWithCoords(fromCoords, b, packageSize);
    }
  };

  const handleSend = async () => {
    if (!from || !to) { Alert.alert('Missing Info', 'Enter pickup and drop-off'); return; }
    setLoading(true);

    const pin = Math.floor(100 + Math.random() * 900).toString();
    const tipAmt = customTip ? parseInt(customTip, 10) || 0 : tip;

    const { data: insertData, error } = await supabase
      .from('orders')
      .insert([{
        from_address: from, to_address: to,
        price: (price || 0) + tipAmt,
        status: 'pending', user_id: userId,
        package_size: packageSize,
        dist_km: dist,
        delivery_pin: pin,
        notes: notes.trim() || null,
        tip: tipAmt,
      }])
      .select('id')
      .single();

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }

    const orderId = insertData?.id;
    setActiveOrderId(orderId);
    setDeliveryPin(pin);
    setOrderStatus('pending');

    // Subscribe to order status changes
    if (orderId) {
      orderSubRef.current?.unsubscribe();
      const channel = supabase.channel(`order_${orderId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'orders',
          filter: `id=eq.${orderId}`,
        }, (payload) => {
          const newStatus = payload.new.status;
          setOrderStatus(newStatus);
          if (newStatus === 'on_the_way') {
            showToast('🏍️  Rider is on the way!');
            subscribeRiderLocation(orderId);
          }
          if (newStatus === 'delivered') showToast('Delivered! 🎉');
        })
        .subscribe();
      orderSubRef.current = channel;
    }

    setScreen('tracking');
  };

  const subscribeRiderLocation = (orderId) => {
    riderLocSubRef.current?.unsubscribe();
    const ch = supabase.channel(`rider_loc_${orderId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rider_locations',
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        const { lat, lon } = payload.new;
        setRiderLocation({ lat, lon });
      })
      .subscribe();
    riderLocSubRef.current = ch;
  };

  const cancelOrder = async () => {
    orderSubRef.current?.unsubscribe(); orderSubRef.current = null;
    riderLocSubRef.current?.unsubscribe(); riderLocSubRef.current = null;
    if (activeOrderId && orderStatus === 'pending') {
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', activeOrderId);
    }
    resetBooking();
    setScreen('home');
  };

  const newOrder = () => {
    orderSubRef.current?.unsubscribe(); orderSubRef.current = null;
    riderLocSubRef.current?.unsubscribe(); riderLocSubRef.current = null;
    resetBooking();
    setScreen('home');
  };

  const resetBooking = () => {
    setFrom(''); setTo(''); setPrice(null); setDist(null); setEta(null);
    setFromCoords(null); setToCoords(null); setRouteCoords(null);
    setFromConfirmed(false); setToConfirmed(false);
    setPackageSize('small'); setNotes(''); setTip(0); setCustomTip('');
    setActiveOrderId(null); setOrderStatus('pending');
    setDeliveryPin(null); setRiderLocation(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const handleBottomBar = (tabId) => {
    if (tabId === 'home') return;
    if (tabId === 'orders') navigation.navigate('Orders');
    if (tabId === 'profile') navigation.navigate('Profile');
    if (tabId === 'settings') navigation.navigate('Settings');
  };

  // ── HOME ──────────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar />
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
          <View style={{ height: 20 }} />
        </View>
        <BottomBar active="home" role="customer" onPress={handleBottomBar} />
        {toastMsg ? <View style={s.toast}><Text style={s.toastTxt}>{toastMsg}</Text></View> : null}
      </View>
    );
  }

  // ── BOOKING ───────────────────────────────────────────────────────────
  if (screen === 'booking') {
    const routeReady = !calculating && dist !== null && routeCoords !== null;
    const tipAmt = customTip ? parseInt(customTip, 10) || 0 : tip;
    const totalPrice = price !== null ? price + tipAmt : null;

    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar />
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          <TouchableOpacity onPress={() => setScreen('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>

          <Text style={s.pageTitle}>Where{'\n'}<Text style={s.pageTitleAccent}>to?</Text></Text>

          {/* Addresses */}
          <View style={s.addrCard}>
            <View style={s.addrRow}>
              <View style={[s.addrDot, { backgroundColor: LIME }]} />
              <View style={s.addrCol}>
                <View style={s.addrLblRow}>
                  <Text style={s.addrLbl}>Collecting from</Text>
                  {fromConfirmed && (
                    <View style={s.confirmedBadge}>
                      <Ionicons name="checkmark" size={10} color={LIME} />
                      <Text style={s.confirmedTxt}>confirmed</Text>
                    </View>
                  )}
                </View>
                <TextInput
                  style={[s.addrInput, focusedField === 'from' && { color: '#fff' }]}
                  placeholder="Area or street"
                  placeholderTextColor={MUTED}
                  value={from}
                  onChangeText={v => { setFrom(v); setFromCoords(null); setFromConfirmed(false); scheduleCalc(v, to); scheduleSuggestions(v, 'from'); }}
                  onFocus={() => setFocusedField('from')}
                  onBlur={() => { setFocusedField(null); setTimeout(() => setSuggestions([]), 200); }}
                />
              </View>
            </View>
            <View style={s.addrSep}><View style={s.addrLine} /></View>
            <View style={s.addrRow}>
              <View style={[s.addrDot, { backgroundColor: '#ef4444' }]} />
              <View style={s.addrCol}>
                <View style={s.addrLblRow}>
                  <Text style={s.addrLbl}>Delivering to</Text>
                  {toConfirmed && (
                    <View style={s.confirmedBadge}>
                      <Ionicons name="checkmark" size={10} color={LIME} />
                      <Text style={s.confirmedTxt}>confirmed</Text>
                    </View>
                  )}
                </View>
                <TextInput
                  style={[s.addrInput, focusedField === 'to' && { color: '#fff' }]}
                  placeholder="Area or street"
                  placeholderTextColor={MUTED}
                  value={to}
                  onChangeText={v => { setTo(v); setToCoords(null); setToConfirmed(false); scheduleCalc(from, v); scheduleSuggestions(v, 'to'); }}
                  onFocus={() => setFocusedField('to')}
                  onBlur={() => { setFocusedField(null); setTimeout(() => setSuggestions([]), 200); }}
                />
              </View>
            </View>
          </View>

          {/* Address autocomplete suggestions */}
          {suggestions.length > 0 && suggestionField && (
            <View style={s.suggestCard}>
              {suggestions.map((sug, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.suggestRow, i < suggestions.length - 1 && s.suggestDivider]}
                  onPress={() => selectSuggestion(sug, suggestionField)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-outline" size={15} color={LIME} style={{ flexShrink: 0 }} />
                  <Text style={s.suggestTxt} numberOfLines={2}>{sug.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={MUTED} style={{ flexShrink: 0 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {calculating && (
            <View style={s.calcRow}>
              <ActivityIndicator size="small" color={LIME} />
              <Text style={s.calcTxt}>Calculating route…</Text>
            </View>
          )}

          {routeReady && (
            <>
              <RouteVisual from={from} to={to} dist={dist} eta={eta} />
              <RouteMap fromCoords={fromCoords} toCoords={toCoords} routeCoords={routeCoords} fromLabel={from} toLabel={to} />
            </>
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
                {packageSize === sz.id && <View style={s.sizeCheck}><Text style={s.sizeCheckMark}>✓</Text></View>}
              </TouchableOpacity>
            ))}
          </View>

          {/* Delivery Notes */}
          <Text style={s.sectionLabel}>
            Notes for rider <Text style={{ color: MUTED, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>(optional)</Text>
          </Text>
          <View style={s.notesWrap}>
            <TextInput
              style={s.notesInput}
              placeholder={'e.g. Press intercom on arrival\nLeave at door if no answer\nCall me when you get here'}
              placeholderTextColor={MUTED}
              multiline
              numberOfLines={3}
              maxLength={160}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocusedField('notes')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={s.charCount}>{notes.length}/160</Text>
          </View>

          {/* Tip + Price — only shown when price is calculated */}
          {price !== null && (
            <>
              <View style={s.priceCard}>
                <View>
                  <Text style={s.priceNum}>R {totalPrice}</Text>
                  <Text style={s.priceMeta}>
                    R{price} delivery{tipAmt > 0 ? ` + R${tipAmt} tip` : ''}
                    {packageSize === 'large' ? ' · large ×1.4' : ''}
                  </Text>
                </View>
                <View style={s.bestRate}><Text style={s.bestRateTxt}>Best Rate</Text></View>
              </View>

              <Text style={s.sectionLabel}>Tip your rider <Text style={{ color: MUTED, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>(optional)</Text></Text>
              <View style={s.tipRow}>
                {[0, 5, 10, 20].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={[s.tipBtn, tip === amt && !customTip && s.tipBtnActive]}
                    onPress={() => { setTip(amt); setCustomTip(''); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.tipBtnTxt, tip === amt && !customTip && s.tipBtnTxtActive]}>
                      {amt === 0 ? 'None' : `R${amt}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.customTipWrap}>
                <Ionicons name="create-outline" size={15} color={GREY} style={{ marginTop: 2 }} />
                <TextInput
                  style={s.customTipInput}
                  placeholder="Custom amount"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                  value={customTip}
                  onChangeText={v => { setCustomTip(v.replace(/\D/g, '')); setTip(-1); }}
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, (!from || !to || calculating) && s.primaryBtnDim, loading && s.primaryBtnDim]}
            onPress={handleSend}
            disabled={!from || !to || calculating || loading}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnTxt}>{loading ? 'Booking rider…' : '🏍️  Send Now'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── TRACKING ──────────────────────────────────────────────────────────
  if (screen === 'tracking') {
    const finding   = orderStatus === 'pending';
    const onTheWay  = orderStatus === 'on_the_way';
    const delivered = orderStatus === 'delivered';
    const statusLabel = finding ? 'Finding Rider' : onTheWay ? 'On the Way' : 'Delivered';

    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar />
        <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { alignItems: 'center' }]} showsVerticalScrollIndicator={false}>

          <Text style={[s.trackStatus, { alignSelf: 'flex-start' }]}>{statusLabel}</Text>

          {/* Big circle */}
          <View style={s.trackBtnWrap}>
            {!delivered && <PulseRing delay={0} size={200} />}
            {!delivered && <PulseRing delay={800} size={200} />}
            <View style={[s.trackCircle, delivered && s.trackCircleDone]}>
              {delivered ? (
                <Text style={s.trackEta}>✓</Text>
              ) : onTheWay && eta ? (
                <><Text style={s.trackEta}>{eta}</Text><Text style={s.trackEtaUnit}>est. min</Text></>
              ) : (
                <ActivityIndicator color={BG} size="large" />
              )}
            </View>
          </View>

          {/* 3-digit PIN — shown until delivered */}
          {!delivered && deliveryPin && (
            <View style={s.pinCard}>
              <Text style={s.pinCardLabel}>RECIPIENT PIN</Text>
              <Text style={s.pinCardHint}>
                Share this with the person <Text style={{ color: '#fff', fontWeight: '800' }}>receiving</Text> the package.{'\n'}
                The rider will ask them to enter it on delivery.
              </Text>
              <View style={s.pinBoxRow}>
                {deliveryPin.split('').map((digit, i) => (
                  <View key={i} style={s.pinBox}>
                    <Text style={s.pinDigit}>{digit}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={s.sharePinBtn}
                activeOpacity={0.8}
                onPress={() => Share.share({
                  message: `Your RunIt delivery PIN is: ${deliveryPin}\n\nWhen the rider arrives, they'll ask you to enter this on their phone to confirm receipt.`,
                  title: 'RunIt Delivery PIN',
                })}
              >
                <Ionicons name="share-social-outline" size={16} color={BG} />
                <Text style={s.sharePinTxt}>Share PIN with Recipient</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Route summary */}
          {dist && (
            <View style={[s.trackRoute, { width: '100%' }]}>
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

          {/* Live map — shown when rider is en route */}
          {onTheWay && fromCoords && toCoords && routeCoords && (
            <RouteMap
              fromCoords={fromCoords} toCoords={toCoords}
              routeCoords={routeCoords} fromLabel={from} toLabel={to}
              riderLocation={riderLocation}
            />
          )}

          {/* Status card */}
          {finding && (
            <View style={[s.driverCard, { width: '100%' }]}>
              <View style={[s.driverAvatar, { backgroundColor: SURFACE2 }]}>
                <ActivityIndicator color={LIME} size="small" />
              </View>
              <View style={s.driverInfo}>
                <Text style={s.driverName}>Matching your order…</Text>
                <Text style={s.driverBike}>A nearby rider will accept shortly</Text>
              </View>
            </View>
          )}
          {onTheWay && (
            <View style={[s.driverCard, { width: '100%' }]}>
              <View style={s.driverAvatar}><Text style={s.driverAvatarTxt}>🏍</Text></View>
              <View style={s.driverInfo}>
                <Text style={s.driverName}>Rider En Route</Text>
                <Text style={s.driverBike}>Blue dot on map = your rider</Text>
              </View>
              <View style={s.driverRating}>
                <Ionicons name="star" size={12} color="#f59e0b" />
                <Text style={s.driverRatingTxt}>4.9</Text>
              </View>
            </View>
          )}
          {delivered && (
            <View style={[s.driverCard, { width: '100%', borderColor: LIME + '30', borderWidth: 1 }]}>
              <View style={[s.driverAvatar, { backgroundColor: LIME + '20' }]}>
                <Ionicons name="checkmark-circle" size={24} color={LIME} />
              </View>
              <View style={s.driverInfo}>
                <Text style={s.driverName}>Delivery Complete</Text>
                <Text style={s.driverBike}>Your package was delivered</Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={{ width: '100%', paddingBottom: 20 }}>
            {!delivered && finding && (
              <TouchableOpacity onPress={cancelOrder} style={s.cancelBtn}>
                <Text style={s.cancelTxt}>Cancel Order</Text>
              </TouchableOpacity>
            )}
            {delivered && (
              <TouchableOpacity onPress={newOrder} style={[s.primaryBtn, { marginTop: 8 }]}>
                <Text style={s.primaryBtnTxt}>Place New Order</Text>
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
        {toastMsg ? <View style={s.toast}><Text style={s.toastTxt}>{toastMsg}</Text></View> : null}
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingHorizontal: 24, paddingTop: 90, paddingBottom: 40 },

  homeContent: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingTop: 96, paddingBottom: 90 },
  homeTitle: { fontSize: 64, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 68 },
  homeTitleAccent: { fontSize: 64, fontWeight: '900', color: LIME, letterSpacing: -1, lineHeight: 68 },
  btnWrap: { alignSelf: 'center', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  sendBtn: {
    width: 240, height: 240, borderRadius: 120, backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 70, elevation: 30,
  },
  sendLabel: { fontSize: 40, fontWeight: '900', color: BG, letterSpacing: 5 },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },
  pageTitle: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 56, marginBottom: 28 },
  pageTitleAccent: { color: LIME },

  addrCard: { backgroundColor: SURFACE, borderRadius: 22, overflow: 'hidden', marginBottom: 16 },
  addrRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, gap: 16 },
  addrDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  addrCol: { flex: 1 },
  addrLblRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  addrLbl: { fontSize: 10, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: LIME + '15', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  confirmedTxt: { fontSize: 9, fontWeight: '700', color: LIME, letterSpacing: 0.5 },
  addrInput: { fontSize: 17, fontWeight: '700', color: '#888', outlineStyle: 'none' },
  addrSep: { paddingLeft: 44, paddingRight: 20 },
  addrLine: { height: 1, backgroundColor: BORDER },

  calcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  calcTxt: { fontSize: 13, color: GREY, fontWeight: '600' },

  suggestCard: {
    backgroundColor: '#141414', borderRadius: 18, marginBottom: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1e1e1e',
  },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  suggestDivider: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  suggestTxt: { fontSize: 14, color: '#ccc', fontWeight: '600', flex: 1, lineHeight: 20 },

  routeCard: { backgroundColor: SURFACE, borderRadius: 20, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: LIME + '20' },
  routeBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  routeEndpoint: { alignItems: 'center', gap: 6, width: 72 },
  routeDotPin: { width: 12, height: 12, borderRadius: 6, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 6, elevation: 4 },
  routePinLbl: { fontSize: 11, fontWeight: '700', color: '#aaa', textAlign: 'center' },
  routeTrack: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  routeTrackLine: { flex: 1, height: 1.5, backgroundColor: '#222' },
  distChip: { backgroundColor: 'rgba(200,240,0,0.12)', borderWidth: 1, borderColor: 'rgba(200,240,0,0.22)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 8 },
  distChipTxt: { fontSize: 13, fontWeight: '900', color: LIME },
  routeStats: { flexDirection: 'row', alignItems: 'center' },
  routeStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  routeStatTxt: { fontSize: 13, fontWeight: '700', color: GREY },
  routeStatSep: { width: 1, height: 14, backgroundColor: '#222' },

  mapCard: { height: 220, borderRadius: 20, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: '#1a1a1a' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },

  sizeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  sizeCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 18, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#1a1a1a', position: 'relative' },
  sizeCardOn: { borderColor: LIME, backgroundColor: 'rgba(200,240,0,0.06)' },
  sizeIcon: { fontSize: 28, marginBottom: 8 },
  sizeName: { fontSize: 14, fontWeight: '800', color: '#777', marginBottom: 3 },
  sizeHint: { fontSize: 11, color: MUTED, textAlign: 'center' },
  sizeCheck: { position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  sizeCheckMark: { fontSize: 10, fontWeight: '900', color: BG },

  notesWrap: { backgroundColor: SURFACE, borderRadius: 18, padding: 14, marginBottom: 24 },
  notesInput: { color: '#fff', fontSize: 14, fontWeight: '500', lineHeight: 22, minHeight: 72, outlineStyle: 'none' },
  charCount: { fontSize: 10, color: MUTED, textAlign: 'right', marginTop: 6, fontWeight: '600' },

  priceCard: {
    backgroundColor: 'rgba(200,240,0,0.07)', borderWidth: 1, borderColor: 'rgba(200,240,0,0.15)',
    borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
  },
  priceNum: { fontSize: 48, fontWeight: '900', color: LIME, letterSpacing: -1 },
  priceMeta: { fontSize: 12, color: '#5a7a1a', marginTop: 2, fontWeight: '600' },
  bestRate: { backgroundColor: LIME, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  bestRateTxt: { fontSize: 12, fontWeight: '900', color: BG },

  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tipBtn: { flex: 1, backgroundColor: SURFACE, borderRadius: 14, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1a1a1a' },
  tipBtnActive: { borderColor: LIME, backgroundColor: 'rgba(200,240,0,0.08)' },
  tipBtnTxt: { fontSize: 14, fontWeight: '800', color: GREY },
  tipBtnTxtActive: { color: LIME },
  customTipWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: SURFACE, borderRadius: 14, paddingHorizontal: 14, height: 44, marginBottom: 24 },
  customTipInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700', outlineStyle: 'none' },

  primaryBtn: {
    backgroundColor: LIME, borderRadius: 16, height: 58,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: LIME, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
  },
  primaryBtnDim: { opacity: 0.35, shadowOpacity: 0 },
  primaryBtnTxt: { fontSize: 17, fontWeight: '900', color: BG },

  // Tracking
  trackStatus: { fontSize: 12, fontWeight: '700', color: GREY, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 24 },
  trackBtnWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  trackCircle: {
    width: 200, height: 200, borderRadius: 100, backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 60, elevation: 30,
  },
  trackCircleDone: { shadowOpacity: 0.25 },
  trackEta: { fontSize: 64, fontWeight: '900', color: BG, letterSpacing: -2 },
  trackEtaUnit: { fontSize: 11, fontWeight: '800', color: 'rgba(0,0,0,0.4)', marginTop: -8, letterSpacing: 1 },

  // PIN display
  pinCard: {
    width: '100%', backgroundColor: SURFACE, borderRadius: 20, padding: 20,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: LIME + '25',
  },
  pinCardLabel: { fontSize: 10, fontWeight: '700', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 },
  pinBoxRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  pinBox: {
    width: 64, height: 72, borderRadius: 16,
    backgroundColor: 'rgba(200,240,0,0.1)', borderWidth: 2, borderColor: LIME + '50',
    alignItems: 'center', justifyContent: 'center',
  },
  pinDigit: { fontSize: 40, fontWeight: '900', color: LIME, letterSpacing: -1 },
  pinCardSub: { fontSize: 12, color: GREY, fontWeight: '500', textAlign: 'center' },
  pinCardHint: { fontSize: 13, color: GREY, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  sharePinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: LIME, borderRadius: 14, height: 46, marginTop: 16,
    width: '100%',
  },
  sharePinTxt: { fontSize: 14, fontWeight: '900', color: BG },

  trackRoute: { backgroundColor: SURFACE, borderRadius: 18, padding: 16, marginBottom: 16 },
  trackRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  trackAddr: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  trackConnector: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 3.5, paddingVertical: 6 },
  trackConnLine: { flex: 1, height: 1, backgroundColor: '#222' },
  trackDistLabel: { fontSize: 11, fontWeight: '700', color: GREY },

  driverCard: { backgroundColor: SURFACE, borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  driverAvatarTxt: { fontSize: 20 },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 3 },
  driverBike: { fontSize: 12, color: GREY },
  driverRating: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: SURFACE2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  driverRatingTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },

  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelTxt: { fontSize: 14, color: MUTED, fontWeight: '600' },

  toast: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 24, paddingHorizontal: 22, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
