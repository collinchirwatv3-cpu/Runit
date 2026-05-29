import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Linking, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import TopBar, { getSmartGreeting } from './TopBar';
import BottomBar from './BottomBar';

// ─── Design tokens ────────────────────────────────────────────────────────
const LIME    = '#c8f000';
const BG      = '#080808';
const SURFACE = '#111';
const SURFACE2= '#181818';
const MUTED   = '#444';
const GREY    = '#777';
const GREEN   = '#22c55e';
const AMBER   = '#f59e0b';
const BLUE    = '#3b82f6';
const RED     = '#ef4444';

// ─── Pricing ──────────────────────────────────────────────────────────────
const BASE = 15;
const RATE = 6.5;

// ─── Package definitions ───────────────────────────────────────────────────
const PACKAGE_SIZES = [
  {
    id:       'small',
    name:     'Small',
    icon:     'cube-outline',
    weight:   'Up to 5 kg',
    dim:      'Fits in a courier bag',
    examples: 'Documents · Food · Clothing · Gifts · Small boxes',
  },
  {
    id:       'large',
    name:     'Large',
    icon:     'archive-outline',
    weight:   '5 – 10 kg',
    dim:      'Max safe load on a bike',
    examples: 'Shoes · Bulk food · Multi-item orders · Small appliances',
  },
];

