import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Modal,
  Animated, TextInput, ScrollView, Alert, ActivityIndicator, Platform, Share, Image,
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

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'User-Agent': 'RunIt/1.0' } }
    );
    const data = await res.json();
    const a = data.address || {};
    const landmark = a.amenity || a.tourism || a.shop || a.leisure || a.office || a.building;
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const area = a.suburb || a.neighbourhood || a.city_district || a.town;
    if (landmark && area) return `${landmark}, ${area}`;
    if (landmark) return landmark;
    if (street && area) return `${street}, ${area}`;
    if (street) return street;
    if (area) return area;
    return data.display_name?.split(', ').slice(0, 3).join(', ') || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } catch (_) {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

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
window.updateRider=function(lat,lon){if(riderMarker){var el=riderMarker.getElement();if(el){el.style.transition='transform 4500ms linear';}riderMarker.setLatLng([lat,lon]);}else{riderMarker=L.marker([lat,lon],{icon:iconR}).bindTooltip('On the way 🏍️',{permanent:true,direction:'top',className:'tip',offset:[0,-14]}).addTo(map);}};
window.addEventListener('message',function(e){if(e.data&&e.data.type==='updateRider'){window.updateRider(e.data.lat,e.data.lon);}});
</script></body></html>`;
}

// ─── Booking map HTML (draggable pins + tap-to-place) ─────────────────────

function buildBookingMapHtml(initFrom, initTo) {
  const c = initFrom || initTo || { lat: -33.9249, lon: 18.4241 };
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#0a0a0a;overflow:hidden}
#map{width:100%;height:100%}
.leaflet-control-attribution,.leaflet-control-zoom{display:none}

/* Top & bottom gradient overlays so map blends into app */
#grad-top{position:absolute;top:0;left:0;right:0;height:32px;background:linear-gradient(to bottom,rgba(10,10,10,0.9),transparent);z-index:500;pointer-events:none}
#grad-bot{position:absolute;bottom:0;left:0;right:0;height:48px;background:linear-gradient(to top,rgba(10,10,10,0.95),transparent);z-index:500;pointer-events:none}

/* Hint pill */
#hint{
  position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
  background:rgba(255,255,255,0.12);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.18);
  color:#fff;font-size:12px;font-weight:700;
  font-family:-apple-system,sans-serif;
  padding:7px 18px;border-radius:24px;
  white-space:nowrap;z-index:1000;pointer-events:none;
  transition:opacity 0.4s;letter-spacing:0.3px;
}

/* Tooltip label */
.tip{
  background:rgba(10,10,10,0.95)!important;
  border:1px solid rgba(255,255,255,0.1)!important;
  color:#fff!important;font-size:11px!important;font-weight:700!important;
  font-family:-apple-system,sans-serif!important;
  padding:4px 10px!important;border-radius:12px!important;
  box-shadow:0 2px 12px rgba(0,0,0,0.6)!important;
}
.tip::before{display:none!important}
.leaflet-tooltip{background:transparent!important;border:none!important;box-shadow:none!important}

/* Pin animations */
@keyframes pinDrop{0%{transform:translateY(-30px) scale(0.6);opacity:0}70%{transform:translateY(4px) scale(1.05)}100%{transform:translateY(0) scale(1);opacity:1}}
@keyframes ripple{0%{transform:scale(1);opacity:0.6}100%{transform:scale(3);opacity:0}}
.pin-wrap{animation:pinDrop 0.4s cubic-bezier(.4,1.6,.6,1) forwards}
.ripple{
  position:absolute;width:20px;height:20px;border-radius:50%;
  top:50%;left:50%;transform:translate(-50%,-50%);
  animation:ripple 1.6s ease-out infinite;
  pointer-events:none;
}
</style>
</head><body>
<div id="map"></div>
<div id="grad-top"></div>
<div id="grad-bot"></div>
<div id="hint">Tap map to set pickup point</div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd'}).addTo(map);
map.setView([${c.lat},${c.lon}],15);

function makePinA(){
  return L.divIcon({className:'',iconSize:[28,36],iconAnchor:[14,34],html:
    '<div class="pin-wrap" style="position:relative;width:28px;height:36px">'+
    '<div class="ripple" style="background:rgba(200,240,0,0.4)"></div>'+
    '<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 4px 12px rgba(200,240,0,0.5))">'+
    '<path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22s14-12.67 14-22C28 6.27 21.73 0 14 0z" fill="#c8f000"/>'+
    '<circle cx="14" cy="14" r="5" fill="#080808"/>'+
    '</svg></div>'
  });
}
function makePinB(){
  return L.divIcon({className:'',iconSize:[28,36],iconAnchor:[14,34],html:
    '<div class="pin-wrap" style="position:relative;width:28px;height:36px">'+
    '<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 4px 12px rgba(239,68,68,0.5))">'+
    '<path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22s14-12.67 14-22C28 6.27 21.73 0 14 0z" fill="#ef4444"/>'+
    '<circle cx="14" cy="14" r="5" fill="#fff"/>'+
    '</svg></div>'
  });
}

var markerA=null,markerB=null,routeLayers=[];
function send(pin,ll){
  var m={type:'pinMoved',pin:pin,lat:ll.lat,lon:ll.lng};
  try{window.parent.postMessage(m,'*');}catch(e){}
  try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(m));}catch(e){}
}
function clearRoute(){routeLayers.forEach(function(l){map.removeLayer(l);});routeLayers=[];}
function drawRoute(){
  if(!markerA||!markerB)return;
  var a=markerA.getLatLng(),b=markerB.getLatLng();
  clearRoute();
  fetch('https://router.project-osrm.org/route/v1/driving/'+a.lng+','+a.lat+';'+b.lng+','+b.lat+'?overview=full&geometries=geojson')
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d.routes||!d.routes[0])return;
      var coords=d.routes[0].geometry.coordinates.map(function(c){return[c[1],c[0]];});
      routeLayers.push(L.polyline(coords,{color:'#c8f000',weight:14,opacity:0.08}).addTo(map));
      routeLayers.push(L.polyline(coords,{color:'#000',weight:7,opacity:0.5}).addTo(map));
      routeLayers.push(L.polyline(coords,{color:'#c8f000',weight:4,opacity:1}).addTo(map));
      map.fitBounds(L.latLngBounds([a,b]).pad(0.28),{maxZoom:16});
    }).catch(function(){});
}
function hint(){
  var h=document.getElementById('hint');if(!h)return;
  if(!markerA){h.innerText='Tap map to set pickup point';h.style.opacity='1';}
  else if(!markerB){h.innerText='Now tap to set drop-off point';h.style.opacity='1';}
  else{h.style.opacity='0';}
}
function placeA(ll,fromReact){
  if(markerA){markerA.setLatLng(ll);markerA.setIcon(makePinA());}
  else{
    markerA=L.marker(ll,{icon:makePinA(),draggable:true})
      .bindTooltip('Pickup',{permanent:true,direction:'top',className:'tip',offset:[0,-4]}).addTo(map);
    markerA.on('drag',function(){send('from',markerA.getLatLng());});
    markerA.on('dragend',function(){send('from',markerA.getLatLng());drawRoute();});
  }
  if(!fromReact)send('from',ll);
  if(markerB)drawRoute();
  hint();
}
function placeB(ll,fromReact){
  if(markerB){markerB.setLatLng(ll);markerB.setIcon(makePinB());}
  else{
    markerB=L.marker(ll,{icon:makePinB(),draggable:true})
      .bindTooltip('Drop-off',{permanent:true,direction:'top',className:'tip',offset:[0,-4]}).addTo(map);
    markerB.on('drag',function(){send('to',markerB.getLatLng());});
    markerB.on('dragend',function(){send('to',markerB.getLatLng());drawRoute();});
  }
  if(!fromReact)send('to',ll);
  if(markerA)drawRoute();
  hint();
}
map.on('click',function(e){
  if(!markerA)placeA(e.latlng,false);
  else if(!markerB){placeB(e.latlng,false);}
});
window.addEventListener('message',function(e){
  if(!e.data||e.data.type!=='setPin')return;
  var ll=L.latLng(e.data.lat,e.data.lon);
  if(e.data.pin==='from')placeA(ll,true);
  else placeB(ll,true);
  if(markerA&&markerB)map.fitBounds(L.latLngBounds([markerA.getLatLng(),markerB.getLatLng()]).pad(0.28),{maxZoom:16});
  else map.setView(ll,16);
});
${initFrom ? `placeA(L.latLng(${initFrom.lat},${initFrom.lon}),true);` : ''}
${initTo ? `placeB(L.latLng(${initTo.lat},${initTo.lon}),true);` : ''}
hint();
</script></body></html>`;
}

