import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Animated, TextInput, Platform, Modal, Linking, Alert, Vibration,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import TopBar from './TopBar';
import BottomBar from './BottomBar';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const SURFACE2 = '#181818';
const MUTED = '#444';
const GREY = '#777';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';

// ─── Alert: vibration + web audio beep ───────────────────────────────────

function playAlert() {
  try { Vibration.vibrate([0, 180, 80, 180]); } catch (_) {}
  if (Platform.OS === 'web') {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const beep = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.22, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      beep(880, 0, 0.12);
      beep(1100, 0.16, 0.12);
      beep(880, 0.32, 0.22);
    } catch (_) {}
  }
}

// ─── Job alert banner ─────────────────────────────────────────────────────

function JobBanner({ job, onAccept, onDismiss }) {
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const gone = useRef(false);

  const slideOut = (cb) => {
    if (gone.current) return;
    gone.current = true;
    Animated.parallel([
      Animated.timing(translateY, { toValue: -160, duration: 260, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: false }),
    ]).start(() => cb());
  };

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 70, friction: 11, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: false }),
    ]).start();
    const t = setTimeout(() => slideOut(onDismiss), 12000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={[jb.wrap, { transform: [{ translateY }], opacity }]}>
      <View style={jb.inner}>
        <View style={jb.accent} />
        <View style={jb.body}>
          {/* Top row: badge + size + dismiss */}
          <View style={jb.topRow}>
            <View style={jb.badge}><Text style={jb.badgeTxt}>NEW JOB</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={jb.sizeBadge}>
                <Text style={jb.sizeTxt}>{job.size === 'large' ? '📫 Large' : '📦 Small'}</Text>
              </View>
              <TouchableOpacity style={jb.closeBtn} onPress={() => slideOut(onDismiss)} activeOpacity={0.7}>
                <Ionicons name="close" size={18} color={GREY} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Pay + tip */}
          <View style={jb.payRow}>
            <Text style={jb.pay}>R {job.pay}</Text>
            {job.tip > 0 && (
              <View style={jb.tipBadge}>
                <Ionicons name="gift-outline" size={11} color={GREEN} />
                <Text style={jb.tipTxt}>+R{job.tip} tip</Text>
              </View>
            )}
          </View>

          {/* Route */}
          <View style={jb.routeRow}>
            <View style={jb.routeStop}>
              <View style={[jb.routeDot, { backgroundColor: LIME }]} />
              <Text style={jb.routeAddr} numberOfLines={1}>{job.from}</Text>
            </View>
            <View style={jb.routeLine} />
            <View style={jb.routeStop}>
              <View style={[jb.routeDot, { backgroundColor: '#ef4444' }]} />
              <Text style={jb.routeAddr} numberOfLines={1}>{job.to}</Text>
            </View>
          </View>

          {/* Meta: distance, time, proximity */}
          <View style={jb.metaRow}>
            <View style={jb.metaChip}>
              <Ionicons name="navigate-outline" size={11} color={GREY} />
              <Text style={jb.metaTxt}>{job.km} km</Text>
            </View>
            <View style={jb.metaChip}>
              <Ionicons name="time-outline" size={11} color={GREY} />
              <Text style={jb.metaTxt}>~{job.time} min</Text>
            </View>
            {job.distToPickup != null && (
              <View style={jb.metaChip}>
                <Ionicons name="location-outline" size={11} color={LIME} />
                <Text style={[jb.metaTxt, { color: LIME }]}>{job.distToPickup} km away</Text>
              </View>
            )}
          </View>

          {/* Notes */}
          {job.notes ? (
            <View style={jb.notesRow}>
              <Ionicons name="chatbubble-outline" size={12} color={AMBER} />
              <Text style={jb.notesTxt} numberOfLines={2}>{job.notes}</Text>
            </View>
          ) : null}

          {/* Accept button */}
          <TouchableOpacity style={jb.acceptBtn} onPress={() => slideOut(onAccept)} activeOpacity={0.85}>
            <Text style={jb.acceptTxt}>Accept · R {job.pay}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── SOS emergency contacts ───────────────────────────────────────────────

const SOS_CONTACTS = [
  {
    label: 'Emergency',
    number: '112',
    icon: 'warning-outline',
    color: '#ef4444',
    desc: 'All emergencies · Works without airtime',
  },
  {
    label: 'Police (SAPS)',
    number: '10111',
    icon: 'shield-outline',
    color: '#3b82f6',
    desc: 'South African Police Service',
  },
  {
    label: 'Ambulance / EMS',
    number: '10177',
    icon: 'medkit-outline',
    color: '#f59e0b',
    desc: 'Emergency Medical Services',
  },
  {
    label: 'Cape Town Emergency',
    number: '107',
    icon: 'medical-outline',
    color: '#22c55e',
    desc: 'City of Cape Town Emergency Services',
  },
];

