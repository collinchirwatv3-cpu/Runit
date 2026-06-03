import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Animated, TextInput, Platform, Modal, Linking, Alert, Vibration, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import TopBar, { getSmartGreeting } from './TopBar';
import BottomBar from './BottomBar';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const SURFACE2 = '#181818';
const MUTED = '#444';
const GREY = '#777';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';

// ─── Swipe-up sheet heights ───────────────────────────────────────────────
const SHEET_COLLAPSED = 68;   // pill + destination peek
const SHEET_EXPANDED  = 490;  // full details visible

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
              <View style={[jb.sizeBadge, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <Ionicons name={job.size === 'large' ? 'archive-outline' : 'cube-outline'} size={11} color={GREY} />
                <Text style={jb.sizeTxt}>{job.size === 'large' ? 'Large' : 'Small'}</Text>
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

function SOSButton({ activeJob, onBreakdown }) {
  const [visible, setVisible] = useState(false);
  const [confirmBreakdown, setConfirmBreakdown] = useState(false);

  const close = () => { setVisible(false); setConfirmBreakdown(false); };

  const call = (number) => {
    Linking.openURL(`tel:${number}`).catch(() =>
      Alert.alert('Cannot call', `Dial ${number} manually`)
    );
  };

  const handleBreakdown = () => {
    close();
    onBreakdown?.();
  };

  return (
    <>
      <TouchableOpacity style={sos.btn} onPress={() => setVisible(true)} activeOpacity={0.85}>
        <Ionicons name="warning" size={13} color="#fff" />
        <Text style={sos.btnTxt}>SOS</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={sos.overlay}>
          <View style={sos.sheet}>
            <View style={sos.bar} />

            {/* ── Breakdown section — only when on an active trip ── */}
            {activeJob && !confirmBreakdown && (
              <TouchableOpacity style={sos.breakdownBtn} onPress={() => setConfirmBreakdown(true)} activeOpacity={0.85}>
                <View style={sos.breakdownIcon}>
                  <Ionicons name="construct-outline" size={20} color={AMBER} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sos.breakdownTitle}>I've broken down</Text>
                  <Text style={sos.breakdownSub}>Tap to transfer your trip to another rider</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={AMBER} />
              </TouchableOpacity>
            )}

            {/* ── Breakdown confirmation ── */}
            {activeJob && confirmBreakdown && (
              <View style={sos.breakdownConfirmCard}>
                <View style={sos.breakdownConfirmIcon}>
                  <Ionicons name="construct" size={28} color={AMBER} />
                </View>
                <Text style={sos.breakdownConfirmTitle}>Transfer this trip?</Text>
                <Text style={sos.breakdownConfirmSub}>
                  The system will immediately find another nearby rider to take over your delivery. Your customer won't be left waiting.
                </Text>
                <TouchableOpacity style={sos.breakdownConfirmYes} onPress={handleBreakdown} activeOpacity={0.85}>
                  <Ionicons name="swap-horizontal-outline" size={18} color="#000" />
                  <Text style={sos.breakdownConfirmYesTxt}>Yes, Transfer Now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={sos.breakdownConfirmNo} onPress={() => setConfirmBreakdown(false)} activeOpacity={0.7}>
                  <Text style={sos.breakdownConfirmNoTxt}>Go back</Text>
                </TouchableOpacity>
              </View>
            )}

            {!confirmBreakdown && (
              <>
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

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={13} color="#555" />
                  <Text style={sos.note}>112 works even without airtime or signal</Text>
                </View>

                <TouchableOpacity style={sos.closeBtn} onPress={close} activeOpacity={0.85}>
                  <Text style={sos.closeBtnTxt}>Close</Text>
                </TouchableOpacity>
              </>
            )}
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
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;width:100%;overflow:hidden;background:#1a237e}
#nav-banner{
  position:fixed;top:0;left:0;right:0;z-index:2000;
  background:#1565c0;display:flex;align-items:center;gap:14px;
  padding:14px 18px;box-shadow:0 4px 20px rgba(0,0,0,0.5);
}
#nav-icon{
  width:50px;height:50px;background:rgba(255,255,255,0.15);border-radius:10px;
  display:flex;align-items:center;justify-content:center;
  font-size:28px;flex-shrink:0;
}
#nav-info{flex:1;min-width:0}
#nav-dist{font-size:26px;font-weight:900;color:#fff;line-height:1}
#nav-road{font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#map-wrap{position:fixed;top:80px;left:0;right:0;bottom:72px}
#map{width:100%;height:100%}
#bottom-bar{
  position:fixed;bottom:0;left:0;right:0;height:72px;
  background:#fff;display:flex;align-items:center;
  padding:0 20px;gap:16px;box-shadow:0 -2px 16px rgba(0,0,0,0.12);
}
#eta-min{font-size:34px;font-weight:900;color:#c62828;line-height:1}
#eta-lbl{font-size:11px;color:#999;font-weight:700;margin-top:2px}
#divider{width:1px;height:36px;background:#e0e0e0;flex-shrink:0}
#dist-box{flex:1}
#dist-val{font-size:16px;font-weight:700;color:#222}
#arrive-val{font-size:12px;color:#999;margin-top:2px}
#recenter-btn{
  position:fixed;bottom:84px;right:12px;z-index:1500;
  width:44px;height:44px;border-radius:22px;
  background:#fff;border:none;cursor:pointer;font-size:22px;
  box-shadow:0 2px 12px rgba(0,0,0,0.25);
  display:flex;align-items:center;justify-content:center;
}
</style>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js"></script>
</head><body>
<div id="nav-banner">
  <div id="nav-icon">↑</div>
  <div id="nav-info">
    <div id="nav-dist">Calculating…</div>
    <div id="nav-road">Loading route</div>
  </div>
</div>
<div id="map-wrap"><div id="map"></div></div>
<div id="bottom-bar">
  <div style="text-align:center">
    <div id="eta-min">—</div>
    <div id="eta-lbl">MIN</div>
  </div>
  <div id="divider"></div>
  <div id="dist-box">
    <div id="dist-val">—</div>
    <div id="arrive-val">—</div>
  </div>
