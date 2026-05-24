import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import LogoMenu from './LogoMenu';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const BORDER = '#1e1e1e';
const MUTED = '#444';
const GREY = '#777';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const BLUE = '#3b82f6';

const STATUS_INFO = {
  on_way:  { label: 'On Way',    color: AMBER },
  prep:    { label: 'Preparing', color: BLUE  },
  done:    { label: 'Done',      color: GREEN },
  pending: { label: 'Pending',   color: GREY  },
};

export default function MerchantScreen({ navigation }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('home');
  const [userId, setUserId] = useState(null);
  const [focused, setFocused] = useState(null);
  const [orders, setOrders] = useState([
    { id: '#047', customer: 'Naledi D.', route: 'Woodstock → Sea Point', status: 'on_way',  price: 55 },
    { id: '#046', customer: 'Thabo N.',  route: 'CBD → Gardens',          status: 'prep',    price: 35 },
    { id: '#045', customer: 'Zanele M.', route: 'Woodstock → Obs',        status: 'done',    price: 42 },
    { id: '#044', customer: 'Sipho K.',  route: 'CBD → Camps Bay',        status: 'done',    price: 88 },
  ]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const dispatchOrder = async () => {
    if (!customerName || !address || !phone) {
      Alert.alert('Missing Info', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('orders').insert([{
      to_address: address,
      status: 'pending',
      user_id: userId,
    }]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const newOrder = {
        id: '#0' + (orders.length + 48),
        customer: customerName,
        route: 'Store → ' + address,
        status: 'prep',
        price: 45,
      };
      setOrders(prev => [newOrder, ...prev]);
      setModalVisible(false);
      setCustomerName('');
      setAddress('');
      setPhone('');
    }
  };

  const getStatusInfo = (status) => STATUS_INFO[status] || STATUS_INFO.pending;
  const liveOrders = orders.filter(o => o.status !== 'done');
  const totalRevenue = orders.reduce((sum, o) => sum + o.price, 0);

  const inputStyle = (field) => [s.input, focused === field && s.inputFocused];

  const logoMenu = (
    <LogoMenu
      onSignOut={handleSignOut}
      onOrders={() => setView('orders')}
      onProfile={() => navigation.navigate('Profile')}
      onSettings={() => navigation.navigate('Settings')}
    />
  );

  if (view === 'home') {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        {logoMenu}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          <View style={s.headerRow}>
            <View>
              <Text style={s.headerLabel}>BUSINESS</Text>
              <Text style={s.headline}>Your Store.</Text>
            </View>
            <TouchableOpacity style={s.newOrderBtn} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={BG} />
              <Text style={s.newOrderTxt}>New Order</Text>
            </TouchableOpacity>
          </View>

          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statVal}>R {totalRevenue.toLocaleString()}</Text>
              <Text style={s.statLbl}>Revenue</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{orders.length}</Text>
              <Text style={s.statLbl}>Deliveries</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: GREEN }]}>94%</Text>
              <Text style={s.statLbl}>On Time</Text>
            </View>
          </View>

          <TouchableOpacity style={s.dispatchHero} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
            <View style={s.dispatchCircle}>
              <Ionicons name="bicycle" size={40} color={BG} />
            </View>
            <View>
              <Text style={s.dispatchTitle}>Dispatch a Rider</Text>
              <Text style={s.dispatchSub}>Create a new delivery now</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={LIME} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <View style={s.tileGrid}>
            {[
              { icon: 'list-outline',        label: 'All Orders', accent: LIME,      onPress: () => setView('orders') },
              { icon: 'trending-up-outline', label: 'Analytics',  accent: BLUE,      onPress: () => {} },
              { icon: 'people-outline',      label: 'Customers',  accent: AMBER,     onPress: () => {} },
              { icon: 'settings-outline',    label: 'Settings',   accent: '#a78bfa', onPress: () => navigation.navigate('Settings') },
            ].map((tile, i) => (
              <TouchableOpacity key={i} style={s.tile} onPress={tile.onPress} activeOpacity={0.7}>
                <View style={[s.tileIconWrap, { backgroundColor: tile.accent + '15' }]}>
                  <Ionicons name={tile.icon} size={22} color={tile.accent} />
                </View>
                <Text style={s.tileLbl}>{tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>Live Orders</Text>
            <TouchableOpacity onPress={() => setView('orders')}>
              <Text style={s.seeAll}>See all →</Text>
            </TouchableOpacity>
          </View>

          {liveOrders.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyTxt}>No active orders</Text>
              <Text style={s.emptySub}>Tap New Order to dispatch a rider</Text>
            </View>
          ) : liveOrders.map((order, i) => {
            const si = getStatusInfo(order.status);
            return (
              <View key={i} style={s.orderCard}>
                <View style={s.orderLeft}>
                  <Text style={s.orderId}>{order.id}</Text>
                  <Text style={s.orderCustomer}>{order.customer}</Text>
                  <Text style={s.orderRoute}>{order.route}</Text>
                </View>
                <View style={s.orderRight}>
                  <View style={[s.statusPill, { backgroundColor: si.color + '18' }]}>
                    <Text style={[s.statusTxt, { color: si.color }]}>{si.label}</Text>
                  </View>
                  <Text style={s.orderPrice}>R {order.price}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={s.modalBg}>
            <View style={s.modalSheet}>
              <View style={s.sheetBar} />
              <Text style={s.modalTitle}>New <Text style={{ color: LIME }}>Delivery</Text></Text>
              <Text style={s.modalSub}>Fill in the details below</Text>

              <Text style={s.inputLbl}>Customer Name</Text>
              <TextInput
                style={inputStyle('name')}
                placeholder="e.g. Naledi Dube"
                placeholderTextColor={MUTED}
                value={customerName}
                onChangeText={setCustomerName}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
              />
              <Text style={s.inputLbl}>Delivery Address</Text>
              <TextInput
                style={inputStyle('address')}
                placeholder="Area or street"
                placeholderTextColor={MUTED}
                value={address}
                onChangeText={setAddress}
                onFocus={() => setFocused('address')}
                onBlur={() => setFocused(null)}
              />
              <Text style={s.inputLbl}>Phone</Text>
              <TextInput
                style={inputStyle('phone')}
                placeholder="082 000 0000"
                placeholderTextColor={MUTED}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
              />

              <TouchableOpacity
                style={[s.dispatchBtn, loading && { opacity: 0.6 }]}
                onPress={dispatchOrder}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Ionicons name="bicycle" size={18} color={BG} />
                <Text style={s.dispatchBtnTxt}>{loading ? 'Creating…' : 'Dispatch Now'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  if (view === 'orders') {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        {logoMenu}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setView('home')} style={s.backRow}>
            <Ionicons name="arrow-back" size={18} color={GREY} />
            <Text style={s.backTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={s.pageHeadline}>All</Text>
          <Text style={[s.pageHeadline, { color: LIME }]}>Orders.</Text>

          {orders.map((order, i) => {
            const si = getStatusInfo(order.status);
            return (
              <View key={i} style={s.orderCardFull}>
                <View style={s.orderCardTop}>
                  <View style={[s.statusPill, { backgroundColor: si.color + '18' }]}>
                    <Text style={[s.statusTxt, { color: si.color }]}>{si.label}</Text>
                  </View>
                  <Text style={s.orderPrice}>R {order.price}</Text>
                </View>
                <Text style={s.orderId}>{order.id} · <Text style={s.orderCustomer}>{order.customer}</Text></Text>
                <Text style={s.orderRoute}>{order.route}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 80 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  headerLabel: { fontSize: 11, fontWeight: '700', color: LIME, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 },
  headline: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  newOrderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: LIME, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  newOrderTxt: { fontSize: 13, fontWeight: '900', color: BG },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: SURFACE,
    borderRadius: 18, padding: 16, alignItems: 'center',
  },
  statVal: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 3 },
  statLbl: { fontSize: 11, color: GREY, fontWeight: '600' },

  dispatchHero: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: SURFACE, borderRadius: 22,
    padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: LIME + '30',
  },
  dispatchCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45, shadowRadius: 24, elevation: 12,
  },
  dispatchTitle: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 3 },
  dispatchSub: { fontSize: 13, color: GREY },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  tile: { width: '47.5%', backgroundColor: SURFACE, borderRadius: 18, padding: 18 },
  tileIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tileLbl: { fontSize: 14, fontWeight: '800', color: '#ccc' },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 2 },
  seeAll: { fontSize: 12, color: LIME, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 6 },
  emptySub: { fontSize: 13, color: GREY },

  orderCard: {
    backgroundColor: SURFACE, borderRadius: 18, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  orderLeft: { flex: 1, gap: 2 },
  orderId: { fontSize: 13, fontWeight: '900', color: LIME },
  orderCustomer: { fontSize: 15, fontWeight: '800', color: '#fff' },
  orderRoute: { fontSize: 12, color: GREY, marginTop: 2 },
  orderRight: { alignItems: 'flex-end', gap: 8 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusTxt: { fontSize: 11, fontWeight: '800' },
  orderPrice: { fontSize: 18, fontWeight: '900', color: LIME },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#141414', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingBottom: 48 },
  sheetBar: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 36, fontWeight: '900', color: '#fff', marginBottom: 4 },
  modalSub: { fontSize: 14, color: GREY, marginBottom: 24 },
  inputLbl: { fontSize: 10, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: SURFACE, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    color: '#fff', fontSize: 15, fontWeight: '600',
  },
  inputFocused: { borderColor: 'rgba(200,240,0,0.4)', backgroundColor: '#141414' },
  dispatchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: LIME, borderRadius: 16, height: 58, marginTop: 24,
    shadowColor: LIME, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
  },
  dispatchBtnTxt: { fontSize: 17, fontWeight: '900', color: BG },
  cancelTxt: { color: GREY, fontSize: 14, textAlign: 'center', marginTop: 16 },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },
  pageHeadline: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 56 },
  orderCardFull: { backgroundColor: SURFACE, borderRadius: 18, padding: 16, marginBottom: 10, marginTop: 6 },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
});
