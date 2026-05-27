import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, TextInput, Linking, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';

const LIME   = '#c8f000';
const BG     = '#080808';
const SURFACE= '#111';
const GREY   = '#777';
const MUTED  = '#444';
const GREEN  = '#22c55e';
const RED    = '#ef4444';
const ORANGE = '#f59e0b';
const BLUE   = '#3b82f6';

// ─── Nav sections ─────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'overview',       label: 'Overview',  icon: 'grid-outline' },
  { key: 'orders',         label: 'Orders',    icon: 'cube-outline' },
  { key: 'riders',         label: 'Riders',    icon: 'bicycle-outline' },
  { key: 'verifications',  label: 'Verify',    icon: 'shield-checkmark-outline' },
  { key: 'payouts',        label: 'Payouts',   icon: 'cash-outline' },
  { key: 'feedback',       label: 'Feedback',  icon: 'chatbox-ellipses-outline' },
];

// ─── Status helpers ────────────────────────────────────────────────────────
const ORDER_STATUS = {
  awaiting_payment: { label: 'Awaiting Payment', color: ORANGE, bg: ORANGE+'20' },
  pending:          { label: 'Pending',           color: BLUE,   bg: BLUE+'20'   },
  accepted:         { label: 'Accepted',          color: LIME,   bg: LIME+'20'   },
  on_the_way:       { label: 'On the Way',        color: GREEN,  bg: GREEN+'20'  },
  delivered:        { label: 'Delivered',         color: GREEN,  bg: GREEN+'20'  },
  cancelled:        { label: 'Cancelled',         color: RED,    bg: RED+'20'    },
};

function OrderBadge({ status }) {
  const cfg = ORDER_STATUS[status] || { label: status, color: GREY, bg: MUTED+'20' };
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function discStatus(expiry) {
  if (!expiry) return null;
  const exp = new Date(expiry);
  const days = Math.ceil((exp - new Date()) / 86400000);
  if (days < 0)  return { label: 'EXPIRED',              color: RED,    bg: RED+'20',    icon: 'close-circle',      days };
  if (days <= 30)return { label: `Exp in ${days}d`,      color: ORANGE, bg: ORANGE+'20', icon: 'warning',           days };
  return           { label: `Valid · ${exp.toLocaleDateString('en-ZA',{month:'short',year:'numeric'})}`, color: GREEN, bg: GREEN+'20', icon: 'shield-checkmark', days };
}

function fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-ZA', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' });
}
function short(str, n = 28) { return str && str.length > n ? str.slice(0, n) + '…' : (str || '—'); }