</div>
<button id="recenter-btn" onclick="recentre()">⊕</button>
<script>
const fLL=${fLL}, tLL=${tLL}, rLL=${rLL};
const map=L.map('map',{rotate:true,bearing:0,zoomControl:false,attributionControl:false}).setView([${cLat},${cLon}],18);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:20,subdomains:'abcd'}).addTo(map);
let routeOutline=null,routeLine=null,riderMarker=null,routeSteps=[],riderLL=rLL?L.latLng(rLL[0],rLL[1]):null,prevLL=null,bearing=0,autoFollow=true;
function fmtDist(m){return m<1000?Math.round(m/10)*10+' m':(m/1000).toFixed(1)+' km'}
function fmtMin(s){const m=Math.round(s/60);return m<60?m:Math.floor(m/60)+'h '+(m%60)+'m'}
function arrTime(s){const d=new Date(Date.now()+s*1000);return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function calcBearing(a,b){
  const r=Math.PI/180,φ1=a.lat*r,φ2=b.lat*r,Δλ=(b.lng-a.lng)*r;
  const y=Math.sin(Δλ)*Math.cos(φ2),x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return(Math.atan2(y,x)*180/Math.PI+360)%360;
}
function maneuverArrow(type,mod){
  if(!type||type==='depart'||type==='new name')return'↑';
  if(type==='arrive')return'⬤';
  if(type==='roundabout'||type==='rotary')return'↻';
  if(!mod)return'↑';
  if(mod.includes('sharp right'))return'↱';
  if(mod.includes('right'))return'→';
  if(mod.includes('sharp left'))return'↰';
  if(mod.includes('left'))return'←';
  if(mod.includes('uturn'))return'↩';
  return'↑';
}
function makeRiderIcon(){
  return L.divIcon({className:'',html:'<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.9))">🏍️</div>',iconSize:[32,26],iconAnchor:[16,13]});
}
function updateNav(){
  if(!riderLL||!routeSteps.length)return;
  let nearI=0,nearD=Infinity;
  routeSteps.forEach((s,i)=>{
    if(!s.maneuver)return;
    const d=riderLL.distanceTo(L.latLng(s.maneuver.location[1],s.maneuver.location[0]));
    if(d<nearD){nearD=d;nearI=i;}
  });
  const next=routeSteps[Math.min(nearI+1,routeSteps.length-1)];
  document.getElementById('nav-icon').textContent=maneuverArrow(next?.maneuver?.type,next?.maneuver?.modifier);
  document.getElementById('nav-dist').textContent=fmtDist(nearD);
  document.getElementById('nav-road').textContent=next?.name||routeSteps[nearI]?.name||'Continue';
}
function placeRider(lat,lon){
  const ll=L.latLng(lat,lon);
  if(prevLL){bearing=calcBearing(prevLL,ll);}
  prevLL=riderLL; riderLL=ll;
  if(riderMarker){riderMarker.setLatLng(ll);}
  else{riderMarker=L.marker(ll,{icon:makeRiderIcon(),zIndexOffset:1000}).addTo(map);}
  if(autoFollow){
    map.setBearing(bearing,{animate:false});
    map.setView(ll,18,{animate:true,duration:0.8,easeLinearity:0.5,noMoveStart:true});
  }
  updateNav();
}
async function drawRoute(from,to){
  try{
    const url='https://router.project-osrm.org/route/v1/driving/'+from[1]+','+from[0]+';'+to[1]+','+to[0]+'?geometries=geojson&steps=true&overview=full';
    const data=await(await fetch(url)).json();
    const route=data.routes[0];
    const coords=route.geometry.coordinates.map(c=>[c[1],c[0]]);
    routeSteps=route.legs.flatMap(l=>l.steps);
    if(routeOutline)map.removeLayer(routeOutline);
    if(routeLine)map.removeLayer(routeLine);
    routeOutline=L.polyline(coords,{color:'#fff',weight:11,opacity:0.5}).addTo(map);
    routeLine=L.polyline(coords,{color:'#1565c0',weight:7,opacity:1}).addTo(map);
    document.getElementById('eta-min').textContent=fmtMin(route.duration);
    document.getElementById('dist-val').textContent=fmtDist(route.distance);
    document.getElementById('arrive-val').textContent='Arrive ~'+arrTime(route.duration);
    if(routeSteps.length>1){
      const s=routeSteps[1];
      document.getElementById('nav-icon').textContent=maneuverArrow(s?.maneuver?.type,s?.maneuver?.modifier);
      document.getElementById('nav-dist').textContent=fmtDist(routeSteps[0]?.distance||0);
      document.getElementById('nav-road').textContent=s?.name||'Head towards destination';
    }
    if(!riderLL)map.fitBounds(L.latLngBounds(coords),{padding:[80,60],maxZoom:17});
  }catch(e){document.getElementById('nav-road').textContent='Route unavailable';}
}
function recentre(){
  autoFollow=true;
  if(riderLL){map.setBearing(bearing,{animate:false});map.setView(riderLL,18,{animate:true});}
}
map.on('dragstart',()=>{autoFollow=false;});
if(fLL){
  L.marker(fLL,{icon:L.divIcon({className:'',html:'<div style="width:18px;height:18px;background:#c8f000;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);
}
if(tLL){
  L.marker(tLL,{icon:L.divIcon({className:'',html:'<div style="width:18px;height:18px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);
}
if(fLL&&tLL)drawRoute(fLL,tLL);
if(rLL)placeRider(rLL[0],rLL[1]);
window.addEventListener('message',e=>{
  const d=e.data; if(!d)return;
  if(d.type==='riderPos')placeRider(d.lat,d.lon);
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
    customerPhone: o.customer_phone || null,
    userId: o.user_id || null,
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

// ─── Rider Query Form ─────────────────────────────────────────────────────
const QUERY_TYPES = ['Payment Issue', 'Technical Issue', 'Order Issue', 'Account Issue', 'Other'];

function RiderQueryForm({ userId, showToast }) {
  const [qType, setQType]       = useState('Other');
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);

  const submit = async () => {
    if (!message.trim()) { showToast('Please describe your issue'); return; }
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('support_tickets').insert([{
      user_id:    user?.id,
      user_name:  user?.user_metadata?.name || user?.email?.split('@')[0] || 'Rider',
      user_email: user?.email || '',
      role:       'rider',
      type:       qType,
      subject:    subject.trim() || qType,
      message:    message.trim(),
      status:     'open',
    }]);
    setSending(false);
    if (error) { showToast('Failed to send — try again'); return; }
    setSent(true);
    showToast('Query submitted ✓');
    setSubject(''); setMessage(''); setQType('Other');
  };

  if (sent) {
    return (
      <View style={rq.sentCard}>
        <Ionicons name="checkmark-circle" size={28} color={LIME} />
        <View style={{ flex: 1 }}>
          <Text style={rq.sentTitle}>Query Submitted</Text>
          <Text style={rq.sentSub}>We'll reply to your registered email within 24 hours.</Text>
        </View>
        <TouchableOpacity onPress={() => setSent(false)}>
          <Text style={{ color: LIME, fontSize: 13, fontWeight: '700' }}>New</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={rq.card}>
      {/* Type chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {QUERY_TYPES.map(t => (
          <TouchableOpacity key={t} style={[rq.chip, qType === t && rq.chipActive]} onPress={() => setQType(t)}>
            <Text style={[rq.chipTxt, qType === t && rq.chipTxtActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TextInput
        style={rq.input}
        placeholder="Subject (optional)"
        placeholderTextColor={GREY}
        value={subject}
        onChangeText={setSubject}
      />
      <TextInput
        style={[rq.input, { minHeight: 90, textAlignVertical: 'top', marginTop: 10 }]}
        placeholder="Describe your issue in detail…"
        placeholderTextColor={GREY}
        multiline
        value={message}
        onChangeText={setMessage}
      />
      <TouchableOpacity
        style={[rq.submitBtn, sending && { opacity: 0.6 }]}
        onPress={submit}
        disabled={sending}
        activeOpacity={0.85}
      >
        {sending
          ? <ActivityIndicator color={BG} size="small" />
          : <><Ionicons name="send-outline" size={16} color={BG} /><Text style={rq.submitTxt}>Send Query</Text></>
        }
      </TouchableOpacity>
    </View>
  );
}

const rq = StyleSheet.create({
  card:       { backgroundColor: SURFACE, borderRadius: 16, padding: 16, gap: 0, marginBottom: 4 },
  chip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: MUTED },
  chipActive: { backgroundColor: LIME + '20', borderColor: LIME },
  chipTxt:    { fontSize: 12, fontWeight: '600', color: GREY },
  chipTxtActive:{ color: LIME },
  input:      { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: MUTED },
  submitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 12, height: 46, marginTop: 12 },
  submitTxt:  { color: BG, fontWeight: '800', fontSize: 14 },
  sentCard:   { backgroundColor: SURFACE, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sentTitle:  { fontSize: 14, fontWeight: '800', color: '#fff' },
  sentSub:    { fontSize: 12, color: GREY, marginTop: 2 },
});

// SA banks — branch codes + brand colours + PayShap support flag
const SA_BANKS = [
  { name: 'ABSA',           branch: '632005', color: '#d42e12', payshap: true  },
  { name: 'Standard Bank',  branch: '051001', color: '#009DE0', payshap: true  },
  { name: 'FNB',            branch: '250655', color: '#00B4A0', payshap: true  },
  { name: 'Nedbank',        branch: '198765', color: '#009A44', payshap: true  },
  { name: 'Capitec Bank',   branch: '470010', color: '#1a4aa8', payshap: true  },
  { name: 'Investec Bank',  branch: '580105', color: '#1a2c5b', payshap: true  },
  { name: 'African Bank',   branch: '430000', color: '#E87722', payshap: false },
  { name: 'Discovery Bank', branch: '679000', color: '#8B1A8B', payshap: false },
  { name: 'TymeBank',       branch: '678910', color: '#00B2A9', payshap: false },
  { name: 'Old Mutual Bank',branch: '642005', color: '#006400', payshap: false },
];

// ─── PaymentMethodCard (inline component) ────────────────────────────────
function PaymentMethodCard({ method, onSetDefault, onEdit, onDelete }) {
  const bank = SA_BANKS.find(b => b.name === method.bank);
  const accent = method.type === 'instant_pay' ? '#c8f000' : (bank?.color || '#444');
  const isInstant = method.type === 'instant_pay';
  return (
    <View style={[pm.card, { borderLeftColor: accent }]}>
      <View style={pm.cardTop}>
        <View style={[pm.iconWrap, { backgroundColor: accent + '22' }]}>
          <Ionicons name={isInstant ? 'flash' : 'card-outline'} size={20} color={accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={pm.bankName}>{isInstant ? 'Instant Pay' : method.bank}</Text>
            {method.default && (
              <View style={pm.defaultBadge}>
                <Text style={pm.defaultTxt}>Default</Text>
              </View>
            )}
            {isInstant && (
              <View style={pm.instantBadge}>
                <Ionicons name="flash" size={9} color="#080808" />
                <Text style={pm.instantTxt}>Same-day</Text>
              </View>
            )}
          </View>
          {isInstant ? (
            <Text style={pm.detail}>{method.phone}  ·  {method.bank} (PayShap)</Text>
          ) : (
            <>
              <Text style={pm.detail}>****{(method.account || '').slice(-4)}  ·  {method.accountType}</Text>
              <Text style={pm.detail}>{method.accountHolder}</Text>
            </>
          )}
        </View>
      </View>
      <View style={pm.actions}>
        {!method.default && (
          <TouchableOpacity style={pm.actionChip} onPress={onSetDefault}>
            <Text style={pm.actionChipTxt}>Set default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={pm.actionIcon} onPress={onEdit}>
          <Ionicons name="create-outline" size={16} color="#666" />
        </TouchableOpacity>
        {!method.default && (
          <TouchableOpacity style={pm.actionIcon} onPress={onDelete}>
            <Ionicons name="trash-outline" size={16} color="#ef4444aa" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const pm = StyleSheet.create({
  card: { backgroundColor: '#111', borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bankName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  detail: { fontSize: 12, color: '#777', fontWeight: '500' },
  defaultBadge: { backgroundColor: '#c8f00020', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  defaultTxt: { fontSize: 10, fontWeight: '700', color: '#c8f000' },
  instantBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#c8f000', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  instantTxt: { fontSize: 10, fontWeight: '800', color: '#080808' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  actionChip: { backgroundColor: '#1e1e1e', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#333' },
  actionChipTxt: { fontSize: 11, fontWeight: '600', color: '#aaa' },
  actionIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a', borderRadius: 8 },
  typeBtn: { flex: 1, backgroundColor: '#181818', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#2a2a2a' },
  typeBtnActive: { backgroundColor: '#c8f000', borderColor: '#c8f000' },
  typeBtnTxt: { fontSize: 13, fontWeight: '800', color: '#aaa' },
  typeBtnSub: { fontSize: 10, color: '#555', fontWeight: '500' },
});

// ─── Main screen ──────────────────────────────────────────────────────────

export default function RiderScreen({ navigation }) {
  const [online, setOnline] = useState(false);
  const [earnings, setEarnings] = useState(0);
  const [trips, setTrips] = useState(0);
  const [avgRating, setAvgRating] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [userName, setUserName] = useState('');
  const [greetingText, setGreetingText] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const _setActiveJob = (job) => { activeJobRef.current = job; setActiveJob(job); };
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
  const [showCashout, setShowCashout] = useState(false);
  const [cashoutForm, setCashoutForm] = useState({ amount: '' });
  const [cashoutLoading, setCashoutLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // ── Payment methods ──
  const [paymentMethods, setPaymentMethods]   = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payFormType, setPayFormType]         = useState('bank_eft'); // 'bank_eft' | 'instant_pay'
  const [payForm, setPayForm]                 = useState({ bank: '', accountHolder: '', account: '', branch: '', accountType: 'cheque', phone: '' });
  const [payFormSaving, setPayFormSaving]     = useState(false);
  const [editingPayId, setEditingPayId]       = useState(null);
  const [discInfo, setDiscInfo] = useState(null); // { expiry: Date, daysLeft: number }
  const [cancelLoading, setCancelLoading] = useState(false);
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [completionRate, setCompletionRate] = useState(null);
  const locationIntervalRef = useRef(null);
  const sub = useRef(null);
  const riderLocRef = useRef(null);      // current rider position (for proximity)
  const passiveWatchRef = useRef(null);  // web geolocation watchId
  const riderTripMapRef = useRef(null);  // iframe/WebView ref for active-trip map
  const activeJobRef = useRef(null);     // mirror of activeJob for subscription closures

  // ── Swipe-up sheet ──────────────────────────────────────────────────────
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetExpandedRef = useRef(false);  // mirror for responder closures
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const sheetDragStart = useRef(null);
  const sheetDragBase  = useRef(0);

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
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user;
      const uid = user?.id || null;
      setUserId(uid);
      if (uid) loadEarnings(uid);
      const meta = user?.user_metadata || {};
      setUserName(meta.name || '');
      setGreetingText(getSmartGreeting(user));
      // Load payment methods — migrate legacy flat fields if needed
      if (Array.isArray(meta.payment_methods) && meta.payment_methods.length > 0) {
        setPaymentMethods(meta.payment_methods);
      } else if (meta.bank_name) {
        const migrated = [{
          id: 'pm_legacy',
          type: 'bank_eft',
          default: true,
          bank: meta.bank_name,
          accountHolder: meta.account_holder || '',
          account: meta.account_number || '',
          branch: meta.branch_code || '',
          accountType: meta.account_type || 'cheque',
        }];
        setPaymentMethods(migrated);
        // Persist migrated format
        supabase.auth.updateUser({ data: { payment_methods: migrated } });
      }

      // Load disc expiry from verification record
      if (uid) {
        const { data: verif } = await supabase
          .from('rider_verifications')
          .select('disc_expiry')
          .eq('rider_id', uid)
          .maybeSingle();
        if (verif?.disc_expiry) {
          const exp = new Date(verif.disc_expiry);
          const days = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
          setDiscInfo({ expiry: exp, daysLeft: days });
        }
      }

      // ── Restore active trip if rider closed app mid-delivery ──────────────
      if (uid) {
        const { data: activeOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('rider_id', uid)
          .eq('status', 'on_the_way')
          .maybeSingle();

        if (activeOrder) {
          const restoredJob = formatOrder(activeOrder);
          _setActiveJob(restoredJob);
          setView('active');
          setOnline(true);
          startLocationBroadcast(restoredJob);
          showToast('Trip restored — you\'re still on a delivery.');
        }
      }
    });
  }, []);

  const registerPush = async (uid) => {
    if (Platform.OS !== 'web') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      // Fetch VAPID public key from server
      const pkRes = await fetch('/api/vapid-pubkey');
      const { publicKey } = await pkRes.json();
      if (!publicKey) return; // VAPID not configured yet

      // Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Ask for permission (only prompts if not yet decided)
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Convert VAPID public key to Uint8Array
      const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const appKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) appKey[i] = rawData.charCodeAt(i);

      // Subscribe (or reuse existing subscription)
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });

      // Upsert subscription to Supabase
      await supabase.from('push_subscriptions').upsert(
        { user_id: uid, role: 'rider', subscription: JSON.parse(JSON.stringify(sub)) },
        { onConflict: 'user_id' }
      );
    } catch (e) {
      console.warn('Push registration skipped:', e?.message);
    }
  };

  useEffect(() => {
    if (!online) {
      setJobs([]);
      sub.current?.unsubscribe();
      stopPassiveLocation();
      return;
    }
    if (userId) registerPush(userId);
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
        // ── Active job was cancelled or reset — kick rider back to home ───────
        if (activeJobRef.current?.id === p.new.id) {
          if (p.new.status === 'cancelled') {
            stopLocationBroadcast();
            _setActiveJob(null);
            setPinInput('');
            setPinError(false);
            setView('home');
            showToast('This order was cancelled by admin.');
            return;
          }
          if (p.new.status === 'pending' && p.old?.status === 'on_the_way') {
            // Customer cancelled while rider was en route — reset to home
            stopLocationBroadcast();
            _setActiveJob(null);
            setPinInput('');
            setPinError(false);
            setView('home');
            playAlert();
            showToast('Customer cancelled — order returned to the queue.');
            return;
          }
        }
        if (p.new.status !== 'pending') {
          // Order no longer available — remove from job list
          setJobs(prev => prev.filter(j => j.id !== p.new.id));
        } else {
          // Order became pending again (e.g. rider breakdown reassignment)
          const incoming = applyProximity(formatOrder(p.new));
          if (!riderLocRef.current || !incoming._tooFar) {
            setJobs(prev => prev.some(j => j.id === incoming.id) ? prev : [incoming, ...prev]);
            playAlert();
            setNewJobAlert(incoming);
          }
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

  const expandSheet = () => {
    sheetExpandedRef.current = true;
    setSheetExpanded(true);
    Animated.spring(sheetAnim, { toValue: 1, tension: 72, friction: 13, useNativeDriver: false }).start();
  };
  const collapseSheet = () => {
    sheetExpandedRef.current = false;
    setSheetExpanded(false);
    Animated.spring(sheetAnim, { toValue: 0, tension: 72, friction: 13, useNativeDriver: false }).start();
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
      // Platform takes 20%, rider keeps 80% of delivery fee. Tip is 100% rider.
      const earn = (parseFloat(o.price) || 0) * 0.8 + (parseFloat(o.tip) || 0);
      const dow = (d.getDay() + 6) % 7;
      week[dow] += earn;
      if (d >= today) { todayTotal += earn; todayTrips++; }
    });
    setEarnings(todayTotal);
    setTrips(todayTrips);
    setEarningsHistory({ today: todayTotal, trips: todayTrips, week });
    setDeliveryHistory(data);

    // All-time average rating + completion rate (parallel)
    const [{ data: ratingRows }, { data: allDelivered }, { data: cancelledRows }, { data: payoutRows }] = await Promise.all([
      supabase.from('orders').select('rating').eq('rider_id', id).eq('status', 'delivered').not('rating', 'is', null),
      supabase.from('orders').select('id').eq('rider_id', id).eq('status', 'delivered'),
      supabase.from('orders').select('id').eq('rider_id', id).eq('status', 'cancelled'),
      supabase.from('payout_requests').select('*').eq('rider_id', id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (ratingRows?.length) {
      const avg = ratingRows.reduce((s, o) => s + (o.rating || 0), 0) / ratingRows.length;
      setAvgRating(avg.toFixed(1));
    }
    // Completion rate: all-time delivered vs all-time (delivered + cancelled)
    const totalDelivered = allDelivered?.length || 0;
    const totalCancelled = cancelledRows?.length || 0;
    const totalAll = totalDelivered + totalCancelled;
    setCompletionRate(totalAll > 0 ? Math.round((totalDelivered / totalAll) * 100) : 100);
    if (payoutRows) setPayoutRequests(payoutRows);
  };

  const startLocationBroadcast = (job) => {
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

  const handleBreakdown = async () => {
    if (activeJob) {
      await supabase.from('orders').update({
        status: 'pending',
        rider_id: null,
        rider_name: null,
        rider_phone: null,
      }).eq('id', activeJob.id);
    }
    stopLocationBroadcast();
    _setActiveJob(null);
    setPinInput('');
    setPinError(false);
    setView('home');
    showToast('Breakdown reported — finding another rider for your customer.');
  };

  const handleCancelTrip = async () => {
    setCancelLoading(true);
    if (activeJob) {
      await supabase.from('orders').update({
        status: 'pending',
        rider_id: null,
        rider_name: null,
        rider_phone: null,
      }).eq('id', activeJob.id);
    }
    stopLocationBroadcast();
    _setActiveJob(null);
    setPinInput('');
    setPinError(false);
    setCancelLoading(false);
    setShowCancelConfirm(false);
    setView('home');
    showToast('Trip cancelled — order returned to queue');
  };

  // ── Push a status notification to the customer (fire-and-forget) ──────────
  const notifyCustomer = async (customerUserId, title, body, tag) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: customerUserId, title, body, tag }),
      }).catch(() => {});
    } catch (_) {}
  };

  const acceptJob = async (job) => {
    const { data: { user } } = await supabase.auth.getUser();
    const riderName = user?.user_metadata?.name || 'Your rider';
    const riderPhone = user?.user_metadata?.phone || null;
    const { error, count } = await supabase
      .from('orders')
      .update({ status: 'on_the_way', rider_id: userId, rider_name: riderName, rider_phone: riderPhone })
      .eq('id', job.id)
      .eq('status', 'pending') // prevent race — only accept if still unclaimed
      .select('id', { count: 'exact', head: true });
    if (error || count === 0) {
      showToast('Order was just taken — check the jobs list');
      setJobs(p => p.filter(j => j.id !== job.id));
      return;
    }
    _setActiveJob(job);
    setJobs(p => p.filter(j => j.id !== job.id));
    setPinInput('');
    setPinError(false);
    collapseSheet();
    startLocationBroadcast(job);
    setView('active');
    // Notify customer their rider is on the way
    if (job.user_id) {
      notifyCustomer(
        job.user_id,
        '🏍️ Rider on the way!',
        `${riderName} has accepted your delivery and is heading to pick it up.`,
        'runit-accepted',
      );
    }
  };

  const confirmDelivery = async () => {
    if (!activeJob) return;
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
    await supabase.from('orders').update({ status: 'delivered' })
      .eq('id', activeJob.id)
      .eq('rider_id', userId); // only the assigned rider can confirm delivery
    stopLocationBroadcast();
    const done = { ...activeJob };
    // Notify customer their package was delivered
    if (done.user_id) {
      notifyCustomer(
        done.user_id,
        '✅ Delivered!',
        'Your package has been delivered. Thank you for using RunIt!',
        'runit-delivered',
      );
    }
    setCompletedJob(done);
    _setActiveJob(null);
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

  // ── Payment method helpers ────────────────────────────────────────────
  const savePaymentMethod = async () => {
    const isInstant = payFormType === 'instant_pay';
    if (!payForm.bank || !payForm.accountHolder) {
      showToast('Bank and account holder are required'); return;
    }
    if (isInstant && !payForm.phone) { showToast('Phone number is required'); return; }
    if (!isInstant && !payForm.account) { showToast('Account number is required'); return; }

    setPayFormSaving(true);
    const id = editingPayId || `pm_${Date.now()}`;
    const updated = {
      id, type: payFormType,
      default: editingPayId
        ? (paymentMethods.find(m => m.id === editingPayId)?.default ?? false)
        : paymentMethods.length === 0, // first method becomes default
      bank: payForm.bank,
      accountHolder: payForm.accountHolder,
      ...(isInstant
        ? { phone: payForm.phone }
        : { account: payForm.account, branch: payForm.branch, accountType: payForm.accountType }),
    };
    const next = editingPayId
      ? paymentMethods.map(m => m.id === editingPayId ? updated : m)
      : [...paymentMethods, updated];

    await supabase.auth.updateUser({ data: { payment_methods: next } });
    setPaymentMethods(next);
    setPayFormSaving(false);
    setShowPaymentModal(false);
    showToast(editingPayId ? 'Payment method updated.' : 'Payment method added.');
  };

  const deletePaymentMethod = async (id) => {
    const next = paymentMethods.filter(m => m.id !== id);
    // If deleted was default, promote first remaining
    if (next.length > 0 && !next.some(m => m.default)) next[0].default = true;
    await supabase.auth.updateUser({ data: { payment_methods: next } });
    setPaymentMethods(next);
  };

  const setDefaultMethod = async (id) => {
    const next = paymentMethods.map(m => ({ ...m, default: m.id === id }));
    await supabase.auth.updateUser({ data: { payment_methods: next } });
    setPaymentMethods(next);
  };

  const submitCashout = async () => {
    const { amount } = cashoutForm;
    if (!amount || isNaN(parseFloat(amount))) { showToast('Enter a valid amount'); return; }
    const dm = paymentMethods.find(m => m.default) || paymentMethods[0];
    if (!dm) {
      showToast('Add a payment method first');
      setShowCashout(false);
      setView('payments');
      return;
    }
    setCashoutLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const bankName = dm.type === 'instant_pay' ? `${dm.bank} (Instant Pay)` : dm.bank;
    const accountNum = dm.type === 'instant_pay' ? dm.phone : dm.account;
    const branchCode = dm.type === 'instant_pay' ? '' : (dm.branch || '');
    const { error } = await supabase.from('payout_requests').insert([{
      rider_id:       userId,
      rider_name:     user?.user_metadata?.name || '',
      rider_email:    user?.email || '',
      amount:         parseFloat(amount),
      bank_name:      bankName,
      account_number: accountNum,
      account_holder: dm.accountHolder || '',
      account_type:   dm.accountType   || '',
      branch_code:    branchCode,
      status:         'pending',
    }]);
    setCashoutLoading(false);
    if (error) { showToast('Failed to submit — try again'); return; }
    showToast('Cashout request submitted.');
    setShowCashout(false);
    setCashoutForm({ amount: '' });
    loadEarnings(userId); // refresh payout history
  };

  const activeTab = (view === 'earnings' || view === 'payments') ? 'earnings' : view === 'jobs' ? 'jobs' : 'home';
  const defaultPayMethod = paymentMethods.find(m => m.default) || paymentMethods[0] || null;
  const weekAmts = earningsHistory.week;
  const maxAmt = Math.max(...weekAmts, 1); // prevent divide-by-zero when all zeros

  return (
    <View style={s.container}>
      <StatusBar style={view === 'active' ? 'dark' : 'light'} />
      {view !== 'active' && <TopBar userName={userName} greetingText={greetingText} onLogoPress={() => setView('home')} />}

      {/* ── Floating SOS button — always visible ── */}
      <SOSButton activeJob={activeJob} onBreakdown={handleBreakdown} />

      {/* ── New job alert banner ── */}
      {online && newJobAlert && view !== 'active' && (
        <JobBanner
          job={newJobAlert}
          onAccept={() => { setNewJobAlert(null); acceptJob(newJobAlert); }}
          onDismiss={() => setNewJobAlert(null)}
        />
      )}

      {/* ── ACTIVE DELIVERY (full-screen map + swipe-up pill) ── */}
      {view === 'active' && activeJob && (() => {
        const sheetHeight = sheetAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [SHEET_COLLAPSED, SHEET_EXPANDED],
          extrapolate: 'clamp',
        });
        return (
          <View style={s.tripScreen}>

            {/* ── Map: fills the entire tripScreen ── */}
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
              {/* Floating EN ROUTE chip */}
              <View style={s.tripStatusChip}>
                <View style={s.tripStatusDot} />
                <Text style={s.tripStatusTxt}>EN ROUTE</Text>
              </View>
            </View>

            {/* ── Swipe-up sheet ── */}
            <Animated.View style={[s.tripSheet, { height: sheetHeight }]}>

              {/* ─ Drag handle zone ─ */}
              <View
                style={s.tripSheetHandle}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  sheetDragStart.current = e.nativeEvent.pageY;
                  sheetDragBase.current  = sheetExpandedRef.current ? SHEET_EXPANDED : SHEET_COLLAPSED;
                }}
                onResponderMove={(e) => {
                  const dy   = sheetDragStart.current - e.nativeEvent.pageY; // +ve = swipe up
                  const next = Math.max(SHEET_COLLAPSED, Math.min(SHEET_EXPANDED, sheetDragBase.current + dy));
                  sheetAnim.setValue((next - SHEET_COLLAPSED) / (SHEET_EXPANDED - SHEET_COLLAPSED));
                }}
                onResponderRelease={(e) => {
                  const dy = sheetDragStart.current - e.nativeEvent.pageY;
                  if      (dy >  28) expandSheet();
                  else if (dy < -28) collapseSheet();
                  else               sheetExpandedRef.current ? collapseSheet() : expandSheet();
                }}
              >
                {/* Pill bar */}
                <View style={s.tripPillBar} />
                {/* Destination peek — always visible */}
                <View style={s.tripSheetPeek}>
                  <View style={[s.tripDot, { backgroundColor: '#ef4444', flexShrink: 0 }]} />
                  <Text style={s.tripSheetPeekAddr} numberOfLines={1}>{activeJob.to}</Text>
                  <Ionicons
                    name={sheetExpanded ? 'chevron-down' : 'chevron-up'}
                    size={16}
                    color={GREY}
                  />
                </View>
              </View>

              {/* ─ Scrollable detail content ─ */}
              <ScrollView
                style={s.tripSheetScroll}
                contentContainerStyle={s.tripSheetScrollContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={sheetExpanded}
                bounces={false}
                keyboardShouldPersistTaps="always"
              >
                {/* Full route */}
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

                {/* WhatsApp customer */}
                {activeJob.customerPhone ? (
                  <TouchableOpacity
                    style={s.waBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      const msg = encodeURIComponent(
                        `Hi! I'm ${userName} from RunIt. I've accepted your delivery and I'm on my way to collect the package. See you soon!`
                      );
                      const phone = activeJob.customerPhone.replace(/\D/g, '');
                      const intl  = phone.startsWith('0') ? '27' + phone.slice(1) : phone;
                      Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={17} color="#fff" />
                    <Text style={s.waBtnTxt}>Message customer on WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}

                {/* PIN entry */}
                <View style={s.tripPinRow}>
                  <Text style={s.tripPinLbl}>RECIPIENT PIN</Text>
                  <TouchableOpacity style={s.pinBoxRow} onPress={() => pinInputRef.current?.focus()} activeOpacity={1}>
                    {[0, 1, 2, 3].map(i => (
                      <View key={i} style={[s.pinBox, pinInput.length === i && s.pinBoxActive, pinError && s.pinBoxError]}>
                        <Text style={[s.pinDigit, pinError && { color: '#ef4444' }]}>{pinInput[i] || ''}</Text>
                      </View>
                    ))}
                  </TouchableOpacity>
                  <TextInput
                    ref={pinInputRef}
                    style={s.pinHiddenInput}
                    value={pinInput}
                    onChangeText={v => { setPinInput(v.replace(/\D/g, '').slice(0, 4)); setPinError(false); }}
                    keyboardType="numeric"
                    maxLength={4}
                  />
                  {pinError && <Text style={s.pinErrorTxt}>Incorrect PIN — try again</Text>}
                </View>

                <TouchableOpacity
                  style={[s.deliveredBtn, pinInput.length < 4 && { opacity: 0.4 }]}
                  onPress={confirmDelivery}
                  disabled={pinInput.length < 4}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color={BG} />
                  <Text style={s.deliveredBtnTxt}>Confirm Delivery</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.backToHomeBtn} onPress={() => setShowCancelConfirm(true)} activeOpacity={0.7}>
                  <Text style={s.backToHomeTxt}>Cancel trip</Text>
                </TouchableOpacity>
              </ScrollView>

            </Animated.View>

          </View>
        );
      })()}

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
            <View style={{ flex: 1 }}>
              <Text style={s.greetLabel}>RIDER DASHBOARD</Text>
              <Text style={s.greetTitle}>{userName ? `Hey, ${userName.split(' ')[0]}!` : 'Ready to earn?'}</Text>
            </View>
            <View style={s.ratingPill}>
              <Ionicons name="star" size={13} color={AMBER} />
              <Text style={s.ratingTxt}>{avgRating ?? '—'}</Text>
            </View>
          </View>

          {/* Earnings hero */}
          <View style={s.earningsHeroCard}>
            <Text style={s.earningsHeroLabel}>TODAY'S EARNINGS</Text>
            <Text style={s.earningsHeroAmt}>
              <Text style={s.earningsHeroCurr}>R</Text>
              {earnings}
            </Text>
            <View style={s.earningsHeroMeta}>
              <View style={s.earningsHeroStat}>
                <Ionicons name="bicycle-outline" size={13} color={GREY} />
                <Text style={s.earningsHeroStatTxt}>{trips} trip{trips !== 1 ? 's' : ''}</Text>
              </View>
              {avgRating && (
                <>
                  <View style={s.earningsHeroSep} />
                  <View style={s.earningsHeroStat}>
                    <Ionicons name="star" size={12} color={AMBER} />
                    <Text style={s.earningsHeroStatTxt}>{avgRating} rating</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[s.onlineCard, online && s.onlineCardActive]}
            onPress={async () => {
              if (!online) {
                // Check suspension & disc before going online
                if (userId) {
                  const { data: verif } = await supabase
                    .from('rider_verifications')
                    .select('status, disc_expiry')
                    .eq('rider_id', userId)
                    .maybeSingle();
                  if (verif?.status === 'suspended') {
                    showToast('Your account is suspended — contact support');
                    return;
                  }
                }
                if (discInfo && discInfo.daysLeft < 0) {
                  showToast('License disc expired — renew before going online');
                  return;
                }
                if (discInfo && discInfo.daysLeft <= 7) {
                  showToast(`Disc expires in ${discInfo.daysLeft} day${discInfo.daysLeft === 1 ? '' : 's'} — renew soon.`);
                }
              }
              setOnline(!online);
            }}
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

          {/* Disc status strip */}
          {discInfo && (
            <View style={[s.discStrip, {
              backgroundColor: discInfo.daysLeft < 0 ? '#ef444415' : discInfo.daysLeft <= 30 ? '#f59e0b15' : '#22c55e10',
              borderColor: discInfo.daysLeft < 0 ? '#ef444430' : discInfo.daysLeft <= 30 ? '#f59e0b30' : '#22c55e25',
            }]}>
              <Ionicons
                name={discInfo.daysLeft < 0 ? 'close-circle' : discInfo.daysLeft <= 30 ? 'warning' : 'shield-checkmark'}
                size={14}
                color={discInfo.daysLeft < 0 ? '#ef4444' : discInfo.daysLeft <= 30 ? '#f59e0b' : '#22c55e'}
              />
              <Text style={[s.discStripTxt, {
                color: discInfo.daysLeft < 0 ? '#ef4444' : discInfo.daysLeft <= 30 ? '#f59e0b' : '#22c55e',
              }]}>
                {discInfo.daysLeft < 0
                  ? `Disc expired ${Math.abs(discInfo.daysLeft)} day${Math.abs(discInfo.daysLeft) === 1 ? '' : 's'} ago — go online blocked`
                  : discInfo.daysLeft <= 30
                  ? `Disc expires in ${discInfo.daysLeft} day${discInfo.daysLeft === 1 ? '' : 's'} — renew soon`
                  : `Disc valid · expires ${discInfo.expiry.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}`}
              </Text>
            </View>
          )}

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
              <Ionicons name="navigate-circle-outline" size={48} color={LIME} style={{ marginBottom: 12 }} />
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
              <Ionicons name="navigate-circle-outline" size={48} color={LIME} style={{ marginBottom: 12 }} />
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
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <View style={[s.jobMetaChip, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                      <Ionicons name={job.size === 'large' ? 'archive-outline' : 'cube-outline'} size={11} color={GREY} />
                      <Text style={s.jobMetaTxt}>{job.size === 'large' ? 'Large' : 'Small'}</Text>
                    </View>
                    <View style={s.jobMetaChip}>
                      <Text style={s.jobMetaTxt}>{job.km} km · ~{job.time} min</Text>
                    </View>
                    {job.distToPickup != null && (
                      <View style={[s.jobMetaChip, { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: LIME + '40' }]}>
                        <Ionicons name="location" size={11} color={LIME} />
                        <Text style={[s.jobMetaTxt, { color: LIME }]}>{job.distToPickup} km away</Text>
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
            {/* Cash out + payment method row */}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
              <TouchableOpacity style={s.cashInstant} onPress={() => setShowCashout(true)}>
                <Ionicons name="arrow-up-circle" size={15} color={BG} />
                <Text style={s.cashInstantTxt}>Cash Out</Text>
                <Text style={s.cashInstantSub}>Request payout</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.cashInstant, { backgroundColor: '#141414', borderWidth: 1.5, borderColor: defaultPayMethod ? LIME + '35' : MUTED }]}
                onPress={() => setView('payments')}
                activeOpacity={0.8}
              >
                <Ionicons name="card-outline" size={15} color={defaultPayMethod ? LIME : GREY} />
                <Text style={[s.cashInstantTxt, { color: defaultPayMethod ? LIME : GREY }]} numberOfLines={1}>
                  {defaultPayMethod
                    ? (defaultPayMethod.type === 'instant_pay' ? 'Instant Pay' : defaultPayMethod.bank)
                    : 'Add Method'}
                </Text>
                <Text style={[s.cashInstantSub, { color: '#555' }]} numberOfLines={1}>
                  {defaultPayMethod
                    ? (defaultPayMethod.type === 'instant_pay'
                        ? defaultPayMethod.phone
                        : `****${(defaultPayMethod.account || '').slice(-4)}`)
                    : 'Tap to set up'}
                </Text>
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
                  <Text style={s.historyAmt}>R {((parseFloat(item.price) || 0) * 0.8 + (parseFloat(item.tip) || 0)).toFixed(0)}</Text>
                </View>
              ))}
            </>
          )}

          {deliveryHistory.length === 0 && (
            <View style={s.emptyState}>
              <Ionicons name="cube-outline" size={48} color={GREY} style={{ marginBottom: 12 }} />
              <Text style={s.emptyTitle}>No deliveries yet</Text>
              <Text style={s.emptySub}>Complete your first run to see history here</Text>
            </View>
          )}

          {/* Payout request history */}
          {payoutRequests.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 28 }]}>Payout Requests</Text>
              {payoutRequests.map((p, i) => {
                const statusColor = p.status === 'paid' ? GREEN : p.status === 'rejected' ? '#ef4444' : AMBER;
                const statusLabel = p.status === 'paid' ? 'Paid' : p.status === 'rejected' ? 'Rejected' : 'Pending';
                const statusIcon  = p.status === 'paid' ? 'checkmark-circle' : p.status === 'rejected' ? 'close-circle' : 'time-outline';
                return (
                  <View key={p.id || i} style={s.payoutRow}>
                    <View style={[s.payoutIcon, { backgroundColor: statusColor + '18' }]}>
                      <Ionicons name={statusIcon} size={16} color={statusColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.payoutBank}>
                        {p.bank_name || 'Bank payout'}
                        {p.account_number ? `  ·  ****${String(p.account_number).slice(-4)}` : ''}
                      </Text>
                      <Text style={s.payoutDate}>
                        {new Date(p.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={s.payoutAmt}>R {parseFloat(p.amount).toFixed(0)}</Text>
                      <Text style={[s.payoutStatus, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}

        </ScrollView>
      )}

      {/* ── PAYMENT METHODS ── */}
      {view === 'payments' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setView('earnings')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={s.pageTitle}>Payment <Text style={{ color: LIME }}>Methods</Text></Text>
          <Text style={[s.pageSub, { marginBottom: 20 }]}>
            Earnings are paid to your default method. Instant Pay settles same-day; EFT takes 1–3 business days.
          </Text>

          {paymentMethods.length === 0 && (
            <View style={s.emptyState}>
              <Ionicons name="card-outline" size={48} color={GREY} style={{ marginBottom: 12 }} />
              <Text style={s.emptyTitle}>No payment methods yet</Text>
              <Text style={s.emptySub}>Add a bank account or Instant Pay to start receiving payouts</Text>
            </View>
          )}

          {paymentMethods.map(m => (
            <PaymentMethodCard
              key={m.id}
              method={m}
              onSetDefault={() => setDefaultMethod(m.id)}
              onEdit={() => {
                setEditingPayId(m.id);
                setPayFormType(m.type);
                setPayForm({
                  bank: m.bank || '',
                  accountHolder: m.accountHolder || '',
                  account: m.account || '',
                  branch: m.branch || '',
                  accountType: m.accountType || 'cheque',
                  phone: m.phone || '',
                });
                setShowPaymentModal(true);
              }}
              onDelete={() => deletePaymentMethod(m.id)}
            />
          ))}

          <TouchableOpacity
            style={s.addMethodBtn}
            onPress={() => {
              setEditingPayId(null);
              setPayFormType('bank_eft');
              setPayForm({ bank: '', accountHolder: '', account: '', branch: '', accountType: 'cheque', phone: '' });
              setShowPaymentModal(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color={LIME} />
            <Text style={s.addMethodTxt}>Add payment method</Text>
          </TouchableOpacity>

          <View style={s.payInfoBox}>
            <Ionicons name="information-circle-outline" size={14} color={GREY} style={{ marginTop: 1 }} />
            <Text style={s.payInfoTxt}>
              Instant Pay uses PayShap and requires your bank to support it. Supported banks: ABSA, Standard Bank, FNB, Nedbank, Capitec, Investec.
            </Text>
          </View>
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
            <Text style={s.perfHeroVal}>{avgRating ?? '—'}</Text>
            <View style={s.perfStars}>
              {[1,2,3,4,5].map(i => {
                const r = parseFloat(avgRating) || 0;
                const name = i <= Math.floor(r) ? 'star' : i - 0.5 <= r ? 'star-half' : 'star-outline';
                return <Ionicons key={i} name={name} size={20} color={avgRating ? LIME : MUTED} />;
              })}
            </View>
            <Text style={s.perfHeroSub}>
              {avgRating ? 'Based on customer feedback' : 'Complete deliveries to earn a rating'}
            </Text>
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
            <Ionicons name="checkmark-circle" size={28} color={completionRate >= 90 ? GREEN : AMBER} />
            <View>
              <Text style={[s.perfHeroLabel, { marginBottom: 2 }]}>COMPLETION RATE</Text>
              <Text style={[s.perfHeroVal, { fontSize: 32, lineHeight: 36 }]}>
                {completionRate !== null ? `${completionRate}%` : '—'}
              </Text>
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
              <Ionicons name="receipt-outline" size={48} color={GREY} style={{ marginBottom: 12 }} />
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

          {/* Submit a Query */}
          <Text style={[s.sectionLabel, { marginTop: 28 }]}>Submit a Query</Text>
          <RiderQueryForm userId={userId} showToast={showToast} />

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

      {/* ── Cancel Trip Confirmation Modal ── */}
      <Modal visible={showCancelConfirm} transparent animationType="fade" onRequestClose={() => setShowCancelConfirm(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: 28 }]}>
            <View style={s.modalHandle} />
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ef444420', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Ionicons name="warning-outline" size={28} color="#ef4444" />
              </View>
              <Text style={[s.modalTitle, { marginBottom: 6 }]}>Cancel this trip?</Text>
              <Text style={[s.modalSub, { textAlign: 'center', lineHeight: 20 }]}>
                The order will go back to the queue and another rider can pick it up.
              </Text>
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowCancelConfirm(false)} disabled={cancelLoading}>
                <Text style={s.modalCancelTxt}>Keep trip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, { backgroundColor: '#ef4444' }, cancelLoading && { opacity: 0.6 }]}
                onPress={handleCancelTrip}
                disabled={cancelLoading}
              >
                {cancelLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[s.modalSubmitTxt, { color: '#fff' }]}>Yes, cancel</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Cashout Modal ── */}
      <Modal visible={showCashout} transparent animationType="slide" onRequestClose={() => setShowCashout(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Request Payout</Text>
            <Text style={s.modalSub}>Available: R {Math.round(earningsHistory.today)}</Text>

            {/* Default payment method summary */}
            {defaultPayMethod ? (
              <View style={s.bankSummaryCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bankSummaryBank}>
                    {defaultPayMethod.type === 'instant_pay' ? `Instant Pay · ${defaultPayMethod.bank}` : defaultPayMethod.bank}
                  </Text>
                  <Text style={s.bankSummaryDetail}>
                    {defaultPayMethod.type === 'instant_pay'
                      ? defaultPayMethod.phone
                      : `${defaultPayMethod.accountHolder}  •  ****${(defaultPayMethod.account || '').slice(-4)}`}
                  </Text>
                  {defaultPayMethod.type === 'bank_eft' && (
                    <Text style={s.bankSummaryDetail}>
                      {defaultPayMethod.accountType === 'savings' ? 'Savings' : defaultPayMethod.accountType === 'transmission' ? 'Transmission' : 'Cheque'}
                      {defaultPayMethod.branch ? `  •  ${defaultPayMethod.branch}` : ''}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => { setShowCashout(false); setView('payments'); }}>
                  <Text style={s.bankEditTxt}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.addBankBtn} onPress={() => { setShowCashout(false); setView('payments'); }}>
                <Ionicons name="add-circle-outline" size={18} color={LIME} />
                <Text style={s.addBankTxt}>Add a payment method to enable cashout</Text>
              </TouchableOpacity>
            )}

            <View style={s.modalField}>
              <Text style={s.modalFieldLabel}>Amount (ZAR)</Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. 150"
                placeholderTextColor={GREY}
                keyboardType="numeric"
                value={cashoutForm.amount}
                onChangeText={(v) => setCashoutForm({ amount: v })}
              />
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowCashout(false)}>
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, cashoutLoading && { opacity: 0.6 }]}
                onPress={submitCashout}
                disabled={cashoutLoading}
              >
                {cashoutLoading
                  ? <ActivityIndicator color={BG} size="small" />
                  : <Text style={s.modalSubmitTxt}>Submit Request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add / Edit Payment Method Modal ── */}
      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled">
          <View style={[s.modalSheet, { paddingBottom: 40 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{editingPayId ? 'Edit' : 'Add'} Payment Method</Text>

            {/* Type selector */}
            {!editingPayId && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {[
                  { id: 'bank_eft',    icon: 'card-outline', label: 'Bank EFT',     sub: '1–3 business days' },
                  { id: 'instant_pay', icon: 'flash',        label: 'Instant Pay',  sub: 'Same-day · PayShap' },
                ].map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[pm.typeBtn, payFormType === t.id && pm.typeBtnActive]}
                    onPress={() => setPayFormType(t.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={t.icon} size={18} color={payFormType === t.id ? BG : GREY} />
                    <Text style={[pm.typeBtnTxt, payFormType === t.id && { color: BG }]}>{t.label}</Text>
                    <Text style={[pm.typeBtnSub, payFormType === t.id && { color: BG + 'aa' }]}>{t.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Bank picker — EFT shows all, Instant Pay shows PayShap only */}
            <Text style={s.modalFieldLabel}>Bank</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {(payFormType === 'instant_pay' ? SA_BANKS.filter(b => b.payshap) : SA_BANKS).map((b) => (
                <TouchableOpacity
                  key={b.name}
                  style={[s.bankChip, payForm.bank === b.name && s.bankChipActive]}
                  onPress={() => setPayForm(f => ({ ...f, bank: b.name, branch: b.branch }))}
                >
                  <Text style={[s.bankChipTxt, payForm.bank === b.name && s.bankChipTxtActive]}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Account holder */}
            <View style={s.modalField}>
              <Text style={s.modalFieldLabel}>Account Holder Name</Text>
              <TextInput
                style={s.modalInput}
                placeholder="Full name as on bank account"
                placeholderTextColor={GREY}
                value={payForm.accountHolder}
                onChangeText={(v) => setPayForm(f => ({ ...f, accountHolder: v }))}
              />
            </View>

            {/* EFT-only fields */}
            {payFormType === 'bank_eft' && (
              <>
                <View style={s.modalField}>
                  <Text style={s.modalFieldLabel}>Account Number</Text>
                  <TextInput
                    style={s.modalInput}
                    placeholder="1234567890"
                    placeholderTextColor={GREY}
                    keyboardType="numeric"
                    value={payForm.account}
                    onChangeText={(v) => setPayForm(f => ({ ...f, account: v }))}
                  />
                </View>
                <Text style={s.modalFieldLabel}>Account Type</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {['cheque', 'savings', 'transmission'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[s.bankChip, { flex: 1, justifyContent: 'center' }, payForm.accountType === t && s.bankChipActive]}
                      onPress={() => setPayForm(f => ({ ...f, accountType: t }))}
                    >
                      <Text style={[s.bankChipTxt, payForm.accountType === t && s.bankChipTxtActive]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.modalField}>
                  <Text style={s.modalFieldLabel}>Branch Code</Text>
                  <TextInput
                    style={s.modalInput}
                    placeholder="Auto-filled when bank is selected"
                    placeholderTextColor={GREY}
                    keyboardType="numeric"
                    value={payForm.branch}
                    onChangeText={(v) => setPayForm(f => ({ ...f, branch: v }))}
                  />
                </View>
              </>
            )}

            {/* Instant Pay — phone number field */}
            {payFormType === 'instant_pay' && (
              <View style={s.modalField}>
                <Text style={s.modalFieldLabel}>Phone Number (PayShap ID)</Text>
                <TextInput
                  style={s.modalInput}
                  placeholder="082 123 4567"
                  placeholderTextColor={GREY}
                  keyboardType="phone-pad"
                  value={payForm.phone}
                  onChangeText={(v) => setPayForm(f => ({ ...f, phone: v }))}
                />
              </View>
            )}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowPaymentModal(false)}>
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, payFormSaving && { opacity: 0.6 }]}
                onPress={savePaymentMethod}
                disabled={payFormSaving}
              >
                {payFormSaving
                  ? <ActivityIndicator color={BG} size="small" />
                  : <Text style={s.modalSubmitTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const jb = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 82, left: 12, right: 12, zIndex: 300,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6, shadowRadius: 28, elevation: 24,
  },
  inner: {
    flexDirection: 'row', backgroundColor: '#141414',
    borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  accent: { width: 5, backgroundColor: LIME },
  body: { flex: 1, padding: 16 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge: {
    backgroundColor: LIME + '20', borderWidth: 1, borderColor: LIME + '40',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: LIME, letterSpacing: 2 },
  sizeBadge: {
    backgroundColor: '#1e1e1e', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  sizeTxt: { fontSize: 12, fontWeight: '700', color: '#aaa' },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,          // ← bigger hit target
    backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center',
  },

  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pay: { fontSize: 42, fontWeight: '900', color: GREEN, letterSpacing: -1 }, // ← massive, glanceable
  tipBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN + '18', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  tipTxt: { fontSize: 13, fontWeight: '800', color: GREEN },

  routeRow: { marginBottom: 10 },
  routeStop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  routeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  routeAddr: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 }, // ← larger
  routeLine: { width: 1.5, height: 12, backgroundColor: '#2a2a2a', marginLeft: 4, marginBottom: 4 },

  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1e1e1e', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,          // ← taller chips
  },
  metaTxt: { fontSize: 13, fontWeight: '600', color: GREY },

  notesRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: AMBER + '10', borderRadius: 12,
    padding: 10, marginBottom: 10,
  },
  notesTxt: { fontSize: 13, color: AMBER, flex: 1, fontWeight: '600' },

  // ← ACCEPT: full-width, 68px tall — can't miss it
  acceptBtn: {
    backgroundColor: LIME, borderRadius: 18, height: 68,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  acceptTxt: { fontSize: 18, fontWeight: '900', color: BG, letterSpacing: 0.5 },
});

const sos = StyleSheet.create({
  btn: {
    position: 'absolute', top: 96, right: 20, zIndex: 200,
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

  // Breakdown button
  breakdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)', borderRadius: 18,
    padding: 16, marginBottom: 16,
  },
  breakdownIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  breakdownTitle: { fontSize: 15, fontWeight: '800', color: AMBER, marginBottom: 2 },
  breakdownSub: { fontSize: 12, color: '#9a7020', fontWeight: '500' },

  // Breakdown confirmation
  breakdownConfirmCard: { alignItems: 'center', paddingVertical: 12, paddingBottom: 4 },
  breakdownConfirmIcon: {
    width: 64, height: 64, borderRadius: 22,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  breakdownConfirmTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 10 },
  breakdownConfirmSub: {
    fontSize: 14, color: GREY, textAlign: 'center',
    lineHeight: 22, marginBottom: 24, paddingHorizontal: 8,
  },
  breakdownConfirmYes: {
    backgroundColor: AMBER, borderRadius: 16, height: 54, width: '100%',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 10,
  },
  breakdownConfirmYesTxt: { fontSize: 16, fontWeight: '900', color: '#000' },
  breakdownConfirmNo: {
    height: 48, width: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  breakdownConfirmNoTxt: { fontSize: 14, fontWeight: '700', color: GREY },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1, height: '100%' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 110 },

  greeting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greetLabel: { fontSize: 10, fontWeight: '800', color: '#505050', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 5 },
  greetTitle: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5, lineHeight: 36 },
  ratingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: AMBER + '15', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7, flexShrink: 0,
    borderWidth: 1, borderColor: AMBER + '30',
  },
  ratingTxt: { fontSize: 14, fontWeight: '800', color: AMBER },

  // Earnings hero card
  earningsHeroCard: {
    borderRadius: 28, padding: 28,
    marginBottom: 14,
    borderWidth: 1, borderColor: LIME + '18',
    alignItems: 'center',
    backgroundColor: LIME + '08',
  },
  earningsHeroLabel: { fontSize: 10, fontWeight: '800', color: '#505050', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 10 },
  earningsHeroAmt: { fontSize: 72, fontWeight: '900', color: '#fff', letterSpacing: -2, lineHeight: 76 },
  earningsHeroCurr: { fontSize: 32, fontWeight: '900', color: LIME, letterSpacing: 0 },
  earningsHeroMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  earningsHeroStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  earningsHeroStatTxt: { fontSize: 13, fontWeight: '600', color: GREY },
  earningsHeroSep: { width: 1, height: 14, backgroundColor: MUTED },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: SURFACE, borderRadius: 20, padding: 18,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  statVal: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  statLabel: { fontSize: 10, color: GREY, fontWeight: '700', letterSpacing: 0.5 },

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
  pageTitle: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 8 },
  pageSub: { fontSize: 13, color: GREY, fontWeight: '500', lineHeight: 19, marginBottom: 24 },
  addMethodBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: SURFACE, borderRadius: 16, padding: 16, marginTop: 4, borderWidth: 1.5, borderColor: LIME + '30', borderStyle: 'dashed' },
  addMethodTxt: { fontSize: 14, fontWeight: '700', color: LIME },
  payInfoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#111', borderRadius: 14, padding: 14, marginTop: 16 },
  payInfoTxt: { flex: 1, fontSize: 12, color: GREY, lineHeight: 17 },

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
  tripScreen:  { flex: 1, position: 'relative' },
  tripMapArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tripPayChip: {
    position: 'absolute', top: 16, left: 16, zIndex: 10,
    backgroundColor: 'rgba(8,8,8,0.92)', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 14,           // ← more padding
    borderWidth: 1.5, borderColor: 'rgba(200,240,0,0.4)',
  },
  tripPayChipAmt: { fontSize: 28, fontWeight: '900', color: LIME, letterSpacing: -0.5 }, // ← bigger
  tripPayChipMeta: { fontSize: 12, color: '#5a8020', fontWeight: '700', marginTop: 3 },
  tripStatusChip: {
    position: 'absolute', top: 14, right: 14, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(8,8,8,0.8)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  tripStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIME },
  tripStatusTxt: { fontSize: 10, fontWeight: '800', color: LIME, letterSpacing: 2 },

  // Swipe-up sheet (anchored to bottom, animates height)
  tripSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#111',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderTopWidth: 1, borderColor: '#1e1e1e',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.45, shadowRadius: 20, elevation: 20,
    zIndex: 50,
  },
  tripSheetHandle: {
    paddingTop: 10, paddingBottom: 6, paddingHorizontal: 20,
    alignItems: 'center',
  },
  tripPillBar: {
    width: 44, height: 5, borderRadius: 3,              // ← wider, more visible
    backgroundColor: '#3a3a3a', alignSelf: 'center', marginBottom: 12,
  },
  tripSheetPeek: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingBottom: 10,
  },
  tripSheetPeekAddr: {
    flex: 1, fontSize: 18, fontWeight: '800', color: '#fff', // ← big + bold, readable while riding
  },
  tripSheetScroll:       { flex: 1 },
  tripSheetScrollContent:{ paddingHorizontal: 20, paddingBottom: 40 },

  tripRouteBlock: { marginBottom: 14 },
  tripStop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  tripStopLbl: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 },
  tripStopAddr: { fontSize: 17, fontWeight: '800', color: '#fff' },   // ← larger address text
  tripConnector: { width: 1.5, height: 14, backgroundColor: '#2a2a2a', marginLeft: 5, marginVertical: 3 },
  tripNotesRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(200,240,0,0.06)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(200,240,0,0.15)',
  },
  tripNotesTxt: { flex: 1, fontSize: 14, color: '#ccc', fontWeight: '500', lineHeight: 20 },
  waBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25d366', borderRadius: 16, paddingVertical: 17, // ← taller
    marginHorizontal: 20, marginBottom: 10,
  },
  waBtnTxt: { fontSize: 16, fontWeight: '900', color: '#fff' },
  tripPinRow: { alignItems: 'center', marginTop: 12, marginBottom: 6 },
  tripPinLbl: { fontSize: 11, fontWeight: '800', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 },

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
    backgroundColor: LIME, borderRadius: 22, height: 76,  // ← tall, impossible to miss
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20,
    shadowColor: LIME, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 28, elevation: 16,
  },
  deliveredBtnTxt: { fontSize: 20, fontWeight: '900', color: BG, letterSpacing: 0.3 },
  backToHomeBtn: { alignItems: 'center', paddingVertical: 22 }, // ← big hit area
  backToHomeTxt: { fontSize: 15, color: GREY, fontWeight: '600' },

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
  pinBoxRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  pinBox: {
    width: 62, height: 70, borderRadius: 16,   // ← bigger, glove-friendly
    backgroundColor: '#0e0e0e', borderWidth: 2.5, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
  },
  pinBoxActive: { borderColor: LIME },
  pinBoxError: { borderColor: '#ef4444' },
  pinDigit: { fontSize: 32, fontWeight: '900', color: '#fff' }, // ← bigger digit
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

  // Payout request history row
  payoutRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 14, padding: 14, marginBottom: 8 },
  payoutIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  payoutBank:   { fontSize: 13, fontWeight: '700', color: '#ddd' },
  payoutDate:   { fontSize: 11, color: GREY, marginTop: 2 },
  payoutAmt:    { fontSize: 15, fontWeight: '900', color: '#fff' },
  payoutStatus: { fontSize: 10, fontWeight: '700' },

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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  modalHandle: { width: 40, height: 4, backgroundColor: MUTED, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  modalSub: { fontSize: 13, color: GREY, marginBottom: 4 },
  modalField: { gap: 4 },
  modalFieldLabel: { fontSize: 12, color: GREY, fontWeight: '600' },
  modalInput: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: MUTED },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: MUTED, alignItems: 'center', justifyContent: 'center' },
  modalCancelTxt: { color: GREY, fontWeight: '700', fontSize: 15 },
  modalSubmitBtn: { flex: 2, height: 48, borderRadius: 12, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  modalSubmitTxt: { color: BG, fontWeight: '800', fontSize: 15 },
  // Disc status
  discStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9,
    marginTop: 10,
  },
  discStripTxt: { fontSize: 12, fontWeight: '600', flex: 1 },
  // Bank details
  bankSummaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16,
  },
  bankSummaryBank: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 3 },
  bankSummaryDetail: { fontSize: 12, color: GREY, fontWeight: '500' },
  bankEditTxt: { fontSize: 13, fontWeight: '700', color: LIME },
  addBankBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: LIME + '12', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: LIME + '30', marginBottom: 16,
  },
  addBankTxt: { fontSize: 14, fontWeight: '700', color: LIME },
  bankChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: MUTED,
  },
  bankChipActive: { backgroundColor: LIME + '20', borderColor: LIME },
  bankChipTxt: { fontSize: 13, fontWeight: '600', color: GREY },
  bankChipTxtActive: { color: LIME },
});