// ─── Address helpers (same as CustomerScreen) ─────────────────────────────
async function fetchSuggestions(query) {
  try {
    const q = encodeURIComponent(query + ', Cape Town, South Africa');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=6&countrycodes=za`
    );
    const data = await res.json();
    return data.map(item => {
      const a = item.address || {};
      const parts = [];

      // Named place (shop, restaurant, amenity, building, etc.)
      const place = a.amenity || a.tourism || a.shop || a.leisure || a.office || a.building;
      if (place) parts.push(place);

      // Street address — include house number when present
      const road = a.road || a.pedestrian || a.footway || a.path;
      if (a.house_number && road) parts.push(`${a.house_number} ${road}`);
      else if (road) parts.push(road);

      // Suburb / neighbourhood
      const area = a.suburb || a.neighbourhood || a.city_district || a.quarter;
      if (area) parts.push(area);

      // City fallback only when no suburb info
      if (!area) {
        const city = a.town || a.city || a.municipality;
        if (city) parts.push(city);
      }

      const label = parts.length > 0
        ? parts.join(', ')
        : item.display_name.split(',').slice(0, 3).join(', ').trim();

      return { label, lat: parseFloat(item.lat), lon: parseFloat(item.lon) };
    });
  } catch { return []; }
}

async function getRoute(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    const leg = data.routes?.[0]?.legs?.[0];
    return {
      distKm:      leg ? leg.distance / 1000 : 5,
      durationMin: leg ? Math.round(leg.duration / 60) : 15,
    };
  } catch { return { distKm: 5, durationMin: 15 }; }
}

// ─── Status config ────────────────────────────────────────────────────────
const STATUS = {
  pending:         { label: 'Finding Rider',  color: AMBER  },
  awaiting_payment:{ label: 'Awaiting Pay',   color: BLUE   },
  on_the_way:      { label: 'On the Way',     color: LIME   },
  delivered:       { label: 'Delivered',      color: GREEN  },
  cancelled:       { label: 'Failed',         color: RED    },
};
function si(status) { return STATUS[status] || STATUS.pending; }

// ─── Main screen ──────────────────────────────────────────────────────────
export default function MerchantScreen({ navigation }) {
  // ── Auth / identity ──
  const [userId,   setUserId]   = useState(null);
  const [userName, setUserName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [editingStoreName, setEditingStoreName] = useState(false);
  const [storeNameInput,   setStoreNameInput]   = useState('');
  const [greetingText, setGreetingText] = useState(null);
  const [defaultPickup, setDefaultPickup] = useState(null); // { label, lat, lon }

  // ── Views ──
  const [view, setView] = useState('home');  // home | dispatch | customers | history

  // ── Orders ──
  const [liveOrders,  setLiveOrders]  = useState([]);
  const [allOrders,   setAllOrders]   = useState([]);
  const [todayStats,  setTodayStats]  = useState({ count: 0, spend: 0 });
  const [orderFilter, setOrderFilter] = useState('all'); // all | active | delivered | failed
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [hasAlert,    setHasAlert]    = useState(false); // rider cancel notification dot
  const orderSubRef = useRef(null);

  // ── Saved customers ──
  const [savedCustomers, setSavedCustomers] = useState([]);
  const [custSearch,     setCustSearch]     = useState('');
  const [custLoading,    setCustLoading]    = useState(false);
  // Add/edit customer form
  const [showCustForm,  setShowCustForm]  = useState(false);
  const [editingCust,   setEditingCust]   = useState(null);
  const [custForm,      setCustForm]      = useState({ name: '', phone: '', address: '', lat: null, lon: null });
  const [custFormAddrResults, setCustFormAddrResults] = useState([]);
  const [custFormSearching,   setCustFormSearching]   = useState(false);
  const custFormDebRef = useRef(null);

  // ── Dispatch form ──
  const [dispStep,       setDispStep]       = useState('form'); // form | confirm
  const [dispCustomer,   setDispCustomer]   = useState(null);   // { name, phone, address, lat, lon }
  const [dispTo,         setDispTo]         = useState('');
  const [dispToCoords,   setDispToCoords]   = useState(null);
  const [dispNotes,      setDispNotes]      = useState('');
  const [dispSize,       setDispSize]       = useState('small');
  const [dispPrice,      setDispPrice]      = useState(null);
  const [dispEta,        setDispEta]        = useState(null);
  const [dispDist,       setDispDist]       = useState(null);
  const [dispCalc,       setDispCalc]       = useState(false);
  const [dispToResults,  setDispToResults]  = useState([]);
  const [dispToSearching,setDispToSearching]= useState(false);
  const [dispPosting,    setDispPosting]    = useState(false);
  const [dispFocused,    setDispFocused]    = useState(null);
  const [dispToUnit,     setDispToUnit]     = useState('');  // Unit / flat / complex detail
  const dispDebRef = useRef(null);

  // ─── Load data on mount ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user;
      const uid  = user?.id || null;
      setUserId(uid);
      setUserName(user?.user_metadata?.name || '');
      setStoreName(user?.user_metadata?.store_name || '');
      setGreetingText(getSmartGreeting(user));
      // Default pickup address from metadata
      const dp = user?.user_metadata?.default_pickup;
      if (dp) setDefaultPickup(dp);
      if (uid) {
        loadOrders(uid);
        loadCustomers(uid);
      }
    });
    return () => { orderSubRef.current?.unsubscribe(); };
  }, []);

  // ─── Load orders ─────────────────────────────────────────────────────
  const loadOrders = async (uid) => {
    setOrdersLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) {
      setAllOrders(data);
      refreshDerived(data);
    }
    setOrdersLoading(false);

    // Realtime subscription
    orderSubRef.current?.unsubscribe();
    orderSubRef.current = supabase.channel('merchant_orders_' + uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `user_id=eq.${uid}`,
      }, (payload) => {
        const updated = payload.new;
        setAllOrders(prev => {
          const exists = prev.find(o => o.id === updated.id);
          const next = exists
            ? prev.map(o => o.id === updated.id ? updated : o)
            : [updated, ...prev];
          refreshDerived(next);
          // Notify on rider cancellation
          if (updated.status === 'pending' && payload.old?.status === 'on_the_way') {
            setHasAlert(true);
          }
          return next;
        });
      })
      .subscribe();
  };

  const refreshDerived = (orders) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    setTodayStats({
      count: todayOrders.length,
      spend: todayOrders.reduce((s, o) => s + (parseFloat(o.price) || 0), 0),
    });
    setLiveOrders(orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled'));
  };

  // ─── Load saved customers ─────────────────────────────────────────────
  const loadCustomers = async (uid) => {
    setCustLoading(true);
    const { data } = await supabase
      .from('merchant_customers')
      .select('*')
      .eq('merchant_id', uid)
      .order('name');
    if (data) setSavedCustomers(data);
    setCustLoading(false);
  };

  // ─── Dispatch helpers ─────────────────────────────────────────────────
  const handleDispToChange = (text) => {
    setDispTo(text);
    setDispToCoords(null);
    setDispPrice(null);
    clearTimeout(dispDebRef.current);
    if (text.length < 2) { setDispToResults([]); setDispToSearching(false); return; }
    setDispToSearching(true);
    dispDebRef.current = setTimeout(async () => {
      const r = await fetchSuggestions(text);
      setDispToResults(r);
      setDispToSearching(false);
    }, 350);
  };

  const selectDispTo = async (sug) => {
    setDispTo(sug.label);
    setDispToCoords({ lat: sug.lat, lon: sug.lon });
    setDispToResults([]);
    // Calculate price if we have a pickup address
    const from = defaultPickup;
    if (from) {
      setDispCalc(true);
      const route = await getRoute(from, { lat: sug.lat, lon: sug.lon });
      const p = Math.round((BASE + route.distKm * RATE) * (dispSize === 'large' ? 1.4 : 1));
      setDispPrice(p);
      setDispEta(route.durationMin);
      setDispDist(Math.round(route.distKm * 10) / 10);
      setDispCalc(false);
    }
  };

  const resetDispatch = () => {
    setDispCustomer(null);
    setDispTo(''); setDispToCoords(null); setDispToUnit('');
    setDispNotes(''); setDispSize('small');
    setDispPrice(null); setDispEta(null); setDispDist(null);
    setDispToResults([]);
    setDispStep('form');
    setDispFocused(null);
  };

  const handleDispatch = async () => {
    if (!dispTo) return;
    setDispPosting(true);
    const pin = Math.floor(100 + Math.random() * 900).toString();
    const { error } = await supabase.from('orders').insert([{
      user_id:       userId,
      from_address:  defaultPickup?.label || storeName || 'Store',
      to_address:    dispToUnit.trim() ? `${dispToUnit.trim()}, ${dispTo}` : dispTo,
      from_lat:      defaultPickup?.lat || null,
      from_lon:      defaultPickup?.lon || null,
      to_lat:        dispToCoords?.lat || null,
      to_lon:        dispToCoords?.lon || null,
      price:         dispPrice || 0,
      dist_km:       dispDist || null,
      package_size:  dispSize,
      notes:         dispNotes.trim() || null,
      status:        'pending',
      payment_status:'paid',
      delivery_pin:  pin,
      customer_phone:dispCustomer?.phone || null,
    }]);
    setDispPosting(false);
    if (error) { alert(error.message); return; }
    resetDispatch();
    setView('home');
  };

  // ─── Dispatch address search for customer form ────────────────────────
  const handleCustAddrChange = (text) => {
    setCustForm(f => ({ ...f, address: text, lat: null, lon: null }));
    clearTimeout(custFormDebRef.current);
    if (text.length < 2) { setCustFormAddrResults([]); return; }
    setCustFormSearching(true);
    custFormDebRef.current = setTimeout(async () => {
      const r = await fetchSuggestions(text);
      setCustFormAddrResults(r);
      setCustFormSearching(false);
    }, 350);
  };

  const saveCustomer = async () => {
    if (!custForm.name.trim() || !custForm.address.trim()) return;
    const payload = {
      merchant_id: userId,
      name:    custForm.name.trim(),
      phone:   custForm.phone.trim(),
      address: custForm.address.trim(),
      lat:     custForm.lat,
      lon:     custForm.lon,
    };
    if (editingCust) {
      await supabase.from('merchant_customers').update(payload).eq('id', editingCust.id);
    } else {
      await supabase.from('merchant_customers').insert([payload]);
    }
    setShowCustForm(false);
    setEditingCust(null);
    setCustForm({ name: '', phone: '', address: '', lat: null, lon: null });
    setCustFormAddrResults([]);
    loadCustomers(userId);
  };

  const deleteCustomer = async (id) => {
    await supabase.from('merchant_customers').delete().eq('id', id);
    setSavedCustomers(prev => prev.filter(c => c.id !== id));
  };

  const openEditCustomer = (c) => {
    setEditingCust(c);
    setCustForm({ name: c.name, phone: c.phone || '', address: c.address, lat: c.lat, lon: c.lon });
    setCustFormAddrResults([]);
    setShowCustForm(true);
  };

  const selectCustomerForDispatch = (c) => {
    setDispCustomer(c);
    setDispTo(c.address);
    if (c.lat && c.lon) selectDispTo({ label: c.address, lat: c.lat, lon: c.lon });
    setView('dispatch');
  };

  // ─── Filtered lists ───────────────────────────────────────────────────
  const filteredOrders = (() => {
    if (orderFilter === 'active')    return allOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    if (orderFilter === 'delivered') return allOrders.filter(o => o.status === 'delivered');
    if (orderFilter === 'failed')    return allOrders.filter(o => o.status === 'cancelled');
    return allOrders;
  })();

  const filteredCustomers = custSearch.trim()
    ? savedCustomers.filter(c =>
        c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
        (c.address || '').toLowerCase().includes(custSearch.toLowerCase())
      )
    : savedCustomers;

  // ─── Shared bottom bar ────────────────────────────────────────────────
  const bottomBar = (
    <BottomBar
      active={view === 'customers' ? 'home' : view === 'history' ? 'orders' : view}
      role="merchant"
      onPress={(tabId) => {
        if (tabId === 'home')     { setView('home'); setHasAlert(false); }
        else if (tabId === 'orders')   setView('history');
        else if (tabId === 'profile')  navigation.navigate('Profile');
        else if (tabId === 'settings') navigation.navigate('Settings');
      }}
    />
  );

  // ══════════════════════════════════════════════════════════════
  // HOME VIEW
  // ══════════════════════════════════════════════════════════════
  if (view === 'home') {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar greetingText={greetingText} />

        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* Merchant header */}
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.headerLabel}>MERCHANT</Text>
              {editingStoreName ? (
                <View style={s.storeNameEditRow}>
                  <TextInput
                    style={s.storeNameInput}
                    value={storeNameInput}
                    onChangeText={setStoreNameInput}
                    placeholder="Enter store name…"
                    placeholderTextColor={GREY}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={async () => {
                      const trimmed = storeNameInput.trim();
                      if (trimmed) {
                        await supabase.auth.updateUser({ data: { store_name: trimmed } });
                        setStoreName(trimmed);
                      }
                      setEditingStoreName(false);
                    }}
                  />
                  <TouchableOpacity
                    onPress={async () => {
                      const trimmed = storeNameInput.trim();
                      if (trimmed) {
                        await supabase.auth.updateUser({ data: { store_name: trimmed } });
                        setStoreName(trimmed);
                      }
                      setEditingStoreName(false);
                    }}
                    style={s.storeNameSaveBtn}
                    activeOpacity={0.8}
                  >
                    <Text style={s.storeNameSaveTxt}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  onPress={() => { setStoreNameInput(storeName); setEditingStoreName(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={s.headline}>
                    {storeName || (userName ? userName.split(' ')[0] + "'s" : 'Your')}{'\n'}
                    <Text style={{ color: LIME }}>Store.</Text>
                  </Text>
                  <Ionicons name="create-outline" size={18} color={MUTED} style={{ marginBottom: 4 }} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={s.dispatchFab}
              onPress={() => { resetDispatch(); setView('dispatch'); }}
              activeOpacity={0.85}
            >
              <Ionicons name="bicycle" size={22} color={BG} />
              <Text style={s.dispatchFabTxt}>Dispatch</Text>
            </TouchableOpacity>
          </View>

          {/* Stats bar */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statVal}>{todayStats.count}</Text>
              <Text style={s.statLbl}>Today's Orders</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: LIME }]}>R{Math.round(todayStats.spend)}</Text>
              <Text style={s.statLbl}>Today's Spend</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: GREEN }]}>{liveOrders.length}</Text>
              <Text style={s.statLbl}>Live Now</Text>
            </View>
          </View>

          {/* Big dispatch hero */}
          <TouchableOpacity
            style={s.dispatchHero}
            onPress={() => { resetDispatch(); setView('dispatch'); }}
            activeOpacity={0.85}
          >
            <View style={s.dispatchCircle}>
              <Ionicons name="bicycle" size={38} color={BG} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.dispatchTitle}>Dispatch a Rider</Text>
              <Text style={s.dispatchSub}>
                {defaultPickup ? `From: ${defaultPickup.label.split(',')[0]}` : 'Tap to create a new delivery'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={LIME} />
          </TouchableOpacity>

          {/* Quick-action tiles */}
          <View style={s.tileGrid}>
            {[
              { icon: 'people-outline',      label: 'Customers',    accent: AMBER, onPress: () => setView('customers') },
              { icon: 'time-outline',        label: 'History',      accent: BLUE,  onPress: () => setView('history')   },
            ].map((tile, i) => (
              <TouchableOpacity key={i} style={s.tile} onPress={tile.onPress} activeOpacity={0.7}>
                <View style={[s.tileIconWrap, { backgroundColor: tile.accent + '18' }]}>
                  <Ionicons name={tile.icon} size={22} color={tile.accent} />
                </View>
                <Text style={s.tileLbl}>{tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Live orders */}
          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>
              Live Orders
              {hasAlert ? <Text style={{ color: RED }}> ●</Text> : null}
            </Text>
            {liveOrders.length > 0 && (
              <TouchableOpacity onPress={() => setView('history')}>
                <Text style={s.seeAll}>See all →</Text>
              </TouchableOpacity>
            )}
          </View>

          {ordersLoading ? (
            <ActivityIndicator color={LIME} style={{ marginTop: 20 }} />
          ) : liveOrders.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="bicycle-outline" size={40} color={MUTED} />
              <Text style={s.emptyTxt}>No active deliveries</Text>
              <Text style={s.emptySub}>Tap Dispatch to send your first order</Text>
            </View>
          ) : (
            liveOrders.map((order) => {
              const info = si(order.status);
              const isCancelled = order.status === 'pending' && order.rider_id === null;
              return (
                <View key={order.id} style={[s.orderCard, isCancelled && { borderColor: AMBER + '40', borderWidth: 1 }]}>
                  <View style={s.orderLeft}>
                    <View style={[s.statusPill, { backgroundColor: info.color + '18' }]}>
                      <Text style={[s.statusTxt, { color: info.color }]}>{info.label}</Text>
                    </View>
                    <Text style={s.orderAddr} numberOfLines={1}>{order.to_address}</Text>
                    {order.notes ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="document-text-outline" size={11} color={GREY} />
                        <Text style={s.orderNotes} numberOfLines={1}>{order.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={s.orderRight}>
                    <Text style={s.orderPrice}>R{Math.round(order.price)}</Text>
                    {order.rider_name ? (
                      <TouchableOpacity
                        onPress={() => {
                          const riderFirst = order.rider_name.split(' ')[0];
                          const riderPhoneRaw = (order.rider_phone || '').replace(/\D/g,'');
                          const riderIntl = riderPhoneRaw.startsWith('0') ? '27' + riderPhoneRaw.slice(1) : riderPhoneRaw;
                          const phoneLabel = riderIntl ? ` (📞 +${riderIntl})` : '';
                          const msg = encodeURIComponent(
                            `Hi ${riderFirst}! 👋 This is ${storeName || 'your merchant'} on RunIt. Just checking in on order #${String(order.id).slice(-5)} — how's it going?${phoneLabel}`
                          );
                          const target = riderIntl || (order.customer_phone || '').replace(/\D/g,'').replace(/^0/, '27');
                          if (target) Linking.openURL(`https://wa.me/${target}?text=${msg}`);
                        }}
                        style={s.miniWaBtn}
                      >
                        <Ionicons name="logo-whatsapp" size={14} color="#25d366" />
                        <Text style={s.miniWaTxt}>{order.rider_name.split(' ')[0]}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

        </ScrollView>
        {bottomBar}
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DISPATCH VIEW
  // ══════════════════════════════════════════════════════════════
  if (view === 'dispatch') {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar greetingText={greetingText} />

        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>

          <TouchableOpacity onPress={() => { resetDispatch(); setView('home'); }} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>

          <Text style={s.pageTitle}>New<Text style={{ color: LIME }}> Delivery</Text></Text>

          {/* Pickup from */}
          <View style={s.fieldCard}>
            <Text style={s.fieldLabel}>COLLECTING FROM</Text>
            {defaultPickup ? (
              <View style={s.addressConfirmed}>
                <Ionicons name="location" size={14} color={LIME} />
                <Text style={s.addressConfirmedTxt} numberOfLines={1}>{defaultPickup.label}</Text>
                <TouchableOpacity onPress={() => setDefaultPickup(null)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                  <Ionicons name="close-circle" size={16} color={MUTED} />
                </TouchableOpacity>
              </View>
            ) : (
              <DefaultPickupInput
                userId={userId}
                onSet={(dp) => setDefaultPickup(dp)}
              />
            )}
          </View>

          {/* Deliver to */}
          <View style={s.fieldCard}>
            <Text style={s.fieldLabel}>DELIVERING TO</Text>
            {dispCustomer ? (
              <View style={s.addressConfirmed}>
                <Ionicons name="person" size={14} color={AMBER} />
                <Text style={s.addressConfirmedTxt} numberOfLines={1}>{dispCustomer.name} — {dispTo}</Text>
                <TouchableOpacity onPress={() => { setDispCustomer(null); setDispTo(''); setDispToCoords(null); setDispToUnit(''); setDispPrice(null); }} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                  <Ionicons name="close-circle" size={16} color={MUTED} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={[s.input, dispFocused === 'to' && s.inputFocused]}
                  placeholder="Search street, suburb or business name…"
                  placeholderTextColor={GREY}
                  value={dispTo}
                  onChangeText={handleDispToChange}
                  onFocus={() => setDispFocused('to')}
                  onBlur={() => setDispFocused(null)}
                />
                {dispToSearching && <ActivityIndicator color={LIME} size="small" style={{ marginTop: 8 }} />}
                {dispToResults.length > 0 && (
                  <View style={s.dropdownList}>
                    {dispToResults.map((r, i) => (
                      <TouchableOpacity key={i} style={s.dropdownRow} onPress={() => selectDispTo(r)} activeOpacity={0.7}>
                        <Ionicons name="location-outline" size={14} color={LIME} />
                        <Text style={s.dropdownTxt} numberOfLines={2}>{r.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {/* Unit / flat / complex refinement — shown once a street is selected */}
                {dispToCoords && (
                  <TextInput
                    style={[s.input, { marginTop: 8, borderColor: '#2a2a2a' }]}
                    placeholder="Unit / Flat / Complex / Floor (optional)"
                    placeholderTextColor={GREY}
                    value={dispToUnit}
                    onChangeText={setDispToUnit}
                  />
                )}
                {/* Saved customer quick picks */}
                {savedCustomers.length > 0 && !dispTo && (
                  <>
                    <Text style={s.savedCustLabel}>Saved customers</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
                      {savedCustomers.map((c, i) => (
                        <TouchableOpacity key={i} style={s.custChip} onPress={() => selectCustomerForDispatch(c)} activeOpacity={0.7}>
                          <Ionicons name="person-circle-outline" size={14} color={AMBER} />
                          <Text style={s.custChipTxt}>{c.name.split(' ')[0]}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}
              </>
            )}
          </View>

          {/* Package size */}
          <View style={s.fieldCard}>
            <Text style={s.fieldLabel}>PACKAGE SIZE</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              {PACKAGE_SIZES.map(sz => {
                const active = dispSize === sz.id;
                return (
                  <TouchableOpacity
                    key={sz.id}
                    style={[s.sizeCard, active && s.sizeCardActive]}
                    onPress={() => {
                      setDispSize(sz.id);
                      if (dispPrice && dispDist) {
                        const p = Math.round((BASE + dispDist * RATE) * (sz.id === 'large' ? 1.4 : 1));
                        setDispPrice(p);
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={[s.sizeIconWrap, active && s.sizeIconWrapActive]}>
                      <Ionicons name={sz.icon} size={22} color={active ? BG : LIME} />
                    </View>
                    <Text style={[s.sizeName, active && { color: BG }]}>{sz.name}</Text>
                    <Text style={[s.sizeWeight, active && { color: BG }]}>{sz.weight}</Text>
                    <Text style={[s.sizeDim, active && { color: BG + 'bb' }]}>{sz.dim}</Text>
                    <Text style={[s.sizeExamples, active && { color: BG + '99' }]}>{sz.examples}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notes */}
          <View style={s.fieldCard}>
            <Text style={s.fieldLabel}>DELIVERY NOTES (OPTIONAL)</Text>
            <TextInput
              style={[s.input, s.notesInput, dispFocused === 'notes' && s.inputFocused]}
              placeholder="e.g. Fragile, ring bell, leave at reception…"
              placeholderTextColor={GREY}
              value={dispNotes}
              onChangeText={setDispNotes}
              onFocus={() => setDispFocused('notes')}
              onBlur={() => setDispFocused(null)}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Price preview */}
          {dispCalc ? (
            <View style={s.priceCard}>
              <ActivityIndicator color={LIME} size="small" />
              <Text style={s.priceCalcTxt}>Calculating price…</Text>
            </View>
          ) : dispPrice ? (
            <View style={s.priceCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.priceLabel}>ESTIMATED PRICE</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <Text style={s.priceCurr}>R</Text>
                  <Text style={s.priceAmt}>{dispPrice}</Text>
                </View>
                <Text style={s.priceMeta}>{dispDist} km · ~{dispEta} min</Text>
              </View>
              <Ionicons name="checkmark-circle" size={28} color={LIME} />
            </View>
          ) : null}

          {/* Dispatch button */}
          <TouchableOpacity
            style={[s.dispatchBtn, (!dispTo || dispPosting) && { opacity: 0.45 }]}
            onPress={handleDispatch}
            disabled={!dispTo || dispPosting}
            activeOpacity={0.85}
          >
            {dispPosting
              ? <ActivityIndicator color={BG} />
              : <>
                  <Ionicons name="bicycle" size={20} color={BG} />
                  <Text style={s.dispatchBtnTxt}>
                    Dispatch Now{dispPrice ? ` · R${dispPrice}` : ''}
                  </Text>
                </>
            }
          </TouchableOpacity>

        </ScrollView>
        {bottomBar}
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // CUSTOMERS / ADDRESS BOOK VIEW
  // ══════════════════════════════════════════════════════════════
  if (view === 'customers') {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar greetingText={greetingText} />

        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>

          <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>

          <View style={s.headerRow}>
            <View>
              <Text style={s.headerLabel}>ADDRESS BOOK</Text>
              <Text style={s.headline}>Customers.</Text>
            </View>
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => { setEditingCust(null); setCustForm({ name: '', phone: '', address: '', lat: null, lon: null }); setCustFormAddrResults([]); setShowCustForm(true); }}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={BG} />
              <Text style={s.addBtnTxt}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={16} color={GREY} />
            <TextInput
              style={s.searchInput}
              placeholder="Search name or address…"
              placeholderTextColor={GREY}
              value={custSearch}
              onChangeText={setCustSearch}
            />
            {custSearch.length > 0 && (
              <TouchableOpacity onPress={() => setCustSearch('')} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                <Ionicons name="close-circle" size={16} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>

          {custLoading ? (
            <ActivityIndicator color={LIME} style={{ marginTop: 24 }} />
          ) : filteredCustomers.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="people-outline" size={40} color={MUTED} />
              <Text style={s.emptyTxt}>{custSearch ? 'No results' : 'No saved customers yet'}</Text>
              <Text style={s.emptySub}>Add a customer to speed up dispatch</Text>
            </View>
          ) : (
            filteredCustomers.map((c) => (
              <View key={c.id} style={s.custCard}>
                <View style={s.custAvatar}>
                  <Text style={s.custAvatarTxt}>{c.name.trim()[0]?.toUpperCase()}</Text>
                </View>
                <View style={s.custInfo}>
                  <Text style={s.custName}>{c.name}</Text>
                  {c.phone ? <Text style={s.custPhone}>{c.phone}</Text> : null}
                  <Text style={s.custAddr} numberOfLines={1}>{c.address}</Text>
                </View>
                <View style={s.custActions}>
                  <TouchableOpacity
                    style={s.custDispatchBtn}
                    onPress={() => selectCustomerForDispatch(c)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="bicycle" size={14} color={BG} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEditCustomer(c)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                    <Ionicons name="create-outline" size={18} color={GREY} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteCustomer(c.id)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                    <Ionicons name="trash-outline" size={18} color={RED + 'aa'} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Add/Edit customer sheet */}
        {showCustForm && (
          <View style={s.sheetOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowCustForm(false)} />
            <View style={s.sheet}>
              <View style={s.sheetBar} />
              <Text style={s.sheetTitle}>{editingCust ? 'Edit Customer' : 'New Customer'}</Text>

              <Text style={s.inputLbl}>NAME</Text>
              <TextInput style={s.input} placeholder="e.g. Naledi Dube" placeholderTextColor={GREY}
                value={custForm.name} onChangeText={v => setCustForm(f => ({ ...f, name: v }))} />

              <Text style={s.inputLbl}>PHONE</Text>
              <TextInput style={s.input} placeholder="082 000 0000" placeholderTextColor={GREY}
                keyboardType="phone-pad" value={custForm.phone}
                onChangeText={v => setCustForm(f => ({ ...f, phone: v }))} />

              <Text style={s.inputLbl}>DELIVERY ADDRESS</Text>
              <TextInput style={s.input} placeholder="Search address…" placeholderTextColor={GREY}
                value={custForm.address} onChangeText={handleCustAddrChange} />
              {custFormSearching && <ActivityIndicator color={LIME} size="small" style={{ marginTop: 6 }} />}
              {custFormAddrResults.length > 0 && (
                <View style={s.dropdownList}>
                  {custFormAddrResults.map((r, i) => (
                    <TouchableOpacity key={i} style={s.dropdownRow} activeOpacity={0.7}
                      onPress={() => {
                        setCustForm(f => ({ ...f, address: r.label, lat: r.lat, lon: r.lon }));
                        setCustFormAddrResults([]);
                      }}>
                      <Ionicons name="location-outline" size={14} color={LIME} />
                      <Text style={s.dropdownTxt} numberOfLines={1}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[s.dispatchBtn, { marginTop: 20 }, (!custForm.name.trim() || !custForm.address.trim()) && { opacity: 0.45 }]}
                onPress={saveCustomer}
                disabled={!custForm.name.trim() || !custForm.address.trim()}
                activeOpacity={0.85}
              >
                <Text style={s.dispatchBtnTxt}>{editingCust ? 'Save Changes' : 'Save Customer'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCustForm(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {bottomBar}
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // HISTORY VIEW
  // ══════════════════════════════════════════════════════════════
  if (view === 'history') {
    const totalSpend = allOrders
      .filter(o => o.status === 'delivered')
      .reduce((s, o) => s + (parseFloat(o.price) || 0), 0);

    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <TopBar greetingText={greetingText} />

        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>

          <Text style={s.headerLabel}>DELIVERY HISTORY</Text>
          <Text style={[s.headline, { marginBottom: 16 }]}>
            All Orders.
          </Text>

          {/* Total spend */}
          <View style={s.historyHero}>
            <Text style={s.historyHeroLabel}>TOTAL SPEND</Text>
            <Text style={s.historyHeroAmt}>R{Math.round(totalSpend)}</Text>
            <Text style={s.historyHeroMeta}>{allOrders.filter(o => o.status === 'delivered').length} deliveries completed</Text>
          </View>

          {/* Filter tabs */}
          <View style={s.filterRow}>
            {['all', 'active', 'delivered', 'failed'].map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterTab, orderFilter === f && s.filterTabActive]}
                onPress={() => setOrderFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[s.filterTabTxt, orderFilter === f && s.filterTabTxtActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {ordersLoading ? (
            <ActivityIndicator color={LIME} style={{ marginTop: 24 }} />
          ) : filteredOrders.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyTxt}>No orders in this filter</Text>
            </View>
          ) : (
            filteredOrders.map((order) => {
              const info = si(order.status);
              const d = new Date(order.created_at);
              const dateStr = d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
              const timeStr = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
              return (
                <View key={order.id} style={s.historyCard}>
                  <View style={s.historyCardTop}>
                    <View style={[s.statusPill, { backgroundColor: info.color + '18' }]}>
                      <Text style={[s.statusTxt, { color: info.color }]}>{info.label}</Text>
                    </View>
                    <Text style={s.historyPrice}>R{Math.round(order.price)}</Text>
                  </View>
                  <Text style={s.historyAddr} numberOfLines={1}>→ {order.to_address}</Text>
                  {order.from_address ? (
                    <Text style={s.historyFrom} numberOfLines={1}>↑ {order.from_address}</Text>
                  ) : null}
                  <View style={s.historyMeta}>
                    <Text style={s.historyDate}>{dateStr} · {timeStr}</Text>
                    {order.rider_name ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="bicycle" size={11} color={GREY} />
                        <Text style={s.historyRider}>{order.rider_name}</Text>
                      </View>
                    ) : null}
                  </View>
                  {order.notes ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="document-text-outline" size={11} color={GREY} />
                      <Text style={s.historyNotes} numberOfLines={1}>{order.notes}</Text>
                    </View>
                  ) : null}
                  {/* Contact rider */}
                  {order.rider_name && (order.rider_phone || order.customer_phone) ? (
                    <TouchableOpacity
                      style={s.waRowBtn}
                      onPress={() => {
                        const riderFirst = order.rider_name.split(' ')[0];
                        const riderPhoneRaw = (order.rider_phone || '').replace(/\D/g,'');
                        const riderIntl = riderPhoneRaw.startsWith('0') ? '27' + riderPhoneRaw.slice(1) : riderPhoneRaw;
                        const custPhoneRaw = (order.customer_phone || '').replace(/\D/g,'');
                        const custIntl = custPhoneRaw.startsWith('0') ? '27' + custPhoneRaw.slice(1) : custPhoneRaw;
                        const target = riderIntl || custIntl;
                        const msg = encodeURIComponent(`Hi ${riderFirst}! 👋 This is ${storeName || 'your merchant'} from RunIt — following up on order #${String(order.id).slice(-5)}.`);
                        if (target) Linking.openURL(`https://wa.me/${target}?text=${msg}`);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="logo-whatsapp" size={14} color="#25d366" />
                      <Text style={s.waRowTxt}>Message rider</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
        {bottomBar}
      </View>
    );
  }

  return null;
}

// ─── Default pickup address input (inline component) ─────────────────────
function DefaultPickupInput({ userId, onSet }) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [searching,setSearching]= useState(false);
  const [selected, setSelected] = useState(null);  // geocoded base address
  const [unitDetail, setUnitDetail] = useState(''); // unit / flat / complex
  const [saving,   setSaving]   = useState(false);
  const debRef = useRef(null);

  const handleChange = (text) => {
    setQuery(text);
    setSelected(null);
    setUnitDetail('');
    clearTimeout(debRef.current);
    if (text.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debRef.current = setTimeout(async () => {
      const r = await fetchSuggestions(text);
      setResults(r);
      setSearching(false);
    }, 350);
  };

  const pickSuggestion = (sug) => {
    setSelected(sug);
    setQuery(sug.label);
    setResults([]);
    setUnitDetail('');
  };

  const confirm = async () => {
    if (!selected) return;
    setSaving(true);
    const fullLabel = unitDetail.trim()
      ? `${unitDetail.trim()}, ${selected.label}`
      : selected.label;
    const dp = { label: fullLabel, lat: selected.lat, lon: selected.lon };
    if (userId) await supabase.auth.updateUser({ data: { default_pickup: dp } });
    onSet(dp);
    setSaving(false);
  };

  return (
    <View style={{ marginTop: 8 }}>
      {/* Street / suburb / business search */}
      <TextInput
        style={dp.input}
        placeholder="Search street, suburb or business name…"
        placeholderTextColor={GREY}
        value={query}
        onChangeText={handleChange}
        autoCorrect={false}
      />
      {searching && <ActivityIndicator color={LIME} size="small" style={{ marginTop: 6 }} />}
      {results.length > 0 && (
        <View style={s.dropdownList}>
          {results.map((r, i) => (
            <TouchableOpacity key={i} style={s.dropdownRow} onPress={() => pickSuggestion(r)} activeOpacity={0.7}>
              <Ionicons name="location-outline" size={14} color={LIME} />
              <Text style={s.dropdownTxt} numberOfLines={2}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Step 2 — unit / complex refinement + confirm */}
      {selected && (
        <View style={dp.refineBox}>
          <View style={dp.refineRow}>
            <Ionicons name="checkmark-circle" size={14} color={LIME} style={{ marginTop: 1 }} />
            <Text style={dp.refineAddr} numberOfLines={2}>{selected.label}</Text>
          </View>
          <TextInput
            style={[dp.input, { marginTop: 10 }]}
            placeholder="Unit / Flat / Complex / Floor (optional)"
            placeholderTextColor={GREY}
            value={unitDetail}
            onChangeText={setUnitDetail}
            autoCorrect={false}
          />
          <TouchableOpacity style={dp.confirmBtn} onPress={confirm} disabled={saving} activeOpacity={0.8}>
            {saving
              ? <ActivityIndicator color={BG} size="small" />
              : <>
                  <Ionicons name="pin" size={15} color={BG} />
                  <Text style={dp.confirmTxt}>Set as pickup address</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      <Text style={dp.hint}>
        {selected
          ? 'Add a unit, flat or complex number if needed, then tap Set.'
          : 'This becomes your default pickup for every dispatch'}
      </Text>
    </View>
  );
}

const dp = StyleSheet.create({
  input: {
    backgroundColor: SURFACE, borderWidth: 1.5, borderColor: MUTED,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
    color: '#fff', fontSize: 14, fontWeight: '500',
  },
  hint: { fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 16 },
  refineBox: {
    marginTop: 10, backgroundColor: '#161616',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#222',
  },
  refineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  refineAddr: { flex: 1, fontSize: 13, color: '#ccc', fontWeight: '500', lineHeight: 18 },
  confirmBtn: {
    marginTop: 12, backgroundColor: LIME,
    borderRadius: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  confirmTxt: { fontSize: 14, fontWeight: '700', color: BG },
});

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 20, paddingTop: 96, paddingBottom: 110 },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
  headerLabel: { fontSize: 10, fontWeight: '700', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 },
  headline: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -0.5, lineHeight: 42 },
  storeNameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  storeNameInput: {
    flex: 1, backgroundColor: SURFACE2, borderWidth: 1.5, borderColor: LIME + '50',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    color: '#fff', fontSize: 24, fontWeight: '900',
  },
  storeNameSaveBtn: { backgroundColor: LIME, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  storeNameSaveTxt: { fontSize: 14, fontWeight: '900', color: BG },

  dispatchFab: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: LIME, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: LIME, shadowOffset: {width:0,height:6}, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
  },
  dispatchFabTxt: { fontSize: 14, fontWeight: '900', color: BG },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 18, padding: 14, alignItems: 'center' },
  statVal:  { fontSize: 17, fontWeight: '900', color: '#fff', marginBottom: 2 },
  statLbl:  { fontSize: 10, color: GREY, fontWeight: '600', textAlign: 'center' },

  // Dispatch hero
  dispatchHero: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: SURFACE, borderRadius: 22,
    padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: LIME + '30',
  },
  dispatchCircle: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: {width:0,height:0}, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  dispatchTitle: { fontSize: 17, fontWeight: '900', color: '#fff', marginBottom: 3 },
  dispatchSub:   { fontSize: 12, color: GREY },

  // Tiles
  tileGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  tile: { flex: 1, backgroundColor: SURFACE, borderRadius: 18, padding: 18 },
  tileIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tileLbl: { fontSize: 14, fontWeight: '800', color: '#ccc' },

  // Section
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 2 },
  seeAll: { fontSize: 12, color: LIME, fontWeight: '700' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTxt:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  emptySub:  { fontSize: 13, color: GREY },

  // Live order card
  orderCard: {
    backgroundColor: SURFACE, borderRadius: 18, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  orderLeft:  { flex: 1, gap: 5 },
  orderRight: { alignItems: 'flex-end', gap: 8, paddingLeft: 10 },
  orderAddr:  { fontSize: 14, fontWeight: '700', color: '#fff' },
  orderNotes: { fontSize: 11, color: GREY },
  orderPrice: { fontSize: 16, fontWeight: '900', color: LIME },
  statusPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  statusTxt:  { fontSize: 10, fontWeight: '800' },
  miniWaBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#25d36615', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  miniWaTxt:  { fontSize: 11, color: '#25d366', fontWeight: '700' },

  // Dispatch form
  pageTitle: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 20 },
  fieldCard:  { backgroundColor: SURFACE, borderRadius: 18, padding: 16, marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: GREY, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  addressConfirmed: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: SURFACE2, borderRadius: 12, padding: 12,
  },
  addressConfirmedTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  input: {
    backgroundColor: SURFACE2, borderWidth: 1.5, borderColor: MUTED,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
    color: '#fff', fontSize: 14, fontWeight: '500',
  },
  inputFocused: { borderColor: LIME + '60' },
  notesInput: { minHeight: 64, textAlignVertical: 'top', paddingTop: 13 },
  dropdownList: { backgroundColor: '#161616', borderRadius: 14, marginTop: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a' },
  dropdownRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  dropdownTxt:  { fontSize: 14, color: '#ccc', fontWeight: '500', flex: 1 },
  savedCustLabel: { fontSize: 10, color: GREY, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  custChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e1e1e', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  custChipTxt: { fontSize: 13, color: '#ddd', fontWeight: '700' },
  sizeCard: {
    flex: 1, backgroundColor: SURFACE2, borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: MUTED, gap: 3,
  },
  sizeCardActive: { backgroundColor: LIME, borderColor: LIME },
  sizeIconWrap: {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  sizeIconWrapActive: { backgroundColor: 'rgba(0,0,0,0.18)' },
  sizeName:     { fontSize: 16, fontWeight: '800', color: '#fff' },
  sizeWeight:   { fontSize: 12, fontWeight: '700', color: LIME, marginTop: 1 },
  sizeDim:      { fontSize: 11, fontWeight: '500', color: GREY, marginTop: 1 },
  sizeExamples: { fontSize: 10, color: MUTED, lineHeight: 15, marginTop: 4 },
  priceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1a00', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: LIME + '30' },
  priceLabel:   { fontSize: 10, color: LIME, fontWeight: '700', letterSpacing: 2 },
  priceCurr:    { fontSize: 22, fontWeight: '900', color: GREY },
  priceAmt:     { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  priceMeta:    { fontSize: 12, color: GREY, marginTop: 2 },
  priceCalcTxt: { fontSize: 14, color: GREY, marginLeft: 10 },
  dispatchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: LIME, borderRadius: 16, height: 58, marginTop: 8,
    shadowColor: LIME, shadowOffset: {width:0,height:8}, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  dispatchBtnTxt: { fontSize: 17, fontWeight: '900', color: BG },
  cancelTxt: { color: GREY, fontSize: 14, textAlign: 'center', marginTop: 16 },

  // Customers
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LIME, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnTxt: { fontSize: 13, fontWeight: '900', color: BG },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: SURFACE, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#1e1e1e', marginBottom: 16,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  custCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 18, padding: 14, marginBottom: 10, gap: 12 },
  custAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: AMBER + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  custAvatarTxt: { fontSize: 18, fontWeight: '900', color: AMBER },
  custInfo: { flex: 1, gap: 2 },
  custName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  custPhone: { fontSize: 12, color: GREY },
  custAddr: { fontSize: 12, color: '#888' },
  custActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  custDispatchBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },

  // Sheet overlay
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end', zIndex: 200 },
  sheet: { backgroundColor: '#141414', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48 },
  sheetBar: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 12 },
  inputLbl: { fontSize: 10, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, marginTop: 14 },

  // History
  historyHero: { backgroundColor: SURFACE, borderRadius: 22, padding: 22, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: LIME + '20' },
  historyHeroLabel: { fontSize: 10, color: LIME, fontWeight: '700', letterSpacing: 3, marginBottom: 6 },
  historyHeroAmt: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  historyHeroMeta: { fontSize: 12, color: GREY, marginTop: 4 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterTab: { flex: 1, backgroundColor: SURFACE, borderRadius: 12, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e1e' },
  filterTabActive: { backgroundColor: LIME + '18', borderColor: LIME },
  filterTabTxt: { fontSize: 11, fontWeight: '700', color: GREY },
  filterTabTxtActive: { color: LIME },
  historyCard: { backgroundColor: SURFACE, borderRadius: 18, padding: 16, marginBottom: 10, gap: 5 },
  historyCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyPrice: { fontSize: 18, fontWeight: '900', color: LIME },
  historyAddr: { fontSize: 14, fontWeight: '700', color: '#fff' },
  historyFrom: { fontSize: 12, color: GREY },
  historyMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { fontSize: 11, color: MUTED },
  historyRider: { fontSize: 11, color: GREY },
  historyNotes: { fontSize: 11, color: GREY },
  waRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#25d36615', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  waRowTxt: { fontSize: 12, color: '#25d366', fontWeight: '700' },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },
});