// ─── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color = LIME, sub }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────
export default function AdminScreen({ navigation }) {
  const [section, setSection]               = useState('overview');
  const [verifications, setVerifications]   = useState([]);
  const [payouts, setPayouts]               = useState([]);
  const [orders, setOrders]                 = useState([]);
  const [tickets, setTickets]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);

  // Feedback UI state
  const [feedbackTab, setFeedbackTab]       = useState('open');
  const [feedbackRole, setFeedbackRole]     = useState('all'); // 'all' | 'customer' | 'rider'
  const [replyText, setReplyText]           = useState({});    // { [id]: string }
  const [replying, setReplying]             = useState(null);

  // Verifications UI state
  const [verifTab, setVerifTab]             = useState('submitted');
  const [showRejectInput, setShowRejectInput] = useState(null);
  const [rejectReason, setRejectReason]     = useState('');

  // Orders UI state
  const [orderTab, setOrderTab]             = useState('active');

  // Riders UI state
  const [riderTab, setRiderTab]             = useState('approved');

  const sub = useRef(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchAll = async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [{ data: vData }, { data: pData }, { data: oData }, { data: tData }] = await Promise.all([
      supabase.from('rider_verifications').select('*').order('submitted_at', { ascending: false }),
      supabase.from('payout_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
    ]);
    setVerifications(vData || []);
    setPayouts(pData || []);
    setOrders(oData || []);
    setTickets(tData || []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAll();
    sub.current = supabase.channel('admin_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_verifications' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => fetchAll(true))
      .subscribe();
    return () => sub.current?.unsubscribe();
  }, []);

  // ── Overview stats ───────────────────────────────────────────────────────
  const today    = new Date().toISOString().split('T')[0];
  const todayOrders  = orders.filter(o => o.created_at?.startsWith(today));
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.price || 0), 0);
  const activeOrders = orders.filter(o => ['pending','accepted','on_the_way'].includes(o.status));
  const pendingVerif = verifications.filter(v => v.status === 'submitted');
  const pendingPay   = payouts.filter(p => p.status === 'pending');
  const approvedRiders = verifications.filter(v => v.status === 'approved');
  const expiredDiscs = verifications.filter(v => v.disc_expiry && new Date(v.disc_expiry) < new Date());

  // ── Orders helpers ───────────────────────────────────────────────────────
  const ORDER_TABS = [
    { key: 'active',    label: 'Active',    filter: o => ['pending','accepted','on_the_way'].includes(o.status) },
    { key: 'delivered', label: 'Delivered', filter: o => o.status === 'delivered' },
    { key: 'cancelled', label: 'Cancelled', filter: o => o.status === 'cancelled' },
    { key: 'all',       label: 'All',       filter: () => true },
  ];
  const currentOrderFilter = ORDER_TABS.find(t => t.key === orderTab);
  const filteredOrders = orders.filter(currentOrderFilter?.filter || (() => true)).slice(0, 100);

  // ── Riders helpers ───────────────────────────────────────────────────────
  const RIDER_TABS = [
    { key: 'approved',  label: 'Approved',  filter: v => v.status === 'approved' },
    { key: 'suspended', label: 'Suspended', filter: v => v.status === 'suspended' },
    { key: 'disc_alert',label: 'Disc Alert',filter: v => { const ds = discStatus(v.disc_expiry); return ds && ds.days <= 30; } },
  ];
  const currentRiderFilter = RIDER_TABS.find(t => t.key === riderTab);
  const filteredRiders = verifications.filter(currentRiderFilter?.filter || (() => true));

  const riderTripCount = (riderId) => orders.filter(o => o.rider_id === riderId && o.status === 'delivered').length;
  const riderTodayTrips = (riderId) => orders.filter(o => o.rider_id === riderId && o.status === 'delivered' && o.created_at?.startsWith(today)).length;

  // ── Actions ──────────────────────────────────────────────────────────────
  const approveVerif   = id => supabase.from('rider_verifications').update({ status: 'approved' }).eq('id', id);
  const rejectVerif    = async (id) => {
    if (!rejectReason.trim()) return;
    await supabase.from('rider_verifications').update({ status: 'rejected', rejection_reason: rejectReason.trim() }).eq('id', id);
    setShowRejectInput(null); setRejectReason('');
  };
  const suspendRider   = id => supabase.from('rider_verifications').update({ status: 'suspended' }).eq('id', id);
  const reinstateRider = id => supabase.from('rider_verifications').update({ status: 'approved' }).eq('id', id);
  const markPayoutPaid = id => supabase.from('payout_requests').update({ status: 'paid' }).eq('id', id);
  const rejectPayout   = id => supabase.from('payout_requests').update({ status: 'rejected' }).eq('id', id);
  const cancelOrder    = id => supabase.from('orders').update({ status: 'cancelled' }).eq('id', id);

  const replyTicket = async (id) => {
    const reply = replyText[id]?.trim();
    if (!reply) return;
    setReplying(id);
    await supabase.from('support_tickets').update({
      admin_reply: reply,
      status: 'resolved',
      replied_at: new Date().toISOString(),
    }).eq('id', id);
    setReplyText(prev => ({ ...prev, [id]: '' }));
    setReplying(null);
  };

  const setTicketStatus = (id, status) =>
    supabase.from('support_tickets').update({ status }).eq('id', id);

  // ── Render helpers ────────────────────────────────────────────────────────
  const badge = (n, color = RED) => n > 0
    ? <View style={[s.dot, { backgroundColor: color }]}><Text style={s.dotTxt}>{n > 9 ? '9+' : n}</Text></View>
    : null;

  if (loading) return <View style={[s.container,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator color={LIME} size="large" /></View>;

  return (
    <View style={s.container}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Admin Panel</Text>
          <Text style={s.subtitle}>RunIt Operations</Text>
        </View>
        <TouchableOpacity onPress={async () => { await signOut(); navigation.replace('Landing'); }} style={s.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={GREY} />
        </TouchableOpacity>
      </View>

      {/* ── Nav tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.navBar} contentContainerStyle={s.navBarContent}>
        {SECTIONS.map(sec => {
          const active = section === sec.key;
          const openTickets = tickets.filter(t => t.status === 'open').length;
          const alertCount =
            sec.key === 'verifications' ? pendingVerif.length :
            sec.key === 'payouts'       ? pendingPay.length :
            sec.key === 'orders'        ? activeOrders.length :
            sec.key === 'riders'        ? expiredDiscs.length :
            sec.key === 'feedback'      ? openTickets : 0;
          return (
            <TouchableOpacity key={sec.key} style={[s.navBtn, active && s.navBtnActive]} onPress={() => setSection(sec.key)}>
              <Ionicons name={sec.icon} size={18} color={active ? LIME : GREY} />
              <Text style={[s.navBtnTxt, active && s.navBtnTxtActive]}>{sec.label}</Text>
              {badge(alertCount)}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ════════ OVERVIEW ════════ */}
      {section === 'overview' && (
        <ScrollView
          contentContainerStyle={s.page}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={LIME} />}
        >
          <Text style={s.sectionHeading}>Today</Text>
          <View style={s.statGrid}>
            <StatCard icon="cube-outline"     label="Orders Today"  value={todayOrders.length}    color={LIME} />
            <StatCard icon="cash-outline"     label="Revenue Today" value={`R${Math.round(todayRevenue)}`} color={GREEN} />
            <StatCard icon="time-outline"     label="Active Now"    value={activeOrders.length}   color={BLUE} />
            <StatCard icon="bicycle-outline"  label="Active Riders" value={approvedRiders.length} color={ORANGE} />
          </View>

          <Text style={[s.sectionHeading, { marginTop: 24 }]}>Action Required</Text>
          <View style={s.alertGrid}>
            {[
              { label: 'Pending Verifications', value: pendingVerif.length,  color: ORANGE, icon: 'shield-outline',       onPress: () => { setSection('verifications'); setVerifTab('submitted'); } },
              { label: 'Pending Payouts',        value: pendingPay.length,   color: LIME,   icon: 'cash-outline',         onPress: () => setSection('payouts') },
              { label: 'Expired Discs',          value: expiredDiscs.length, color: RED,    icon: 'close-circle-outline', onPress: () => { setSection('riders'); setRiderTab('disc_alert'); } },
              { label: 'Active Orders',          value: activeOrders.length, color: BLUE,   icon: 'cube-outline',         onPress: () => { setSection('orders'); setOrderTab('active'); } },
            ].map((a, i) => (
              <TouchableOpacity key={i} style={[s.alertCard, { borderColor: a.color + '30' }]} onPress={a.onPress} activeOpacity={0.7}>
                <Ionicons name={a.icon} size={20} color={a.color} />
                <Text style={[s.alertVal, { color: a.color }]}>{a.value}</Text>
                <Text style={s.alertLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.sectionHeading, { marginTop: 24 }]}>Recent Orders</Text>
          {orders.slice(0, 8).map(o => (
            <View key={o.id} style={[s.card, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{short(o.from_address)} → {short(o.to_address)}</Text>
                  <Text style={s.cardSub}>{fmt(o.created_at)} · {o.rider_name || 'No rider yet'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={s.priceText}>R{o.price}</Text>
                  <OrderBadge status={o.status} />
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ════════ ORDERS ════════ */}
      {section === 'orders' && (
        <>
          <View style={s.tabBar}>
            {ORDER_TABS.map(t => {
              const count = orders.filter(t.filter).length;
              return (
                <TouchableOpacity key={t.key} style={[s.tab, orderTab === t.key && s.tabActive]} onPress={() => setOrderTab(t.key)}>
                  <Text style={[s.tabTxt, orderTab === t.key && s.tabTxtActive]}>
                    {t.label}{count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <ScrollView
            contentContainerStyle={s.page}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={LIME} />}
          >
            {filteredOrders.length === 0
              ? <View style={s.center}><Text style={s.emptyTxt}>No {orderTab} orders</Text></View>
              : filteredOrders.map(o => (
                <View key={o.id} style={[s.card, { marginBottom: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>#{String(o.id).slice(0, 8)}</Text>
                      <Text style={s.cardSub}>{fmt(o.created_at)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={s.priceText}>R{o.price}</Text>
                      <OrderBadge status={o.status} />
                    </View>
                  </View>

                  <View style={s.routeRow}>
                    <Ionicons name="location-outline" size={13} color={LIME} />
                    <Text style={s.routeTxt} numberOfLines={1}>{short(o.from_address, 40)}</Text>
                  </View>
                  <View style={s.routeRow}>
                    <Ionicons name="navigate-outline" size={13} color={RED} />
                    <Text style={s.routeTxt} numberOfLines={1}>{short(o.to_address, 40)}</Text>
                  </View>

                  <View style={s.orderMeta}>
                    <View style={s.metaChip}>
                      <Ionicons name="bicycle-outline" size={12} color={GREY} />
                      <Text style={s.metaTxt}>{o.rider_name || 'Unassigned'}</Text>
                    </View>
                    <View style={s.metaChip}>
                      <Ionicons name={o.payment_status === 'paid' ? 'checkmark-circle' : 'time-outline'} size={12} color={o.payment_status === 'paid' ? GREEN : ORANGE} />
                      <Text style={[s.metaTxt, { color: o.payment_status === 'paid' ? GREEN : ORANGE }]}>
                        {o.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                      </Text>
                    </View>
                    {o.rating && (
                      <View style={s.metaChip}>
                        <Ionicons name="star" size={12} color={ORANGE} />
                        <Text style={s.metaTxt}>{o.rating}</Text>
                      </View>
                    )}
                  </View>

                  {['pending','accepted','on_the_way'].includes(o.status) && (
                    <TouchableOpacity style={s.cancelOrderBtn} onPress={() => cancelOrder(o.id)}>
                      <Ionicons name="close-circle-outline" size={14} color={RED} />
                      <Text style={s.cancelOrderTxt}>Cancel Order</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            }
          </ScrollView>
        </>
      )}

      {/* ════════ RIDERS ════════ */}
      {section === 'riders' && (
        <>
          <View style={s.tabBar}>
            {RIDER_TABS.map(t => {
              const count = verifications.filter(t.filter).length;
              return (
                <TouchableOpacity key={t.key} style={[s.tab, riderTab === t.key && s.tabActive]} onPress={() => setRiderTab(t.key)}>
                  <Text style={[s.tabTxt, riderTab === t.key && s.tabTxtActive]}>
                    {t.label}{count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <ScrollView contentContainerStyle={s.page}>
            {filteredRiders.length === 0
              ? <View style={s.center}><Text style={s.emptyTxt}>No riders in this group</Text></View>
              : filteredRiders.map(v => {
                const ds = discStatus(v.disc_expiry);
                const totalTrips = riderTripCount(v.rider_id);
                const todayTrips = riderTodayTrips(v.rider_id);
                return (
                  <View key={v.id} style={[s.card, { marginBottom: 12 }]}>
                    <View style={s.cardHeader}>
                      <View style={s.avatarCircle}><Text style={{ fontSize: 20 }}>🏍️</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>{v.rider_name || 'Unnamed'}</Text>
                        <Text style={s.cardSub}>{v.rider_email || '—'}</Text>
                      </View>
                      {v.status === 'suspended' && (
                        <View style={[s.badge, { backgroundColor: RED+'20' }]}>
                          <Text style={[s.badgeTxt, { color: RED }]}>Suspended</Text>
                        </View>
                      )}
                    </View>

                    {/* Stats row */}
                    <View style={s.riderStats}>
                      <View style={s.riderStat}>
                        <Text style={s.riderStatVal}>{totalTrips}</Text>
                        <Text style={s.riderStatLbl}>Total Trips</Text>
                      </View>
                      <View style={s.riderStat}>
                        <Text style={s.riderStatVal}>{todayTrips}</Text>
                        <Text style={s.riderStatLbl}>Today</Text>
                      </View>
                      <View style={s.riderStat}>
                        <Text style={s.riderStatVal}>{fmtDate(v.submitted_at)}</Text>
                        <Text style={s.riderStatLbl}>Joined</Text>
                      </View>
                    </View>

                    {/* Disc status */}
                    {ds ? (
                      <View style={[s.discBadge, { backgroundColor: ds.bg }]}>
                        <Ionicons name={ds.icon} size={13} color={ds.color} />
                        <Text style={[s.discBadgeTxt, { color: ds.color }]}>Disc: {ds.label}</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="warning-outline" size={13} color={MUTED} />
                        <Text style={{ color: MUTED, fontSize: 12 }}>No disc expiry on file</Text>
                      </View>
                    )}

                    {/* Doc links */}
                    <View style={s.docRow}>
                      {v.license_url && (
                        <TouchableOpacity style={s.docBtn} onPress={() => Linking.openURL(v.license_url)}>
                          <Ionicons name="card-outline" size={14} color={LIME} />
                          <Text style={s.docTxt}>License</Text>
                        </TouchableOpacity>
                      )}
                      {v.bike_url && (
                        <TouchableOpacity style={s.docBtn} onPress={() => Linking.openURL(v.bike_url)}>
                          <Ionicons name="bicycle-outline" size={14} color={LIME} />
                          <Text style={s.docTxt}>Bike</Text>
                        </TouchableOpacity>
                      )}
                      {v.disc_url && (
                        <TouchableOpacity style={s.docBtn} onPress={() => Linking.openURL(v.disc_url)}>
                          <Ionicons name="shield-checkmark-outline" size={14} color={LIME} />
                          <Text style={s.docTxt}>Disc</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Suspend / Reinstate */}
                    {v.status === 'approved' ? (
                      <TouchableOpacity style={s.suspendBtn} onPress={() => suspendRider(v.id)}>
                        <Ionicons name="ban-outline" size={14} color={RED} />
                        <Text style={s.suspendTxt}>Suspend Rider</Text>
                      </TouchableOpacity>
                    ) : v.status === 'suspended' ? (
                      <TouchableOpacity style={s.reinstateBtn} onPress={() => reinstateRider(v.id)}>
                        <Ionicons name="checkmark-circle-outline" size={14} color={GREEN} />
                        <Text style={s.reinstateTxt}>Reinstate Rider</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            }
          </ScrollView>
        </>
      )}

      {/* ════════ VERIFICATIONS ════════ */}
      {section === 'verifications' && (
        <>
          <View style={s.tabBar}>
            {['submitted','approved','rejected'].map(t => (
              <TouchableOpacity key={t} style={[s.tab, verifTab === t && s.tabActive]} onPress={() => setVerifTab(t)}>
                <Text style={[s.tabTxt, verifTab === t && s.tabTxtActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  {verifications.filter(v => v.status === t).length > 0 ? ` (${verifications.filter(v => v.status === t).length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView contentContainerStyle={s.page}>
            {verifications.filter(v => v.status === verifTab).length === 0
              ? <View style={s.center}><Text style={s.emptyTxt}>No {verifTab} applications</Text></View>
              : verifications.filter(v => v.status === verifTab).map(v => {
                const ds = discStatus(v.disc_expiry);
                return (
                  <View key={v.id} style={[s.card, { marginBottom: 12 }]}>
                    <View style={s.cardHeader}>
                      <View style={s.avatarCircle}><Text style={{ fontSize: 20 }}>🏍️</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>{v.rider_name || 'Unnamed rider'}</Text>
                        <Text style={s.cardSub}>{v.rider_email || '—'}</Text>
                        <Text style={s.dateText}>{fmtDate(v.submitted_at)}</Text>
                      </View>
                      {v.status === 'approved' && <View style={[s.badge,{backgroundColor:GREEN+'20'}]}><Text style={[s.badgeTxt,{color:GREEN}]}>✓ Approved</Text></View>}
                      {v.status === 'rejected' && <View style={[s.badge,{backgroundColor:RED+'20'}]}><Text style={[s.badgeTxt,{color:RED}]}>✗ Rejected</Text></View>}
                    </View>

                    <View style={s.docRow}>
                      <TouchableOpacity style={s.docBtn} onPress={() => v.license_url && Linking.openURL(v.license_url)}>
                        <Ionicons name="card-outline" size={14} color={LIME} />
                        <Text style={s.docTxt}>License</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.docBtn} onPress={() => v.bike_url && Linking.openURL(v.bike_url)}>
                        <Ionicons name="bicycle-outline" size={14} color={LIME} />
                        <Text style={s.docTxt}>Bike</Text>
                      </TouchableOpacity>
                      {v.disc_url && (
                        <TouchableOpacity style={s.docBtn} onPress={() => Linking.openURL(v.disc_url)}>
                          <Ionicons name="shield-checkmark-outline" size={14} color={LIME} />
                          <Text style={s.docTxt}>Disc</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {ds ? (
                      <View style={[s.discBadge, { backgroundColor: ds.bg }]}>
                        <Ionicons name={ds.icon} size={13} color={ds.color} />
                        <Text style={[s.discBadgeTxt, { color: ds.color }]}>Disc: {ds.label}</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="warning-outline" size={13} color={MUTED} />
                        <Text style={{ color: MUTED, fontSize: 12 }}>No disc expiry submitted</Text>
                      </View>
                    )}

                    {v.rejection_reason ? (
                      <View style={s.reasonBox}>
                        <Text style={s.reasonLabel}>Rejection reason</Text>
                        <Text style={s.reasonTxt}>{v.rejection_reason}</Text>
                      </View>
                    ) : null}

                    {v.status === 'submitted' && (
                      showRejectInput === v.id ? (
                        <View style={{ gap: 8 }}>
                          <TextInput
                            style={s.rejectInput}
                            placeholder="Reason for rejection…"
                            placeholderTextColor={GREY}
                            value={rejectReason}
                            onChangeText={setRejectReason}
                            multiline
                          />
                          <View style={s.actionRow}>
                            <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowRejectInput(null); setRejectReason(''); }}>
                              <Text style={s.cancelTxt}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.confirmRejectBtn} onPress={() => rejectVerif(v.id)}>
                              <Text style={s.confirmRejectTxt}>Confirm Reject</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={s.actionRow}>
                          <TouchableOpacity style={s.rejectBtn} onPress={() => setShowRejectInput(v.id)}>
                            <Text style={s.rejectBtnTxt}>Reject</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.approveBtn} onPress={() => approveVerif(v.id)}>
                            <Text style={s.approveBtnTxt}>Approve</Text>
                          </TouchableOpacity>
                        </View>
                      )
                    )}
                  </View>
                );
              })
            }
          </ScrollView>
        </>
      )}

      {/* ════════ PAYOUTS ════════ */}
      {section === 'payouts' && (
        <ScrollView contentContainerStyle={s.page}>
          {payouts.length === 0
            ? <View style={s.center}><Text style={s.emptyTxt}>No payout requests</Text></View>
            : payouts.map(p => (
              <View key={p.id} style={[s.card, { marginBottom: 12 }]}>
                <View style={s.cardHeader}>
                  <View style={s.avatarCircle}><Text style={{ fontSize: 20 }}>💸</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{p.rider_name || 'Unknown rider'}</Text>
                    <Text style={s.cardSub}>{p.rider_email || '—'}</Text>
                    <Text style={s.dateText}>{fmtDate(p.created_at)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Text style={[s.priceText, { fontSize: 22 }]}>R{p.amount}</Text>
                    {p.status === 'paid'     && <View style={[s.badge,{backgroundColor:GREEN+'20'}]}><Text style={[s.badgeTxt,{color:GREEN}]}>✓ Paid</Text></View>}
                    {p.status === 'rejected' && <View style={[s.badge,{backgroundColor:RED+'20'}]}><Text style={[s.badgeTxt,{color:RED}]}>✗ Rejected</Text></View>}
                    {p.status === 'pending'  && <View style={[s.badge,{backgroundColor:ORANGE+'20'}]}><Text style={[s.badgeTxt,{color:ORANGE}]}>Pending</Text></View>}
                  </View>
                </View>

                <View style={s.docRow}>
                  <View style={[s.docBtn, { backgroundColor: 'transparent', borderStyle: 'dashed' }]}>
                    <Text style={{ color: GREY, fontSize: 12 }}>🏦 {p.bank_name}</Text>
                  </View>
                  <View style={[s.docBtn, { backgroundColor: 'transparent', borderStyle: 'dashed' }]}>
                    <Text style={{ color: GREY, fontSize: 12 }}>Acc: {p.account_number}</Text>
                  </View>
                </View>
                {p.branch_code ? <Text style={{ color: MUTED, fontSize: 12 }}>Branch: {p.branch_code}</Text> : null}

                {p.status === 'pending' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => rejectPayout(p.id)}>
                      <Text style={s.rejectBtnTxt}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.approveBtn} onPress={() => markPayoutPaid(p.id)}>
                      <Text style={s.approveBtnTxt}>Mark as Paid</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          }
        </ScrollView>
      )}

      {/* ════════ FEEDBACK & QUERIES ════════ */}
      {section === 'feedback' && (
        <>
          <View style={s.tabBar}>
            {[
              { key: 'open',        label: 'Open' },
              { key: 'in_progress', label: 'In Progress' },
              { key: 'resolved',    label: 'Resolved' },
              { key: 'all',         label: 'All' },
            ].map(t => {
              const count = tickets.filter(tk => t.key === 'all' || tk.status === t.key).length;
              return (
                <TouchableOpacity key={t.key} style={[s.tab, feedbackTab === t.key && s.tabActive]} onPress={() => setFeedbackTab(t.key)}>
                  <Text style={[s.tabTxt, feedbackTab === t.key && s.tabTxtActive]}>
                    {t.label}{count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: MUTED }}>
            {['all', 'customer', 'rider'].map(r => (
              <TouchableOpacity key={r} style={[fbs.roleChip, feedbackRole === r && fbs.roleChipActive]} onPress={() => setFeedbackRole(r)}>
                <Text style={[fbs.roleChipTxt, feedbackRole === r && fbs.roleChipTxtActive]}>
                  {r === 'all' ? 'All' : r === 'customer' ? '🛒 Customers' : '🏍️ Riders'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={s.page}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={LIME} />}
          >
            {(() => {
              const filtered = tickets.filter(t =>
                (feedbackTab === 'all' || t.status === feedbackTab) &&
                (feedbackRole === 'all' || t.role === feedbackRole)
              );
              if (filtered.length === 0) return <View style={s.center}><Text style={s.emptyTxt}>No tickets here</Text></View>;
              return filtered.map(t => (
                <View key={t.id} style={[s.card, { marginBottom: 12 }]}>
                  <View style={s.cardHeader}>
                    <View style={[s.avatarCircle, { backgroundColor: t.role === 'rider' ? LIME+'20' : BLUE+'20' }]}>
                      <Text style={{ fontSize: 18 }}>{t.role === 'rider' ? '🏍️' : '🛒'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{t.user_name || 'Unknown'}</Text>
                      <Text style={s.cardSub}>{t.user_email || '—'}</Text>
                      <Text style={s.dateText}>{fmt(t.created_at)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <View style={[s.badge, { backgroundColor: t.role === 'rider' ? LIME+'20' : BLUE+'20' }]}>
                        <Text style={[s.badgeTxt, { color: t.role === 'rider' ? LIME : BLUE }]}>{t.role === 'rider' ? 'Rider' : 'Customer'}</Text>
                      </View>
                      <View style={[s.badge, { backgroundColor: t.status==='resolved' ? GREEN+'20' : t.status==='in_progress' ? ORANGE+'20' : RED+'20' }]}>
                        <Text style={[s.badgeTxt, { color: t.status==='resolved' ? GREEN : t.status==='in_progress' ? ORANGE : RED }]}>
                          {t.status === 'in_progress' ? 'In Progress' : t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={fbs.typeRow}>
                    <View style={fbs.typeChip}><Text style={fbs.typeChipTxt}>{t.type || 'General'}</Text></View>
                    {t.subject && t.subject !== t.type && <Text style={fbs.subject} numberOfLines={1}>{t.subject}</Text>}
                  </View>

                  <View style={fbs.messageBox}>
                    <Text style={fbs.messageTxt}>{t.message}</Text>
                  </View>

                  {t.admin_reply ? (
                    <View style={fbs.replyBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Ionicons name="shield-checkmark" size={12} color={LIME} />
                        <Text style={fbs.replyLabel}>Admin reply · {fmtDate(t.replied_at)}</Text>
                      </View>
                      <Text style={fbs.replyTxt}>{t.admin_reply}</Text>
                    </View>
                  ) : null}

                  {t.status !== 'resolved' && (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        style={fbs.replyInput}
                        placeholder="Type a reply…"
                        placeholderTextColor={GREY}
                        multiline
                        value={replyText[t.id] || ''}
                        onChangeText={v => setReplyText(prev => ({ ...prev, [t.id]: v }))}
                      />
                      <View style={s.actionRow}>
                        {t.status === 'open' && (
                          <TouchableOpacity style={[s.rejectBtn, { borderColor: ORANGE+'50' }]} onPress={() => setTicketStatus(t.id, 'in_progress')}>
                            <Text style={[s.rejectBtnTxt, { color: ORANGE }]}>In Progress</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[s.approveBtn, replying === t.id && { opacity: 0.6 }]}
                          onPress={() => replyTicket(t.id)}
                          disabled={replying === t.id}
                        >
                          {replying === t.id
                            ? <ActivityIndicator color={BG} size="small" />
                            : <Text style={s.approveBtnTxt}>Reply & Resolve</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {t.status === 'resolved' && (
                    <TouchableOpacity style={[s.rejectBtn, { borderColor: MUTED }]} onPress={() => setTicketStatus(t.id, 'open')}>
                      <Text style={[s.rejectBtnTxt, { color: GREY }]}>Reopen</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ));
            })()}
          </ScrollView>
        </>
      )}

    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: BG },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: MUTED },
  title:      { fontSize: 22, fontWeight: '900', color: '#fff' },
  subtitle:   { fontSize: 12, color: GREY, marginTop: 2 },
  logoutBtn:  { padding: 8 },

  // Nav
  navBar:        { borderBottomWidth: 1, borderBottomColor: MUTED, backgroundColor: '#0d0d0d', flexGrow: 0 },
  navBarContent: { paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', gap: 4 },
  navBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, position: 'relative' },
  navBtnActive:  { backgroundColor: LIME+'15' },
  navBtnTxt:     { fontSize: 13, fontWeight: '700', color: GREY },
  navBtnTxtActive:{ color: LIME },
  dot:           { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotTxt:        { fontSize: 9, fontWeight: '900', color: '#fff' },

  // Tabs
  tabBar:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: MUTED },
  tab:        { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:  { borderBottomWidth: 2, borderBottomColor: LIME },
  tabTxt:     { color: GREY, fontSize: 12, fontWeight: '600' },
  tabTxtActive:{ color: LIME },

  page:       { padding: 16, paddingBottom: 40 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTxt:   { color: GREY, fontSize: 15 },

  // Overview
  sectionHeading: { fontSize: 11, fontWeight: '800', color: GREY, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },
  statGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:   { backgroundColor: SURFACE, borderRadius: 14, padding: 14, width: '47%', gap: 6 },
  statIcon:   { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statVal:    { fontSize: 26, fontWeight: '900' },
  statLabel:  { fontSize: 12, color: GREY, fontWeight: '600' },
  statSub:    { fontSize: 11, color: MUTED },
  alertGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  alertCard:  { backgroundColor: SURFACE, borderRadius: 14, padding: 14, width: '47%', gap: 4, borderWidth: 1, alignItems: 'flex-start' },
  alertVal:   { fontSize: 28, fontWeight: '900' },
  alertLabel: { fontSize: 12, color: GREY, fontWeight: '500' },

  // Cards
  card:       { backgroundColor: SURFACE, borderRadius: 16, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatarCircle:{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  cardSub:    { fontSize: 12, color: GREY, marginTop: 2 },
  dateText:   { fontSize: 11, color: MUTED, marginTop: 2 },
  priceText:  { fontSize: 16, fontWeight: '900', color: LIME },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeTxt:   { fontSize: 11, fontWeight: '700' },

  // Route
  routeRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeTxt:   { fontSize: 12, color: '#aaa', flex: 1 },
  orderMeta:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaTxt:    { fontSize: 11, color: GREY, fontWeight: '600' },

  // Riders
  riderStats:    { flexDirection: 'row', gap: 0 },
  riderStat:     { flex: 1, alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 10, marginHorizontal: 2 },
  riderStatVal:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  riderStatLbl:  { fontSize: 10, color: GREY, marginTop: 2 },

  // Disc
  discBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start' },
  discBadgeTxt: { fontSize: 12, fontWeight: '700' },

  // Docs
  docRow:  { flexDirection: 'row', gap: 8 },
  docBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#1a1a1a', borderRadius: 9, paddingVertical: 9, borderWidth: 1, borderColor: MUTED },
  docTxt:  { color: LIME, fontSize: 12, fontWeight: '600' },

  // Actions
  actionRow:       { flexDirection: 'row', gap: 8 },
  rejectBtn:       { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: MUTED, alignItems: 'center', justifyContent: 'center' },
  rejectBtnTxt:    { color: RED, fontWeight: '700', fontSize: 14 },
  approveBtn:      { flex: 2, height: 42, borderRadius: 10, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  approveBtnTxt:   { color: BG, fontWeight: '800', fontSize: 14 },
  cancelOrderBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10, borderWidth: 1, borderColor: RED+'40' },
  cancelOrderTxt:  { color: RED, fontSize: 13, fontWeight: '700' },
  suspendBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, borderWidth: 1, borderColor: RED+'40' },
  suspendTxt:      { color: RED, fontSize: 13, fontWeight: '700' },
  reinstateBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, borderWidth: 1, borderColor: GREEN+'40', backgroundColor: GREEN+'10' },
  reinstateTxt:    { color: GREEN, fontSize: 13, fontWeight: '700' },
  reasonBox:       { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12 },
  reasonLabel:     { fontSize: 11, color: GREY, marginBottom: 4 },
  reasonTxt:       { fontSize: 13, color: RED },
  rejectInput:     { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, minHeight: 70, borderWidth: 1, borderColor: MUTED },
  cancelBtn:       { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: MUTED, alignItems: 'center', justifyContent: 'center' },
  cancelTxt:       { color: GREY, fontSize: 13, fontWeight: '600' },
  confirmRejectBtn:{ flex: 2, height: 38, borderRadius: 10, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  confirmRejectTxt:{ color: '#fff', fontWeight: '700', fontSize: 13 },
});

const fbs = StyleSheet.create({
  roleChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: SURFACE, borderWidth: 1, borderColor: MUTED },
  roleChipActive: { backgroundColor: LIME+'18', borderColor: LIME },
  roleChipTxt:    { fontSize: 12, fontWeight: '700', color: GREY },
  roleChipTxtActive:{ color: LIME },
  typeRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeChip:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#1e1e1e' },
  typeChipTxt:    { fontSize: 11, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 1 },
  subject:        { fontSize: 13, fontWeight: '600', color: '#ccc', flex: 1 },
  messageBox:     { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12 },
  messageTxt:     { fontSize: 13, color: '#ddd', lineHeight: 20 },
  replyBox:       { backgroundColor: LIME+'0a', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: LIME+'25' },
  replyLabel:     { fontSize: 11, color: LIME, fontWeight: '700' },
  replyTxt:       { fontSize: 13, color: '#ccc', lineHeight: 19 },
  replyInput:     { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, minHeight: 70, borderWidth: 1, borderColor: MUTED, textAlignVertical: 'top' },
});