function SOSButton() {
  const [visible, setVisible] = useState(false);

  const call = (number) => {
    Linking.openURL(`tel:${number}`).catch(() =>
      Alert.alert('Cannot call', `Dial ${number} manually`)
    );
  };

  return (
    <>
      <TouchableOpacity style={sos.btn} onPress={() => setVisible(true)} activeOpacity={0.85}>
        <Ionicons name="warning" size={13} color="#fff" />
        <Text style={sos.btnTxt}>SOS</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={sos.overlay}>
          <View style={sos.sheet}>
            <View style={sos.bar} />

            <View style={sos.header}>
              <View style={sos.headerIcon}>
                <Ionicons name="warning" size={26} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sos.title}>Emergency Contacts</Text>
                <Text style={sos.sub}>Tap any number to call immediately</Text>
              </View>
            </View>

            {SOS_CONTACTS.map((c, i) => (
              <TouchableOpacity key={i} style={sos.row} onPress={() => call(c.number)} activeOpacity={0.7}>
                <View style={[sos.iconWrap, { backgroundColor: c.color + '18' }]}>
                  <Ionicons name={c.icon} size={20} color={c.color} />
                </View>
                <View style={sos.rowText}>
                  <Text style={sos.rowLabel}>{c.label}</Text>
                  <Text style={sos.rowDesc}>{c.desc}</Text>
                </View>
                <View style={[sos.callBtn, { backgroundColor: c.color }]}>
                  <Ionicons name="call" size={13} color="#fff" style={{ marginBottom: 2 }} />
                  <Text style={sos.callBtnTxt}>{c.number}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <Text style={sos.note}>🔒  112 works even without airtime or signal</Text>

            <TouchableOpacity style={sos.closeBtn} onPress={() => setVisible(false)} activeOpacity={0.85}>
              <Text style={sos.closeBtnTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Haversine distance (km) ──────────────────────────────────────────────

function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ─── Rider trip map ───────────────────────────────────────────────────────

function buildRiderTripMapHtml(initRider, fromCoords, toCoords) {
  const center = initRider || fromCoords || { lat: -33.9249, lon: 18.4241 };
  const cLat = center.lat; const cLon = center.lon;
  const fLL = fromCoords ? `[${fromCoords.lat},${fromCoords.lon}]` : 'null';
  const tLL = toCoords   ? `[${toCoords.lat},${toCoords.lon}]`     : 'null';
  const rLL = initRider  ? `[${initRider.lat},${initRider.lon}]`   : 'null';
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{height:100%;width:100%;background:#080808}
.rider-icon{font-size:26px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.9))}
</style>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head><body><div id="map"></div><script>
const map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${cLat},${cLon}],16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
L.control.zoom({position:'bottomright'}).addTo(map);
let routeLine=null,riderMarker=null;
const fLL=${fLL}, tLL=${tLL}, rLL=${rLL};
if(fLL) L.circleMarker(fLL,{radius:10,color:'#c8f000',fillColor:'#c8f000',fillOpacity:1,weight:3}).addTo(map).bindTooltip('Pickup',{permanent:false});
if(tLL) L.circleMarker(tLL,{radius:10,color:'#ef4444',fillColor:'#ef4444',fillOpacity:1,weight:3}).addTo(map).bindTooltip('Drop-off',{permanent:false});
const riderIcon=L.divIcon({className:'',html:'<div class="rider-icon">🏍️</div>',iconSize:[36,36],iconAnchor:[18,18]});
function placeRider(lat,lon){
  const ll=[lat,lon];
  if(riderMarker){riderMarker.setLatLng(ll);}
  else{riderMarker=L.marker(ll,{icon:riderIcon,zIndexOffset:1000}).addTo(map);}
}
async function drawRoute(from,to){
  try{
    const url='https://router.project-osrm.org/route/v1/driving/'+from[1]+','+from[0]+';'+to[1]+','+to[0]+'?geometries=geojson';
    const d=await(await fetch(url)).json();
    const coords=d.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);
    if(routeLine)map.removeLayer(routeLine);
    routeLine=L.polyline(coords,{color:'#c8f000',weight:5,opacity:0.9}).addTo(map);
  }catch(_){}
}
if(fLL&&tLL)drawRoute(fLL,tLL);
if(rLL)placeRider(rLL[0],rLL[1]);
window.addEventListener('message',e=>{
  const d=e.data;
  if(!d)return;
  if(d.type==='riderPos'){placeRider(d.lat,d.lon);map.panTo([d.lat,d.lon],{animate:true,duration:1.2});}
  if(d.type==='setRoute'&&d.from&&d.to)drawRoute([d.from.lat,d.from.lon],[d.to.lat,d.to.lon]);
});
</script></body></html>`;
}

function RiderTripMap({ initRider, fromCoords, toCoords, iframeRef: extIframeRef }) {
  const localRef = useRef(null);
  const ref = extIframeRef || localRef;
  const html = buildRiderTripMapHtml(initRider, fromCoords, toCoords);
  if (Platform.OS === 'web') {
    return (
      <iframe
        ref={ref}
        srcDoc={html}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="trip-map"
      />
    );
  }
  const WebView = require('react-native-webview').WebView;
  return <WebView ref={ref} source={{ html }} style={{ flex: 1 }} javaScriptEnabled />;
}

// ─── Mock jobs ────────────────────────────────────────────────────────────

const MOCK_JOBS = [
  { id: 'm1', pay: 78,  km: 5.8, time: 16, from: 'De Waterkant',  to: 'Green Point',    notes: null, tip: 0,  size: 'small', distToPickup: null, fromLat: null, fromLon: null },
  { id: 'm2', pay: 52,  km: 3.2, time: 9,  from: 'Cape Town CBD', to: 'Tamboerskloof',  notes: 'Fragile — handle with care', tip: 10, size: 'small', distToPickup: null, fromLat: null, fromLon: null },
  { id: 'm3', pay: 103, km: 8.1, time: 22, from: 'Observatory',   to: 'Camps Bay',      notes: null, tip: 20, size: 'large', distToPickup: null, fromLat: null, fromLon: null },
];

function formatOrder(o) {
  const km = o.dist_km
    ? parseFloat(o.dist_km)
    : o.price
    ? parseFloat(((o.price - 15) / 6.5).toFixed(1))
    : 5.0;
  return {
    id: o.id,
    pay: o.price || Math.round(km * 6.5 + 15),
    km: Math.round(km * 10) / 10,
    time: Math.round((km / 22) * 60),
    from: o.from_address || 'Pickup',
    to: o.to_address || 'Drop-off',
    notes: o.notes || null,
    tip: o.tip || 0,
    size: o.package_size || 'small',
    fromLat: o.from_lat || null,
    fromLon: o.from_lon || null,
    toLat: o.to_lat || null,
    toLon: o.to_lon || null,
    distToPickup: null, // filled after proximity check
  };
}

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

// ─── Main screen ──────────────────────────────────────────────────────────

export default function RiderScreen({ navigation }) {
  const [online, setOnline] = useState(false);
  const [earnings, setEarnings] = useState(0);
  const [trips, setTrips] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [view, setView] = useState('home');
  const [userId, setUserId] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [newJobAlert, setNewJobAlert] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const pinInputRef = useRef(null);
  const [completedJob, setCompletedJob] = useState(null);
  const [earningsHistory, setEarningsHistory] = useState({ today: 0, trips: 0, week: [0, 0, 0, 0, 0, 0, 0] });
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const locationIntervalRef = useRef(null);
  const sub = useRef(null);
  const riderLocRef = useRef(null);      // current rider position (for proximity)
  const passiveWatchRef = useRef(null);  // web geolocation watchId
  const riderTripMapRef = useRef(null);  // iframe/WebView ref for active-trip map

  const sendToRiderMap = (msg) => {
    const el = riderTripMapRef.current;
    if (!el) return;
    if (Platform.OS === 'web') {
      el.contentWindow?.postMessage(msg, '*');
    } else {
      el.injectJavaScript?.(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(msg)}}));true;`);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id || null;
      setUserId(uid);
      if (uid) loadEarnings(uid);
    });
  }, []);

  useEffect(() => {
    if (!online) {
      setJobs([]);
      sub.current?.unsubscribe();
      stopPassiveLocation();
      return;
    }
    startPassiveLocation();
    // Small delay so passive location can get a first fix before fetching
    const t = setTimeout(fetchOrders, 1200);
    sub.current = supabase.channel('pending_orders')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'orders',
        filter: 'status=eq.pending',
      }, (p) => {
        const incoming = applyProximity(formatOrder(p.new));
        // Skip if too far and we have a location fix
        if (riderLocRef.current && incoming._tooFar) return;
        setJobs(prev => [incoming, ...prev]);
        playAlert();
        setNewJobAlert(incoming);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
      }, (p) => {
        // Remove order from available list the moment it's no longer pending
        if (p.new.status !== 'pending') {
          setJobs(prev => prev.filter(j => j.id !== p.new.id));
        }
      })
      .subscribe();
    return () => { clearTimeout(t); sub.current?.unsubscribe(); };
  }, [online]);

  const PROXIMITY_KM = 10; // only show jobs within this radius

  const applyProximity = (job) => {
    const loc = riderLocRef.current;
    if (loc && job.fromLat && job.fromLon) {
      const d = haversine(loc, { lat: job.fromLat, lon: job.fromLon });
      return { ...job, distToPickup: Math.round(d * 10) / 10, _tooFar: d > PROXIMITY_KM };
    }
    return job;
  };

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!data?.length) { setJobs([]); return; }
    let jobs = data.map(o => applyProximity(formatOrder(o)));
    if (riderLocRef.current) jobs = jobs.filter(j => !j._tooFar);
    setJobs(jobs);
  };

  const startPassiveLocation = () => {
    if (Platform.OS === 'web') {
      if (!navigator?.geolocation) return;
      passiveWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => { riderLocRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude }; },
        null,
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
      );
    } else {
      (async () => {
        try {
          const Location = require('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          passiveWatchRef.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 50 },
            (loc) => { riderLocRef.current = { lat: loc.coords.latitude, lon: loc.coords.longitude }; }
          );
        } catch (_) {}
      })();
    }
  };

  const stopPassiveLocation = () => {
    if (Platform.OS === 'web') {
      if (passiveWatchRef.current != null) {
        navigator.geolocation.clearWatch(passiveWatchRef.current);
        passiveWatchRef.current = null;
      }
    } else {
      passiveWatchRef.current?.remove?.();
      passiveWatchRef.current = null;
    }
    riderLocRef.current = null;
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const loadEarnings = async (uid) => {
    const id = uid || userId;
    if (!id) return;
    // Fetch delivered orders for this rider from the past 7 days
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('orders')
      .select('price, tip, dist_km, from_address, to_address, created_at')
      .eq('rider_id', id)
      .eq('status', 'delivered')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });
    if (!data) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let todayTotal = 0; let todayTrips = 0;
    const week = [0, 0, 0, 0, 0, 0, 0]; // Mon=0 … Sun=6
    data.forEach(o => {
      const d = new Date(o.created_at);
      const price = (parseFloat(o.price) || 0) + (parseFloat(o.tip) || 0);
      const dow = (d.getDay() + 6) % 7;
      week[dow] += price;
      if (d >= today) { todayTotal += price; todayTrips++; }
    });
    setEarnings(todayTotal);
    setTrips(todayTrips);
    setEarningsHistory({ today: todayTotal, trips: todayTrips, week });
    setDeliveryHistory(data);
  };

  const startLocationBroadcast = (job) => {
    if (String(job.id).startsWith('m')) return;
    clearInterval(locationIntervalRef.current);

    const broadcast = async () => {
      try {
        if (Platform.OS === 'web') {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude, lon = pos.coords.longitude;
            riderLocRef.current = { lat, lon };
            sendToRiderMap({ type: 'riderPos', lat, lon });
            await supabase.from('rider_locations').upsert({
              rider_id: userId, order_id: job.id, lat, lon,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'rider_id' });
          });
        } else {
          const Location = require('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const lat = loc.coords.latitude, lon = loc.coords.longitude;
          riderLocRef.current = { lat, lon };
          sendToRiderMap({ type: 'riderPos', lat, lon });
          await supabase.from('rider_locations').upsert({
            rider_id: userId, order_id: job.id, lat, lon,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'rider_id' });
        }
      } catch (_) {}
    };

    broadcast();
    locationIntervalRef.current = setInterval(broadcast, 5000);
  };

  const stopLocationBroadcast = () => {
    clearInterval(locationIntervalRef.current);
    locationIntervalRef.current = null;
  };

  const acceptJob = async (job) => {
    if (!String(job.id).startsWith('m')) {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'on_the_way', rider_id: userId })
        .eq('id', job.id);
      if (error) { showToast('Failed to accept — try again'); return; }
    }
    setActiveJob(job);
    setJobs(p => p.filter(j => j.id !== job.id));
    setPinInput('');
    setPinError(false);
    startLocationBroadcast(job);
    setView('active');
  };

  const confirmDelivery = async () => {
    if (!activeJob) return;
    if (!String(activeJob.id).startsWith('m')) {
      const { data } = await supabase
        .from('orders')
        .select('delivery_pin')
        .eq('id', activeJob.id)
        .single();
      if (data?.delivery_pin && pinInput !== data.delivery_pin) {
        setPinError(true);
        showToast('Wrong PIN — ask the recipient again');
        return;
      }
      await supabase.from('orders').update({ status: 'delivered' }).eq('id', activeJob.id);
    }
    stopLocationBroadcast();
    const done = { ...activeJob };
    setCompletedJob(done);
    setActiveJob(null);
    setPinInput('');
    setPinError(false);
    await loadEarnings(userId);
    await fetchOrders(); // wait for refresh before showing summary
    setView('summary');
  };

  const skipJob = (id) => setJobs(p => p.filter(j => j.id !== id));

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const handleBottomBar = (tabId) => {
    if (tabId === 'home') setView('home');
    else if (tabId === 'jobs') setView('jobs');
    else if (tabId === 'earnings') setView('earnings');
    else if (tabId === 'settings') navigation.navigate('Settings');
  };

  const activeTab = view === 'earnings' ? 'earnings' : view === 'jobs' ? 'jobs' : 'home';
  const weekAmts = earningsHistory.week;
  const maxAmt = Math.max(...weekAmts, 1); // prevent divide-by-zero when all zeros

  return (
    <View style={s.container}>
      <StatusBar style={view === 'active' ? 'dark' : 'light'} />
      {view !== 'active' && <TopBar />}

      {/* ── Floating SOS button — always visible ── */}
      <SOSButton />

      {/* ── New job alert banner ── */}
      {online && newJobAlert && view !== 'active' && (
        <JobBanner
          job={newJobAlert}
          onAccept={() => { setNewJobAlert(null); acceptJob(newJobAlert); }}
          onDismiss={() => setNewJobAlert(null)}
        />
      )}

      {/* ── ACTIVE DELIVERY (full-screen map) ── */}
      {view === 'active' && activeJob && (
        <View style={s.tripScreen}>
          {/* Map — fills almost all screen */}
          <View style={s.tripMapArea}>
            <RiderTripMap
              iframeRef={riderTripMapRef}
              initRider={riderLocRef.current}
              fromCoords={activeJob.fromLat ? { lat: activeJob.fromLat, lon: activeJob.fromLon } : null}
              toCoords={activeJob.toLat ? { lat: activeJob.toLat, lon: activeJob.toLon } : null}
            />
            {/* Floating payout chip */}
            <View style={s.tripPayChip}>
              <Text style={s.tripPayChipAmt}>R {activeJob.pay}</Text>
              <Text style={s.tripPayChipMeta}>{activeJob.km} km · ~{activeJob.time} min</Text>
            </View>
            {/* Floating "EN ROUTE" label */}
            <View style={s.tripStatusChip}>
              <View style={s.tripStatusDot} />
              <Text style={s.tripStatusTxt}>EN ROUTE</Text>
            </View>
          </View>

          {/* Bottom sheet */}
          <View style={s.tripSheet}>
            {/* Route */}
            <View style={s.tripRouteBlock}>
              <View style={s.tripStop}>
                <View style={[s.tripDot, { backgroundColor: LIME }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.tripStopLbl}>COLLECTING FROM</Text>
                  <Text style={s.tripStopAddr} numberOfLines={1}>{activeJob.from}</Text>
                </View>
              </View>
              <View style={s.tripConnector} />
              <View style={s.tripStop}>
                <View style={[s.tripDot, { backgroundColor: '#ef4444' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.tripStopLbl}>DELIVERING TO</Text>
                  <Text style={s.tripStopAddr} numberOfLines={1}>{activeJob.to}</Text>
                </View>
              </View>
            </View>

            {activeJob.notes ? (
              <View style={s.tripNotesRow}>
                <Ionicons name="chatbubble-outline" size={13} color={LIME} />
                <Text style={s.tripNotesTxt} numberOfLines={2}>{activeJob.notes}</Text>
              </View>
            ) : null}

            {/* PIN entry */}
            <View style={s.tripPinRow}>
              <Text style={s.tripPinLbl}>RECIPIENT PIN</Text>
              <TouchableOpacity style={s.pinBoxRow} onPress={() => pinInputRef.current?.focus()} activeOpacity={1}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={[s.pinBox, pinInput.length === i && s.pinBoxActive, pinError && s.pinBoxError]}>
                    <Text style={[s.pinDigit, pinError && { color: '#ef4444' }]}>{pinInput[i] || ''}</Text>
                  </View>
                ))}
              </TouchableOpacity>
              <TextInput
                ref={pinInputRef}
                style={s.pinHiddenInput}
                value={pinInput}
                onChangeText={v => { setPinInput(v.replace(/\D/g, '').slice(0, 3)); setPinError(false); }}
                keyboardType="numeric"
                maxLength={3}
              />
              {pinError && <Text style={s.pinErrorTxt}>Incorrect PIN — try again</Text>}
            </View>

            <TouchableOpacity
              style={[s.deliveredBtn, pinInput.length < 3 && { opacity: 0.4 }]}
              onPress={confirmDelivery}
              disabled={pinInput.length < 3}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={BG} />
              <Text style={s.deliveredBtnTxt}>Confirm Delivery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.backToHomeBtn} onPress={() => { stopLocationBroadcast(); setView('home'); }} activeOpacity={0.7}>
              <Text style={s.backToHomeTxt}>Cancel trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── DELIVERY SUMMARY ── */}
      {view === 'summary' && completedJob && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          <View style={s.summaryHero}>
            <View style={s.summaryCheck}>
              <Ionicons name="checkmark" size={42} color={BG} />
            </View>
            <Text style={s.summaryTitle}>Delivered!</Text>
            <Text style={s.summaryPay}>R {completedJob.pay}</Text>
            <Text style={s.summarySub}>added to your earnings</Text>
          </View>

          <View style={s.summaryRoute}>
            <View style={s.jobStop}>
              <View style={[s.jobDot, { backgroundColor: LIME }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.stopLbl}>COLLECTED FROM</Text>
                <Text style={s.jobAddr}>{completedJob.from}</Text>
              </View>
            </View>
            <View style={[s.jobConnector, { height: 20, marginLeft: 3 }]} />
            <View style={s.jobStop}>
              <View style={[s.jobDot, { backgroundColor: GREEN }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.stopLbl}>DELIVERED TO</Text>
                <Text style={s.jobAddr}>{completedJob.to}</Text>
              </View>
            </View>
          </View>

          <View style={s.summaryStats}>
            {[
              { label: 'Distance', val: `${completedJob.km} km` },
              { label: 'Est. Time', val: `~${completedJob.time} min` },
              { label: 'Payout', val: `R ${completedJob.pay}` },
            ].map((item, i) => (
              <View key={i} style={s.summaryStatItem}>
                <Text style={s.summaryStatVal}>{item.val}</Text>
                <Text style={s.summaryStatLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={s.summaryTodayCard}>
            <Text style={s.summaryTodayLabel}>TODAY'S TOTAL</Text>
            <Text style={s.summaryTodayAmt}>R {earnings}</Text>
            <Text style={s.summaryTodaySub}>{trips} {trips === 1 ? 'delivery' : 'deliveries'} completed</Text>
          </View>

          <TouchableOpacity
            style={s.summaryHomeBtn}
            onPress={() => { setCompletedJob(null); fetchOrders(); setView('home'); }}
            activeOpacity={0.85}
          >
            <Ionicons name="bicycle-outline" size={20} color={BG} />
            <Text style={s.summaryHomeBtnTxt}>Back to Dashboard</Text>
          </TouchableOpacity>

        </ScrollView>
      )}

      {/* ── HOME ── */}
      {view === 'home' && (
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
              { val: trips,          label: 'Trips',  color: '#fff' },
              { val: `R${earnings}`, label: 'Today',  color: LIME  },
              { val: '4.9',          label: 'Rating', color: GREEN },
            ].map((stat, i) => (
              <View key={i} style={s.statCard}>
                <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[s.onlineCard, online && s.onlineCardActive]}
            onPress={() => setOnline(!online)}
            activeOpacity={0.85}
          >
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
              { icon: 'wallet-outline',      label: 'Earnings',    color: LIME,      onPress: () => setView('earnings') },
              { icon: 'trending-up-outline', label: 'Performance', color: '#3b82f6', onPress: () => setView('performance') },
              { icon: 'time-outline',        label: 'History',     color: AMBER,     onPress: () => setView('history') },
              { icon: 'headset-outline',     label: 'Support',     color: '#a78bfa', onPress: () => setView('support') },
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
                <TouchableOpacity onPress={() => setView('jobs')}>
                  <Text style={s.sectionLink}>See all →</Text>
                </TouchableOpacity>
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
      )}

      {/* ── JOB LIST ── */}
      {view === 'jobs' && (
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
              {/* Pay + badges */}
              <View style={s.jobCardTop}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={s.jobPay}>R {job.pay}</Text>
                    {job.tip > 0 && (
                      <View style={s.jobTipBadge}>
                        <Text style={s.jobTipTxt}>+R{job.tip} tip</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={s.jobMetaChip}>
                      <Text style={s.jobMetaTxt}>{job.size === 'large' ? '📫 Large' : '📦 Small'}</Text>
                    </View>
                    <View style={s.jobMetaChip}>
                      <Text style={s.jobMetaTxt}>{job.km} km · ~{job.time} min</Text>
                    </View>
                    {job.distToPickup != null && (
                      <View style={[s.jobMetaChip, { borderColor: LIME + '40' }]}>
                        <Text style={[s.jobMetaTxt, { color: LIME }]}>📍 {job.distToPickup} km from you</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              {/* Route */}
              <View style={s.jobRoute}>
                <View style={s.jobStop}>
                  <View style={[s.jobDot, { backgroundColor: LIME }]} />
                  <Text style={s.jobAddr}>{job.from}</Text>
                </View>
                <View style={s.jobConnector} />
                <View style={s.jobStop}>
                  <View style={[s.jobDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={s.jobAddr}>{job.to}</Text>
                </View>
              </View>
              {/* Notes */}
              {job.notes ? (
                <View style={s.jobNotesRow}>
                  <Ionicons name="chatbubble-outline" size={13} color={AMBER} />
                  <Text style={s.jobNotesTxt} numberOfLines={2}>{job.notes}</Text>
                </View>
              ) : null}
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
      )}

      {/* ── EARNINGS ── */}
      {view === 'earnings' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={s.pageTitle}>Earnings</Text>

          <View style={s.earnHero}>
            <Text style={s.earnLabel}>TODAY</Text>
            <Text style={s.earnAmt}>R {earnings}</Text>
            <Text style={s.earnSub}>{trips} {trips === 1 ? 'delivery' : 'deliveries'}</Text>
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

          {deliveryHistory.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 24 }]}>Recent Deliveries</Text>
              {deliveryHistory.map((item, i) => (
                <View key={i} style={s.historyRow}>
                  <View style={s.historyIcon}>
                    <Ionicons name="checkmark-circle" size={18} color={GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyRoute} numberOfLines={1}>
                      {item.from_address} → {item.to_address}
                    </Text>
                    <Text style={s.historyDate}>
                      {new Date(item.created_at).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={s.historyAmt}>R {item.price}</Text>
                </View>
              ))}
            </>
          )}

          {deliveryHistory.length === 0 && (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>📦</Text>
              <Text style={s.emptyTitle}>No deliveries yet</Text>
              <Text style={s.emptySub}>Complete your first run to see history here</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── PERFORMANCE ── */}
      {view === 'performance' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={s.pageTitle}>Performance</Text>

          {/* Rating hero */}
          <View style={s.perfHero}>
            <Text style={s.perfHeroLabel}>YOUR RATING</Text>
            <Text style={s.perfHeroVal}>4.9</Text>
            <View style={s.perfStars}>
              {[1,2,3,4,5].map(i => (
                <Ionicons key={i} name={i <= 4 ? 'star' : 'star-half'} size={20} color={LIME} />
              ))}
            </View>
            <Text style={s.perfHeroSub}>Based on customer feedback</Text>
          </View>

          {/* Stat grid */}
          <View style={s.perfGrid}>
            {[
              { label: 'Trips This Week', val: earningsHistory.trips, icon: 'bicycle-outline', color: LIME },
              { label: 'Today\'s Earnings', val: `R ${earnings}`, icon: 'cash-outline', color: GREEN },
              { label: 'Avg per Trip', val: earningsHistory.trips > 0 ? `R ${Math.round(earningsHistory.today / earningsHistory.trips)}` : '—', icon: 'trending-up-outline', color: '#3b82f6' },
              { label: 'Best Day', val: `R ${Math.max(...weekAmts)}`, icon: 'trophy-outline', color: AMBER },
            ].map((stat, i) => (
              <View key={i} style={s.perfStatCard}>
                <Ionicons name={stat.icon} size={20} color={stat.color} />
                <Text style={[s.perfStatVal, { color: stat.color }]}>{stat.val}</Text>
                <Text style={s.perfStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <Text style={s.sectionLabel}>Weekly Activity</Text>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => (
            <View key={i} style={s.earnRow}>
              <Text style={s.earnDay}>{day}</Text>
              <View style={s.earnBarBg}>
                <View style={[s.earnBarFill, { width: `${Math.round((weekAmts[i] / maxAmt) * 100)}%`, backgroundColor: '#3b82f6' }]} />
              </View>
              <Text style={s.earnDayAmt}>R {weekAmts[i]}</Text>
            </View>
          ))}

          <View style={[s.perfHero, { marginTop: 24, flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'flex-start' }]}>
            <Ionicons name="checkmark-circle" size={28} color={GREEN} />
            <View>
              <Text style={[s.perfHeroLabel, { marginBottom: 2 }]}>COMPLETION RATE</Text>
              <Text style={[s.perfHeroVal, { fontSize: 32, lineHeight: 36 }]}>100%</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── HISTORY ── */}
      {view === 'history' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={s.pageTitle}>History</Text>

          {deliveryHistory.length > 0 ? (
            deliveryHistory.map((item, i) => (
              <View key={i} style={s.historyCard}>
                <View style={s.historyCardTop}>
                  <View style={s.historyIconLg}>
                    <Ionicons name="checkmark-circle" size={22} color={GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyRoute} numberOfLines={1}>
                      {item.from_address} → {item.to_address}
                    </Text>
                    <Text style={s.historyDate}>
                      {new Date(item.created_at).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={s.historyAmt}>R {(parseFloat(item.price) + parseFloat(item.tip || 0)).toFixed(0)}</Text>
                </View>
                {item.tip > 0 && (
                  <View style={s.historyTipRow}>
                    <Ionicons name="heart" size={12} color={LIME} />
                    <Text style={s.historyTipTxt}>Includes R {item.tip} tip</Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>No trips yet</Text>
              <Text style={s.emptySub}>Your completed deliveries will appear here</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── SUPPORT ── */}
      {view === 'support' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={s.pageTitle}>Support</Text>

          {/* Contact options */}
          <View style={s.supportContactRow}>
            <TouchableOpacity style={s.supportContact} onPress={() => Linking.openURL('https://wa.me/27000000000')} activeOpacity={0.8}>
              <View style={[s.supportContactIcon, { backgroundColor: '#25d36615' }]}>
                <Ionicons name="logo-whatsapp" size={22} color="#25d366" />
              </View>
              <Text style={s.supportContactLbl}>WhatsApp</Text>
              <Text style={s.supportContactSub}>Fastest reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.supportContact} onPress={() => Linking.openURL('mailto:support@runit.co.za')} activeOpacity={0.8}>
              <View style={[s.supportContactIcon, { backgroundColor: '#3b82f615' }]}>
                <Ionicons name="mail-outline" size={22} color="#3b82f6" />
              </View>
              <Text style={s.supportContactLbl}>Email</Text>
              <Text style={s.supportContactSub}>support@runit.co.za</Text>
            </TouchableOpacity>
          </View>

          {/* FAQ */}
          <Text style={s.sectionLabel}>Common Questions</Text>
          {[
            { q: 'When do I get paid?', a: 'Earnings are available for instant cashout anytime, or auto-paid at 22:00 daily to your registered bank account.' },
            { q: 'What if a customer gives the wrong PIN?', a: 'Ask the customer to check their SMS or app. If they cannot provide the correct PIN, contact support via WhatsApp before leaving.' },
            { q: 'My GPS is inaccurate — what do I do?', a: 'Move to an open area and give the app a few seconds to get a fresh fix. Make sure location permissions are set to "Always Allow".' },
            { q: 'Can I cancel an accepted order?', a: 'Contact support immediately if you need to cancel. Repeated cancellations affect your acceptance rate and may result in account suspension.' },
            { q: 'How is my rating calculated?', a: 'Customers rate you after delivery. Your score is the rolling average of your last 100 ratings. Aim to be on time and professional.' },
          ].map((faq, i) => (
            <View key={i} style={s.faqCard}>
              <Text style={s.faqQ}>{faq.q}</Text>
              <Text style={s.faqA}>{faq.a}</Text>
            </View>
          ))}

          <View style={s.supportFooter}>
            <Text style={s.supportVersion}>RunIt · Rider App · v1.0</Text>
            <Text style={s.supportVersion}>Cape Town, South Africa</Text>
          </View>
        </ScrollView>
      )}

      {/* ── Bottom bar (hidden during active delivery and summary) ── */}
      {view !== 'active' && view !== 'summary' && (
        <BottomBar active={activeTab} role="rider" onPress={handleBottomBar} />
      )}

      {/* ── Toast ── */}
      {toastMsg ? <View style={s.toast}><Text style={s.toastTxt}>{toastMsg}</Text></View> : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const jb = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 82, left: 16, right: 16, zIndex: 300,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 20,
  },
  inner: {
    flexDirection: 'row', backgroundColor: '#141414',
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: '#222',
  },
  accent: { width: 4, backgroundColor: LIME },
  body: { flex: 1, padding: 14 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: {
    backgroundColor: LIME + '20', borderWidth: 1, borderColor: LIME + '40',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeTxt: { fontSize: 9, fontWeight: '900', color: LIME, letterSpacing: 2 },
  sizeBadge: {
    backgroundColor: '#1e1e1e', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sizeTxt: { fontSize: 10, fontWeight: '700', color: '#aaa' },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center',
  },

  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pay: { fontSize: 30, fontWeight: '900', color: GREEN },
  tipBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN + '18', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  tipTxt: { fontSize: 11, fontWeight: '800', color: GREEN },

  routeRow: { marginBottom: 8 },
  routeStop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  routeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  routeAddr: { fontSize: 13, fontWeight: '700', color: '#fff', flex: 1 },
  routeLine: { width: 1, height: 10, backgroundColor: '#2a2a2a', marginLeft: 3, marginBottom: 3 },

  metaRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1e1e1e', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 4,
  },
  metaTxt: { fontSize: 11, fontWeight: '600', color: GREY },

  notesRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: AMBER + '10', borderRadius: 10,
    padding: 8, marginBottom: 8,
  },
  notesTxt: { fontSize: 12, color: AMBER, flex: 1, fontWeight: '600' },

  acceptBtn: {
    backgroundColor: LIME, borderRadius: 14, height: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  acceptTxt: { fontSize: 14, fontWeight: '900', color: BG },
});

const sos = StyleSheet.create({
  btn: {
    position: 'absolute', top: 54, right: 20, zIndex: 200,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#ef4444', borderRadius: 20,
    paddingHorizontal: 13, paddingVertical: 7,
    shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 10, elevation: 10,
  },
  btnTxt: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 1 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#141414', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 28, paddingBottom: 48,
  },
  bar: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  headerIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 3 },
  sub: { fontSize: 13, color: '#666' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 2 },
  rowDesc: { fontSize: 12, color: '#555', fontWeight: '500' },
  callBtn: {
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center', minWidth: 64,
  },
  callBtnTxt: { fontSize: 13, fontWeight: '900', color: '#fff' },

  note: { fontSize: 12, color: '#444', textAlign: 'center', marginVertical: 16 },
  closeBtn: {
    backgroundColor: '#1a1a1a', borderRadius: 16, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  closeBtnTxt: { fontSize: 15, fontWeight: '800', color: '#666' },
});

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
  jobAddr: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  stopLbl: { fontSize: 10, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 },
  jobTipBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  jobTipTxt: { fontSize: 11, fontWeight: '800', color: GREEN },
  jobMetaChip: {
    backgroundColor: '#1a1a1a', borderRadius: 8, borderWidth: 1, borderColor: '#252525',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  jobMetaTxt: { fontSize: 11, fontWeight: '600', color: GREY },
  jobNotesRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: AMBER + '10', borderRadius: 12, padding: 10, marginBottom: 10,
  },
  jobNotesTxt: { fontSize: 12, color: AMBER, flex: 1, fontWeight: '600', lineHeight: 18 },
  jobActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, backgroundColor: LIME, borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center' },
  acceptBtnTxt: { fontSize: 15, fontWeight: '900', color: BG },
  skipBtn: { backgroundColor: '#0e0e0e', borderRadius: 14, paddingHorizontal: 18, height: 48, alignItems: 'center', justifyContent: 'center' },
  skipBtnTxt: { fontSize: 14, fontWeight: '700', color: GREY },

  // Full-screen active delivery (trip map view)
  tripScreen: { flex: 1 },
  tripMapArea: { flex: 1, position: 'relative' },
  tripPayChip: {
    position: 'absolute', top: 14, left: 14, zIndex: 10,
    backgroundColor: 'rgba(8,8,8,0.85)', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(200,240,0,0.35)',
  },
  tripPayChipAmt: { fontSize: 22, fontWeight: '900', color: LIME, letterSpacing: -0.5 },
  tripPayChipMeta: { fontSize: 11, color: '#5a8020', fontWeight: '600', marginTop: 2 },
  tripStatusChip: {
    position: 'absolute', top: 14, right: 14, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(8,8,8,0.8)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  tripStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIME },
  tripStatusTxt: { fontSize: 10, fontWeight: '800', color: LIME, letterSpacing: 2 },
  tripSheet: {
    backgroundColor: SURFACE, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28,
    borderTopWidth: 1, borderColor: '#1a1a1a',
  },
  tripRouteBlock: { marginBottom: 10 },
  tripStop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tripDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  tripStopLbl: { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  tripStopAddr: { fontSize: 14, fontWeight: '700', color: '#ddd' },
  tripConnector: { width: 1, height: 12, backgroundColor: '#2a2a2a', marginLeft: 4, marginVertical: 2 },
  tripNotesRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(200,240,0,0.05)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
    borderWidth: 1, borderColor: 'rgba(200,240,0,0.12)',
  },
  tripNotesTxt: { flex: 1, fontSize: 12, color: '#bbb', fontWeight: '500', lineHeight: 18 },
  tripPinRow: { alignItems: 'center', marginTop: 10, marginBottom: 4 },
  tripPinLbl: { fontSize: 9, fontWeight: '800', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 },

  // Active delivery (legacy — kept for style refs)
  activeHero: {
    backgroundColor: 'rgba(200,240,0,0.07)', borderWidth: 1,
    borderColor: 'rgba(200,240,0,0.15)', borderRadius: 24,
    padding: 24, alignItems: 'center', marginBottom: 20,
  },
  activeHeroLabel: { fontSize: 10, fontWeight: '700', color: '#5a8020', letterSpacing: 3, marginBottom: 8 },
  activeHeroPay: { fontSize: 64, fontWeight: '900', color: LIME, letterSpacing: -2, lineHeight: 68 },
  activeHeroSub: { fontSize: 13, color: '#5a8020', fontWeight: '600', marginTop: 4 },
  deliveredBtn: {
    backgroundColor: LIME, borderRadius: 18, height: 60,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 24,
    shadowColor: LIME, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
  },
  deliveredBtnTxt: { fontSize: 17, fontWeight: '900', color: BG },
  backToHomeBtn: { alignItems: 'center', paddingVertical: 16 },
  backToHomeTxt: { fontSize: 14, color: GREY, fontWeight: '600' },

  // Notes
  notesCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(200,240,0,0.06)', borderWidth: 1,
    borderColor: 'rgba(200,240,0,0.18)', borderRadius: 16,
    padding: 14, marginBottom: 16,
  },
  notesTxt: { flex: 1, fontSize: 13, color: '#ccc', fontWeight: '500', lineHeight: 20 },

  // PIN entry
  pinEntryCard: { backgroundColor: SURFACE, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 20 },
  pinEntryLabel: { fontSize: 10, fontWeight: '700', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 },
  pinEntryHint: { fontSize: 13, color: GREY, marginBottom: 20 },
  pinBoxRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  pinBox: {
    width: 64, height: 72, borderRadius: 16,
    backgroundColor: '#0e0e0e', borderWidth: 2, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
  },
  pinBoxActive: { borderColor: LIME },
  pinBoxError: { borderColor: '#ef4444' },
  pinDigit: { fontSize: 36, fontWeight: '900', color: '#fff' },
  pinHiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  pinErrorTxt: { fontSize: 12, color: '#ef4444', fontWeight: '600', marginTop: 8 },

  // Earnings
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

  // Delivery history list
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 16, padding: 14, marginBottom: 8 },
  historyIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: GREEN + '18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  historyRoute: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 3 },
  historyDate: { fontSize: 11, color: GREY },
  historyAmt: { fontSize: 16, fontWeight: '900', color: GREEN, flexShrink: 0 },

  // History view
  historyCard: { backgroundColor: SURFACE, borderRadius: 18, padding: 16, marginBottom: 10 },
  historyCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyIconLg: { width: 40, height: 40, borderRadius: 14, backgroundColor: GREEN + '18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  historyTipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: '#1e1e1e' },
  historyTipTxt: { fontSize: 12, color: LIME, fontWeight: '600' },

  // Performance view
  perfHero: {
    backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)', borderRadius: 24,
    padding: 24, alignItems: 'center', marginBottom: 20,
  },
  perfHeroLabel: { fontSize: 10, fontWeight: '700', color: '#6090c0', letterSpacing: 3, marginBottom: 8 },
  perfHeroVal: { fontSize: 64, fontWeight: '900', color: '#3b82f6', letterSpacing: -2, lineHeight: 68 },
  perfStars: { flexDirection: 'row', gap: 4, marginTop: 8, marginBottom: 6 },
  perfHeroSub: { fontSize: 12, color: '#6090c0', fontWeight: '600' },
  perfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  perfStatCard: {
    flex: 1, minWidth: '45%', backgroundColor: SURFACE, borderRadius: 18,
    padding: 16, alignItems: 'flex-start', gap: 6,
  },
  perfStatVal: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  perfStatLabel: { fontSize: 11, color: GREY, fontWeight: '600' },

  // Support view
  supportContactRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  supportContact: { flex: 1, backgroundColor: SURFACE, borderRadius: 18, padding: 18, alignItems: 'center', gap: 8 },
  supportContactIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  supportContactLbl: { fontSize: 14, fontWeight: '800', color: '#fff' },
  supportContactSub: { fontSize: 11, color: GREY, fontWeight: '500' },
  faqCard: { backgroundColor: SURFACE, borderRadius: 18, padding: 18, marginBottom: 10 },
  faqQ: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 8 },
  faqA: { fontSize: 13, color: GREY, lineHeight: 20, fontWeight: '500' },
  supportFooter: { alignItems: 'center', marginTop: 32, gap: 4 },
  supportVersion: { fontSize: 11, color: MUTED, fontWeight: '500' },

  // Post-delivery summary
  summaryHero: { alignItems: 'center', paddingVertical: 28, marginBottom: 8 },
  summaryCheck: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 28, elevation: 14,
  },
  summaryTitle: { fontSize: 36, fontWeight: '900', color: '#fff', marginBottom: 6 },
  summaryPay: { fontSize: 56, fontWeight: '900', color: LIME, letterSpacing: -1, marginBottom: 4 },
  summarySub: { fontSize: 14, color: GREY, fontWeight: '600' },
  summaryRoute: { backgroundColor: SURFACE, borderRadius: 20, padding: 20, marginBottom: 12 },
  summaryStats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryStatItem: { flex: 1, backgroundColor: SURFACE, borderRadius: 16, padding: 16, alignItems: 'center' },
  summaryStatVal: { fontSize: 17, fontWeight: '900', color: '#fff', marginBottom: 4 },
  summaryStatLabel: { fontSize: 11, color: GREY, fontWeight: '600' },
  summaryTodayCard: {
    backgroundColor: 'rgba(200,240,0,0.07)', borderRadius: 20, padding: 20,
    alignItems: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: LIME + '25',
  },
  summaryTodayLabel: { fontSize: 10, fontWeight: '700', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 },
  summaryTodayAmt: { fontSize: 42, fontWeight: '900', color: LIME, letterSpacing: -0.5 },
  summaryTodaySub: { fontSize: 13, color: GREY, marginTop: 4 },
  summaryHomeBtn: {
    backgroundColor: LIME, borderRadius: 18, height: 58,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  summaryHomeBtnTxt: { fontSize: 16, fontWeight: '900', color: BG },

  toast: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 24,
    paddingHorizontal: 22, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