// ─── Booking map component (always visible, draggable pins) ───────────────

function BookingMap({ fromCoords, toCoords, onPinMove }) {
  const iframeRef = useRef(null);
  const webViewRef = useRef(null);
  const html = buildBookingMapHtml(fromCoords, toCoords);

  const sendToMap = (msg) => {
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(msg, '*');
    } else {
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(msg)}}));true;`
      );
    }
  };

  useEffect(() => {
    if (fromCoords) sendToMap({ type: 'setPin', pin: 'from', lat: fromCoords.lat, lon: fromCoords.lon });
  }, [fromCoords?.lat, fromCoords?.lon]);

  useEffect(() => {
    if (toCoords) sendToMap({ type: 'setPin', pin: 'to', lat: toCoords.lat, lon: toCoords.lon });
  }, [toCoords?.lat, toCoords?.lon]);

  if (Platform.OS === 'web') {
    return (
      <View style={s.bookingMapCard}>
        <iframe ref={iframeRef} srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          sandbox="allow-scripts" />
      </View>
    );
  }
  return (
    <View style={s.bookingMapCard}>
      <WebView ref={webViewRef} source={{ html }} style={{ flex: 1, backgroundColor: BG }}
        scrollEnabled={false} originWhitelist={['*']}
        onMessage={(e) => {
          try { const d = JSON.parse(e.nativeEvent.data); if (d.type === 'pinMoved') onPinMove?.(d.pin, d.lat, d.lon); } catch (_) {}
        }} />
    </View>
  );
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

// ─── Address search modal ─────────────────────────────────────────────────

function AddressSearchModal({ visible, field, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState([]);
  const inputRef = useRef(null);
  const debRef = useRef(null);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); return; }
    // Load recents from localStorage
    if (Platform.OS === 'web') {
      try { setRecents(JSON.parse(localStorage.getItem('runit_recent_addrs') || '[]')); }
      catch (_) { setRecents([]); }
    }
    const t = setTimeout(() => inputRef.current?.focus(), 180);
    return () => clearTimeout(t);
  }, [visible]);

  const handleChange = (text) => {
    setQuery(text);
    clearTimeout(debRef.current);
    if (text.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debRef.current = setTimeout(async () => {
      const r = await fetchSuggestions(text);
      setResults(r);
      setSearching(false);
    }, 300);
  };

  const pick = (sug) => {
    if (Platform.OS === 'web') {
      try {
        const prev = JSON.parse(localStorage.getItem('runit_recent_addrs') || '[]');
        const updated = [sug, ...prev.filter(r => r.label !== sug.label)].slice(0, 6);
        localStorage.setItem('runit_recent_addrs', JSON.stringify(updated));
      } catch (_) {}
    }
    onSelect(sug);
  };

  const useCurrentLoc = () => {
    if (!navigator?.geolocation) return;
    setSearching(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const label = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setSearching(false);
        pick({ label, lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => setSearching(false),
      { timeout: 8000 }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={am.container}>
        {/* Header */}
        <View style={am.header}>
          <TouchableOpacity onPress={onClose} style={am.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={am.title}>{field === 'from' ? 'Pickup location' : 'Drop-off location'}</Text>
        </View>

        {/* Search bar */}
        <View style={am.searchBar}>
          <Ionicons name="search-outline" size={18} color={GREY} />
          <TextInput
            ref={inputRef}
            style={am.searchInput}
            placeholder="Search address or place…"
            placeholderTextColor={GREY}
            value={query}
            onChangeText={handleChange}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={MUTED} />
            </TouchableOpacity>
          )}
        </View>

        {/* Use current location (pickup only, web) */}
        {field === 'from' && Platform.OS === 'web' && (
          <TouchableOpacity style={am.locBtn} onPress={useCurrentLoc} activeOpacity={0.7}>
            <View style={am.locIconWrap}>
              <Ionicons name="locate-outline" size={18} color={LIME} />
            </View>
            <Text style={am.locTxt}>Use my current location</Text>
            <Ionicons name="chevron-forward" size={16} color={MUTED} />
          </TouchableOpacity>
        )}

        {/* Results / recents */}
        {searching ? (
          <View style={am.center}>
            <ActivityIndicator color={LIME} size="large" />
            <Text style={[am.hint, { marginTop: 12 }]}>Searching…</Text>
          </View>
        ) : results.length > 0 ? (
          <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
            {results.map((r, i) => (
              <TouchableOpacity key={i} style={am.row} onPress={() => pick(r)} activeOpacity={0.7}>
                <View style={am.rowIcon}><Ionicons name="location-outline" size={17} color={LIME} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={am.rowPrimary} numberOfLines={1}>{r.label.split(',')[0]}</Text>
                  <Text style={am.rowSecondary} numberOfLines={1}>{r.label.split(',').slice(1).join(',').trim()}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={MUTED} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : query.length >= 2 ? (
          <View style={am.center}>
            <Ionicons name="search-outline" size={40} color={MUTED} />
            <Text style={am.hint}>No results found</Text>
            <Text style={[am.hint, { fontSize: 12, marginTop: 4 }]}>Try a street name, suburb or landmark</Text>
          </View>
        ) : recents.length > 0 ? (
          <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
            <Text style={am.sectionLabel}>Recent</Text>
            {recents.map((r, i) => (
              <TouchableOpacity key={i} style={am.row} onPress={() => pick(r)} activeOpacity={0.7}>
                <View style={am.rowIcon}><Ionicons name="time-outline" size={17} color={GREY} /></View>
                <Text style={am.rowPrimary} numberOfLines={1}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={am.center}>
            <Ionicons name="location-outline" size={44} color={MUTED} />
            <Text style={am.hint}>
              {field === 'from' ? 'Where should we collect from?' : 'Where are we delivering to?'}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const am = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '800', color: '#fff', flex: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#181818', marginHorizontal: 16, marginTop: 14, marginBottom: 4,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#2e2e2e',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '500', outlineStyle: 'none' },
  locBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 16,
    marginTop: 6,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1a1a1a',
  },
  locIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: LIME + '15', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: LIME + '25',
  },
  locTxt: { flex: 1, color: '#e8e8e8', fontSize: 15, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60, gap: 10 },
  hint: { color: GREY, fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  sectionLabel: {
    paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10,
    fontSize: 10, color: '#555', fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#141414',
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    borderWidth: 1, borderColor: '#222',
  },
  rowPrimary: { fontSize: 15, color: '#f0f0f0', fontWeight: '600', marginBottom: 2 },
  rowSecondary: { fontSize: 12, color: '#666', lineHeight: 16 },
});

// ─── Main screen ──────────────────────────────────────────────────────────

export default function CustomerScreen({ navigation }) {
  const [screen, setScreen] = useState('home');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [packageSize, setPackageSize] = useState('small');
  const [notes, setNotes] = useState('');
  const [postTip, setPostTip] = useState(0);
  const [customPostTip, setCustomPostTip] = useState('');
  const [tipSubmitted, setTipSubmitted] = useState(false);
  const [starRating, setStarRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
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
  const [riderName, setRiderName] = useState(null);
  const [riderRating, setRiderRating] = useState(null); // avg rating fetched on accept
  const [riderPhoto, setRiderPhoto] = useState(null);   // selfie_url from rider_verifications
  const [riderId, setRiderId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('');
  const [focusedField, setFocusedField] = useState(null); // for notes input
  const [fromConfirmed, setFromConfirmed] = useState(false);
  const [toConfirmed, setToConfirmed] = useState(false);
  const [addressModal, setAddressModal] = useState(null); // null | 'from' | 'to'
  const orderSubRef = useRef(null);
  const riderLocSubRef = useRef(null);
  const pinMoveHandlerRef = useRef(null);

  const registerPush = async (uid) => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const pkRes = await fetch('/api/vapid-pubkey');
      const { publicKey } = await pkRes.json();
      if (!publicKey) return;

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const appKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) appKey[i] = rawData.charCodeAt(i);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });

      await supabase.from('push_subscriptions').upsert(
        { user_id: uid, role: 'customer', subscription: JSON.parse(JSON.stringify(sub)) },
        { onConflict: 'user_id' },
      );
    } catch (e) {
      console.warn('Customer push registration skipped:', e?.message);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id || null;
      setUserId(uid);
      setUserName(data?.user?.user_metadata?.name || '');
      if (uid) registerPush(uid);
    });

    // Detect return from PayFast payment redirect
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      const paymentResult = params.get('payment');
      const pendingRaw = localStorage.getItem('runit_pending_order');
      if (pendingRaw && (paymentResult === 'success' || paymentResult === 'cancel')) {
        let saved = {};
        try { saved = JSON.parse(pendingRaw); } catch (_) {}
        localStorage.removeItem('runit_pending_order');
        window.history.replaceState({}, '', window.location.pathname);
        if (paymentResult === 'cancel') {
          if (saved.orderId) supabase.from('orders').delete().eq('id', saved.orderId).then(() => {});
        } else {
          const { orderId, pin } = saved;
          if (orderId) {
            supabase.from('orders').select('status, delivery_pin').eq('id', orderId).single().then(({ data }) => {
              if (data) startOrderTracking(orderId, data.delivery_pin || pin, data.status);
            });
          }
        }
      }
    }

    return () => {
      orderSubRef.current?.unsubscribe();
      riderLocSubRef.current?.unsubscribe();
    };
  }, []);

  // Keep pin-move handler fresh so it always sees latest coords/size
  useEffect(() => {
    pinMoveHandlerRef.current = async (pin, lat, lon) => {
      const label = await reverseGeocode(lat, lon);
      const coords = { lat, lon };
      if (pin === 'from') {
        setFrom(label); setFromCoords(coords); setFromConfirmed(true);
        if (toCoords) calcRouteWithCoords(coords, toCoords, packageSize);
      } else {
        setTo(label); setToCoords(coords); setToConfirmed(true);
        if (fromCoords) calcRouteWithCoords(fromCoords, coords, packageSize);
      }
    };
  }, [fromCoords, toCoords, packageSize]);

  // Global listener for pin-move messages from the booking map iframe (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e) => {
      if (e.data?.type === 'pinMoved') pinMoveHandlerRef.current?.(e.data.pin, e.data.lat, e.data.lon);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const clearRoute = () => {
    setDist(null); setPrice(null); setEta(null); setRouteCoords(null);
  };

  const swapAddresses = async () => {
    const [prevFrom, prevTo, prevFC, prevTC] = [from, to, fromCoords, toCoords];
    setFrom(prevTo); setFromCoords(prevTC); setFromConfirmed(!!prevTC);
    setTo(prevFrom); setToCoords(prevFC); setToConfirmed(!!prevFC);
    clearRoute();
    if (prevFC && prevTC) await calcRouteWithCoords(prevTC, prevFC, packageSize);
  };

  const confirmAddress = async (sug, field) => {
    setAddressModal(null);
    const coords = { lat: sug.lat, lon: sug.lon };
    if (field === 'from') {
      setFrom(sug.label); setFromCoords(coords); setFromConfirmed(true);
      if (toCoords) {
        await calcRouteWithCoords(coords, toCoords, packageSize);
      } else {
        setTimeout(() => setAddressModal('to'), 350);
      }
    } else {
      setTo(sug.label); setToCoords(coords); setToConfirmed(true);
      if (fromCoords) {
        await calcRouteWithCoords(fromCoords, coords, packageSize);
      } else {
        setTimeout(() => setAddressModal('from'), 350);
      }
    }
  };

  const calcRouteWithCoords = async (a, b, size) => {
    setCalculating(true);
    setDist(null); setPrice(null); setEta(null); setRouteCoords(null);
    const route = await getRoute(a, b);
    const p = Math.round((BASE + route.distKm * RATE) * (size === 'large' ? 1.4 : 1));
    setFromCoords(a); setToCoords(b); setRouteCoords(route.coords);
    setDist(route.distKm); setEta(route.durationMin); setPrice(p);
    setCalculating(false);
  };

  const submitTip = async () => {
    const amt = customPostTip ? parseInt(customPostTip, 10) || 0 : postTip;
    if (!activeOrderId || amt <= 0) { setTipSubmitted(true); return; }
    await supabase.from('orders').update({ tip: amt }).eq('id', activeOrderId);
    setTipSubmitted(true);
    showToast(`R${amt} tip sent — thank you! 🙏`);
  };

  const submitRating = async (stars) => {
    setStarRating(stars);
    setRatingSubmitted(true);
    if (activeOrderId) {
      await supabase.from('orders').update({ rating: stars }).eq('id', activeOrderId);
    }
  };

  const startOrderTracking = (orderId, pin, initialStatus = 'pending') => {
    setActiveOrderId(orderId);
    setDeliveryPin(pin);
    setOrderStatus(initialStatus);
    orderSubRef.current?.unsubscribe();
    const channel = supabase.channel(`order_${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `id=eq.${orderId}`,
      }, (payload) => {
        const newStatus = payload.new.status;
        const prevStatus = payload.old?.status;
        setOrderStatus(newStatus);
        if (newStatus === 'on_the_way') {
          const name = payload.new.rider_name || null;
          const rid  = payload.new.rider_id   || null;
          setRiderName(name);
          setRiderId(rid);
          showToast(name ? `🏍️  ${name} is coming to collect your parcel!` : '🏍️  Rider is on the way!');
          subscribeRiderLocation(orderId);
          // Fetch rider's selfie photo + average rating in parallel
          if (rid) {
            // Selfie from rider_verifications
            supabase
              .from('rider_verifications')
              .select('selfie_url')
              .eq('rider_id', rid)
              .maybeSingle()
              .then(({ data: rv }) => {
                if (rv?.selfie_url) setRiderPhoto(rv.selfie_url);
              });

            // Average star rating from delivered orders
            supabase
              .from('orders')
              .select('rating')
              .eq('rider_id', rid)
              .eq('status', 'delivered')
              .not('rating', 'is', null)
              .then(({ data: rd }) => {
                if (rd?.length) {
                  const avg = rd.reduce((s, o) => s + (o.rating || 0), 0) / rd.length;
                  setRiderRating(avg.toFixed(1));
                }
              });
          }
        }
        if (newStatus === 'pending' && prevStatus === 'on_the_way') {
          setRiderName(null);
          setRiderRating(null);
          setRiderPhoto(null);
          setRiderId(null);
          showToast('Your rider cancelled — finding a new one...');
        }
        if (newStatus === 'delivered') showToast('Delivered! 🎉');
        if (newStatus === 'cancelled') {
          orderSubRef.current?.unsubscribe(); orderSubRef.current = null;
          riderLocSubRef.current?.unsubscribe(); riderLocSubRef.current = null;
          showToast('Your order was cancelled. Please contact support if you were charged.');
          setTimeout(() => { resetBooking(); setScreen('home'); }, 2200);
        }
      })
      .subscribe();
    orderSubRef.current = channel;
    setScreen('tracking');
  };

  const handleSend = async () => {
    if (!from || !to) { Alert.alert('Missing Info', 'Enter pickup and drop-off'); return; }
    setLoading(true);

    const pin = Math.floor(100 + Math.random() * 900).toString();

    const { data: insertData, error } = await supabase
      .from('orders')
      .insert([{
        from_address: from, to_address: to,
        price: price || 0,
        status: 'awaiting_payment',
        payment_status: 'unpaid',
        user_id: userId,
        package_size: packageSize,
        dist_km: dist,
        delivery_pin: pin,
        notes: notes.trim() || null,
        tip: 0,
        from_lat: fromCoords?.lat || null,
        from_lon: fromCoords?.lon || null,
        to_lat: toCoords?.lat || null,
        to_lon: toCoords?.lon || null,
      }])
      .select('id')
      .single();

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }

    const orderId = insertData?.id;

    if (Platform.OS === 'web') {
      localStorage.setItem('runit_pending_order', JSON.stringify({ orderId, pin }));
      try {
        const res = await fetch('/api/payfast-initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: price, itemName: 'RunIt Delivery' }),
        });
        const json = await res.json();
        if (json.action && json.fields) {
          // POST form to PayFast (required — GET URLs are rejected)
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = json.action;
          Object.entries(json.fields).forEach(([k, v]) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = k;
            input.value = v;
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          return;
        }
      } catch (_) {}
      // PayFast not configured — activate order directly (dev/staging fallback)
      await supabase.from('orders').update({ status: 'pending', payment_status: 'paid' }).eq('id', orderId);
      fetch('/api/notify-riders', { method: 'POST' }).catch(() => {});
    } else {
      await supabase.from('orders').update({ status: 'pending', payment_status: 'paid' }).eq('id', orderId);
      fetch('/api/notify-riders', { method: 'POST' }).catch(() => {});
    }

    startOrderTracking(orderId, pin);
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
    setPackageSize('small'); setNotes('');
    setPostTip(0); setCustomPostTip(''); setTipSubmitted(false);
    setStarRating(0); setRatingSubmitted(false);
    setActiveOrderId(null); setOrderStatus('pending');
    setDeliveryPin(null); setRiderLocation(null); setRiderName(null);
    setRiderRating(null); setRiderPhoto(null); setRiderId(null);
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
        <TopBar userName={userName} />
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

    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar userName={userName} />
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          <TouchableOpacity onPress={() => setScreen('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>

          <Text style={s.pageTitle}>Where{'\n'}<Text style={s.pageTitleAccent}>to?</Text></Text>

          {/* Address route card */}
          <View style={s.addrCard}>
            {/* From row */}
            <View style={s.addrRow}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 }}
                onPress={() => setAddressModal('from')}
                activeOpacity={0.7}
              >
                <View style={[s.addrDot, { backgroundColor: LIME, shadowColor: LIME, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 }]} />
                <View style={s.addrCol}>
                  <Text style={s.addrLbl}>Collecting from</Text>
                  <Text style={[s.addrDisplayTxt, !from && { color: GREY, fontWeight: '400' }]} numberOfLines={1}>
                    {from || 'Tap to set pickup'}
                  </Text>
                </View>
              </TouchableOpacity>
              {from ? (
                <TouchableOpacity onPress={() => { setFrom(''); setFromCoords(null); setFromConfirmed(false); clearRoute(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={20} color={MUTED} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={17} color={MUTED} />
              )}
            </View>

            {/* Connector + swap */}
            <View style={s.addrMid}>
              <View style={{ width: 2, alignSelf: 'stretch', backgroundColor: '#404040', borderRadius: 1 }} />
              <View style={{ flex: 1 }} />
              {from && to && (
                <TouchableOpacity style={s.swapBtn} onPress={swapAddresses} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="swap-vertical-outline" size={16} color={LIME} />
                </TouchableOpacity>
              )}
            </View>

            {/* To row */}
            <View style={s.addrRow}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 }}
                onPress={() => setAddressModal('to')}
                activeOpacity={0.7}
              >
                <View style={[s.addrDot, { backgroundColor: '#ef4444', shadowColor: '#ef4444', shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 }]} />
                <View style={s.addrCol}>
                  <Text style={s.addrLbl}>Delivering to</Text>
                  <Text style={[s.addrDisplayTxt, !to && { color: GREY, fontWeight: '400' }]} numberOfLines={1}>
                    {to || 'Tap to set drop-off'}
                  </Text>
                </View>
              </TouchableOpacity>
              {to ? (
                <TouchableOpacity onPress={() => { setTo(''); setToCoords(null); setToConfirmed(false); clearRoute(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={20} color={MUTED} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={17} color={MUTED} />
              )}
            </View>
          </View>

          {/* Address search modal */}
          <AddressSearchModal
            visible={addressModal !== null}
            field={addressModal}
            onSelect={(sug) => confirmAddress(sug, addressModal)}
            onClose={() => setAddressModal(null)}
          />

          {calculating && (
            <View style={s.calcRow}>
              <ActivityIndicator size="small" color={LIME} />
              <Text style={s.calcTxt}>Calculating route…</Text>
            </View>
          )}

          <BookingMap
            fromCoords={fromCoords}
            toCoords={toCoords}
            onPinMove={(pin, lat, lon) => pinMoveHandlerRef.current?.(pin, lat, lon)}
          />

          {routeReady && (
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
                onPress={() => { const s2 = sz.id; setPackageSize(s2); if (fromCoords && toCoords) calcRouteWithCoords(fromCoords, toCoords, s2); }}
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

          {/* Price card — only shown when price is calculated */}
          {price !== null && (
            <View style={s.priceCard}>
              <View>
                <Text style={s.priceNum}>R {price}</Text>
                <Text style={s.priceMeta}>
                  Delivery fare{packageSize === 'large' ? ' · large ×1.4' : ''}
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
            <Text style={s.primaryBtnTxt}>
              {loading ? 'Redirecting to payment…' : price ? `Confirm & Pay  R${price}` : '🏍️  Send Now'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── TRACKING ──────────────────────────────────────────────────────────
  if (screen === 'tracking') {
    const awaitingPayment = orderStatus === 'awaiting_payment';
    const finding   = orderStatus === 'pending';
    const onTheWay  = orderStatus === 'on_the_way';
    const delivered = orderStatus === 'delivered';
    const statusLabel = awaitingPayment ? 'Confirming Payment' : finding ? 'Finding Rider' : onTheWay ? 'On the Way' : 'Delivered';

    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar userName={userName} />
        <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { alignItems: 'center' }]} showsVerticalScrollIndicator={false}>

          <Text style={[s.trackStatus, { alignSelf: 'flex-start' }]}>{statusLabel}</Text>

          {/* Rider name banner — shown once rider accepts */}
          {onTheWay && riderName && (
            <View style={s.riderNameCard}>
              <View style={s.riderNameAvatar}>
                {riderPhoto ? (
                  <Image source={{ uri: riderPhoto }} style={s.riderNameAvatarImg} />
                ) : (
                  <Text style={s.riderNameInitials}>
                    {riderName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.riderNameTxt}>{riderName}</Text>
                <Text style={s.riderNameSub}>is on the way to collect your parcel</Text>
              </View>
              {riderRating && (
                <View style={s.riderNameRating}>
                  <Ionicons name="star" size={12} color="#f59e0b" />
                  <Text style={s.riderNameRatingTxt}>{riderRating}</Text>
                </View>
              )}
            </View>
          )}

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
                <Text style={{ fontSize: 36 }}>🏍️</Text>
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
              <View style={s.driverAvatar}>
                {riderPhoto ? (
                  <Image source={{ uri: riderPhoto }} style={s.driverAvatarImg} />
                ) : riderName ? (
                  <Text style={s.driverAvatarInitials}>
                    {riderName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                  </Text>
                ) : (
                  <Text style={s.driverAvatarTxt}>🏍</Text>
                )}
              </View>
              <View style={s.driverInfo}>
                <Text style={s.driverName}>{riderName || 'Rider En Route'}</Text>
                <Text style={s.driverBike}>Blue dot on map = your rider</Text>
              </View>
              {riderRating && (
                <View style={s.driverRating}>
                  <Ionicons name="star" size={12} color="#f59e0b" />
                  <Text style={s.driverRatingTxt}>{riderRating}</Text>
                </View>
              )}
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

          {/* Star rating card */}
          {delivered && (
            ratingSubmitted ? (
              <View style={s.tipCard}>
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
                  {[1,2,3,4,5].map(i => (
                    <Ionicons key={i} name="star" size={22} color={i <= starRating ? '#f59e0b' : MUTED} />
                  ))}
                </View>
                <Text style={[s.tipThanksTxt, { marginTop: 0 }]}>Thanks for rating your rider!</Text>
              </View>
            ) : (
              <View style={s.tipCard}>
                <Text style={s.tipCardLabel}>RATE YOUR RIDER</Text>
                <Text style={s.tipCardHint}>How was your delivery experience?</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  {[1,2,3,4,5].map(i => (
                    <TouchableOpacity key={i} onPress={() => submitRating(i)} activeOpacity={0.7}>
                      <Ionicons name={i <= starRating ? 'star' : 'star-outline'} size={36} color={i <= starRating ? '#f59e0b' : GREY} />
                    </TouchableOpacity>
                  ))}
                </View>
                {starRating > 0 && (
                  <Text style={{ color: GREY, fontSize: 12, marginTop: 8 }}>
                    {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][starRating]}
                  </Text>
                )}
              </View>
            )
          )}

          {/* Post-delivery tip card */}
          {delivered && (
            tipSubmitted ? (
              <View style={s.tipCard}>
                <Ionicons name="heart" size={22} color={LIME} />
                <Text style={s.tipThanksTxt}>
                  {postTip > 0 || customPostTip
                    ? `R${customPostTip || postTip} tip sent — thanks for riding with RunIt!`
                    : 'Thanks for using RunIt!'}
                </Text>
              </View>
            ) : (
              <View style={s.tipCard}>
                <Text style={s.tipCardLabel}>TIP YOUR RIDER</Text>
                <Text style={s.tipCardHint}>How was your delivery?</Text>
                <View style={s.tipRow}>
                  {[0, 10, 20, 50].map(amt => (
                    <TouchableOpacity
                      key={amt}
                      style={[s.tipBtn, postTip === amt && !customPostTip && s.tipBtnActive]}
                      onPress={() => { setPostTip(amt); setCustomPostTip(''); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.tipBtnTxt, postTip === amt && !customPostTip && s.tipBtnTxtActive]}>
                        {amt === 0 ? 'No tip' : `R${amt}`}
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
                    value={customPostTip}
                    onChangeText={v => { setCustomPostTip(v.replace(/\D/g, '')); setPostTip(-1); }}
                  />
                </View>
                <TouchableOpacity style={s.tipSubmitBtn} onPress={submitTip} activeOpacity={0.85}>
                  <Ionicons name="gift-outline" size={16} color={BG} />
                  <Text style={s.tipSubmitTxt}>
                    {postTip > 0 || customPostTip ? `Send R${customPostTip || postTip} Tip` : 'Skip Tip'}
                  </Text>
                </TouchableOpacity>
              </View>
            )
          )}

          {/* Actions */}
          <View style={{ width: '100%', paddingBottom: 20 }}>
            {!delivered && finding && (
              <TouchableOpacity onPress={cancelOrder} style={s.cancelBtn}>
                <Text style={s.cancelTxt}>Cancel Order</Text>
              </TouchableOpacity>
            )}
            {delivered && tipSubmitted && (
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
  scroll: { flex: 1, backgroundColor: BG, height: '100%' },
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

  addrCard: {
    backgroundColor: SURFACE, borderRadius: 22, overflow: 'hidden',
    marginBottom: 16, borderWidth: 1, borderColor: '#282828',
  },
  addrRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 18, gap: 0 },
  addrDot: { width: 13, height: 13, borderRadius: 6.5, flexShrink: 0 },
  addrCol: { flex: 1 },
  addrLbl: { fontSize: 10, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 5 },
  addrDisplayTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
  addrMid: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,   // aligns line center with dot center (18 + 6.5 - 1 = 23.5 ≈ 22 + 1)
    paddingRight: 14,
    height: 26,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1e1e1e',
    backgroundColor: '#0c0c0c',
  },
  addrMidLine: { width: 2, backgroundColor: '#404040', borderRadius: 1 }, // height via alignSelf:stretch in JSX
  swapBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: LIME + '12',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: LIME + '45',
  },

  bookingMapCard: { height: 260, borderRadius: 20, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: '#282828' },

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

  // Post-delivery tip card
  tipCard: {
    width: '100%', backgroundColor: SURFACE, borderRadius: 20, padding: 20,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#1e1e1e',
  },
  tipCardLabel: { fontSize: 10, fontWeight: '700', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 },
  tipCardHint: { fontSize: 13, color: GREY, marginBottom: 16 },
  tipThanksTxt: { fontSize: 14, color: '#fff', fontWeight: '700', textAlign: 'center', marginTop: 10 },
  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, width: '100%' },
  tipBtn: { flex: 1, backgroundColor: '#181818', borderRadius: 12, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#222' },
  tipBtnActive: { borderColor: LIME, backgroundColor: 'rgba(200,240,0,0.08)' },
  tipBtnTxt: { fontSize: 13, fontWeight: '800', color: GREY },
  tipBtnTxtActive: { color: LIME },
  customTipWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#181818', borderRadius: 12, paddingHorizontal: 14, height: 42, marginBottom: 14, width: '100%', borderWidth: 1, borderColor: '#222' },
  customTipInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700', outlineStyle: 'none' },
  tipSubmitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: LIME, borderRadius: 14, height: 46, width: '100%',
  },
  tipSubmitTxt: { fontSize: 14, fontWeight: '900', color: BG },

  primaryBtn: {
    backgroundColor: LIME, borderRadius: 16, height: 58,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: LIME, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
  },
  primaryBtnDim: { opacity: 0.35, shadowOpacity: 0 },
  primaryBtnTxt: { fontSize: 17, fontWeight: '900', color: BG },

  // Tracking
  trackStatus: { fontSize: 12, fontWeight: '700', color: GREY, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 },
  riderNameCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: SURFACE, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 14,
    marginBottom: 20, alignSelf: 'stretch',
    borderWidth: 1, borderColor: 'rgba(200,240,0,0.2)',
  },
  riderNameAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(200,240,0,0.1)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  riderNameTxt: { fontSize: 17, fontWeight: '900', color: '#fff', marginBottom: 2 },
  riderNameSub: { fontSize: 12, color: GREY, fontWeight: '500' },
  riderNameInitials: { fontSize: 16, fontWeight: '900', color: LIME },
  riderNameAvatarImg: { width: 44, height: 44, borderRadius: 14 },
  driverAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  riderNameRating: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f59e0b18', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0,
  },
  riderNameRatingTxt: { fontSize: 13, fontWeight: '800', color: '#f59e0b' },
  driverAvatarInitials: { fontSize: 16, fontWeight: '900', color: LIME },
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
