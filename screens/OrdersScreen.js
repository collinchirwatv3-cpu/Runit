import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import LogoMenu from './LogoMenu';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const MUTED = '#444';
const GREY = '#777';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const BLUE = '#3b82f6';

const STATUS_MAP = {
  pending:    { label: 'Pending',    color: BLUE  },
  on_the_way: { label: 'On the Way', color: AMBER },
  delivered:  { label: 'Delivered',  color: GREEN },
  cancelled:  { label: 'Cancelled',  color: MUTED },
};

export default function OrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.id) { setLoading(false); return; }
      const uid = user.id;

      // Initial load
      const load = async () => {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });
        setOrders(data || []);
        setLoading(false);
      };

      load();

      // Real-time: refetch whenever any order belonging to this user changes
      channel = supabase.channel('my_orders')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${uid}`,
        }, load)
        .subscribe();
    });

    return () => { channel?.unsubscribe(); };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const statusInfo = (status) => STATUS_MAP[status] || { label: status || 'Unknown', color: GREY };

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <LogoMenu
        onSignOut={handleSignOut}
        onOrders={() => {}}
        onProfile={() => navigation.navigate('Profile')}
        onSettings={() => navigation.navigate('Settings')}
      />

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backRow}>
          <Ionicons name="arrow-back" size={18} color={GREY} />
          <Text style={s.backTxt}>Back</Text>
        </TouchableOpacity>

        <Text style={s.headline}>My{'\n'}<Text style={s.headlineAccent}>Orders.</Text></Text>

        {loading && (
          <View style={s.loadWrap}>
            <ActivityIndicator color={LIME} size="large" />
          </View>
        )}

        {!loading && orders.length === 0 && (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Ionicons name="cube-outline" size={40} color={GREY} />
            </View>
            <Text style={s.emptyTxt}>No orders yet</Text>
            <Text style={s.emptySub}>Your deliveries will show up here</Text>
            <TouchableOpacity style={s.sendBtn} onPress={() => navigation.navigate('Customer')} activeOpacity={0.85}>
              <Text style={s.sendBtnTxt}>Send a Package</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && orders.map((order, i) => {
          const si = statusInfo(order.status);
          return (
            <View key={order.id || i} style={s.orderCard}>
              <View style={s.orderTop}>
                <View style={[s.statusPill, { backgroundColor: si.color + '18' }]}>
                  <View style={[s.statusDot, { backgroundColor: si.color }]} />
                  <Text style={[s.statusTxt, { color: si.color }]}>{si.label}</Text>
                </View>
                <Text style={s.orderPrice}>R {order.price || '—'}</Text>
              </View>

              <View style={s.routeBlock}>
                <View style={s.addrRow}>
                  <View style={[s.dot, { backgroundColor: LIME }]} />
                  <Text style={s.addrTxt} numberOfLines={1}>{order.from_address || 'Pickup'}</Text>
                </View>
                <View style={s.connector}>
                  <View style={s.connLine} />
                </View>
                <View style={s.addrRow}>
                  <View style={[s.dot, { backgroundColor: '#ef4444' }]} />
                  <Text style={s.addrTxt} numberOfLines={1}>{order.to_address || 'Drop-off'}</Text>
                </View>
              </View>

              <View style={s.orderMeta}>
                {order.dist_km && (
                  <View style={s.metaChip}>
                    <Ionicons name="navigate-outline" size={11} color={GREY} />
                    <Text style={s.metaTxt}>{order.dist_km} km</Text>
                  </View>
                )}
                <Text style={s.orderDate}>
                  {new Date(order.created_at).toLocaleDateString('en-ZA', {
                    day: 'numeric', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          );
        })}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 80 },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },

  headline: { fontSize: 56, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 60, marginBottom: 28 },
  headlineAccent: { color: LIME },

  loadWrap: { paddingTop: 60, alignItems: 'center' },

  emptyWrap: { alignItems: 'center', marginTop: 48 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTxt: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 6 },
  emptySub: { fontSize: 14, color: GREY, marginBottom: 28 },
  sendBtn: {
    backgroundColor: LIME, borderRadius: 16, paddingHorizontal: 28, height: 50,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  sendBtnTxt: { fontSize: 15, fontWeight: '900', color: BG },

  orderCard: { backgroundColor: SURFACE, borderRadius: 20, padding: 18, marginBottom: 12 },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 12, fontWeight: '800' },
  orderPrice: { fontSize: 22, fontWeight: '900', color: LIME },

  routeBlock: { backgroundColor: '#0e0e0e', borderRadius: 14, padding: 14, marginBottom: 12 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  connector: { paddingLeft: 3.5, paddingVertical: 3 },
  connLine: { width: 1, height: 12, backgroundColor: '#2a2a2a' },
  addrTxt: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },

  orderMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 11, color: GREY, fontWeight: '600' },
  orderDate: { fontSize: 11, color: MUTED, fontWeight: '500' },
});
