import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, TextInput, Linking, RefreshControl, Image,
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
  { key: 'faqs',           label: 'FAQs',      icon: 'help-circle-outline' },
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

  // Admin identity
  const [isSuperAdmin, setIsSuperAdmin]     = useState(false);
  const [currentUserId, setCurrentUserId]   = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [adminName, setAdminName]           = useState('');

  // Activity log (super admin only)
  const [activityLog, setActivityLog]       = useState([]);
  const [logsLoading, setLogsLoading]       = useState(false);
  const [logFilter, setLogFilter]           = useState('all'); // 'all' | admin email

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

  // Team UI state
  const [teamMembers, setTeamMembers]       = useState([]);
  const [inviteEmail, setInviteEmail]       = useState('');
  const [inviteName, setInviteName]         = useState('');
  const [inviting, setInviting]             = useState(false);
  const [inviteMsg, setInviteMsg]           = useState('');
  const [revoking, setRevoking]             = useState(null); // userId being revoked

  // FAQ management
  const [faqs, setFaqs]                     = useState([]);
  const [faqsLoading, setFaqsLoading]       = useState(false);
  const [faqTab, setFaqTab]                 = useState('customer');
  const [faqForm, setFaqForm]               = useState({ question: '', answer: '', display_order: 0 });
  const [editingFaqId, setEditingFaqId]     = useState(null); // null = new, string = edit existing
  const [showFaqForm, setShowFaqForm]       = useState(false);
  const [faqSaving, setFaqSaving]           = useState(false);
  const [faqSearch, setFaqSearch]           = useState('');

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

  const fetchTeam = async () => {
    const { data } = await supabase
      .from('admin_team')
      .select('*')
      .order('created_at', { ascending: true });
    setTeamMembers(data || []);
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    const { data } = await supabase
      .from('admin_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    setActivityLog(data || []);
    setLogsLoading(false);
  };

  const fetchFaqs = async () => {
    setFaqsLoading(true);
    const { data } = await supabase
      .from('faqs')
      .select('*')
      .order('display_order', { ascending: true });
    setFaqs(data || []);
    setFaqsLoading(false);
  };

  useEffect(() => {
    if (section === 'faqs') fetchFaqs();
  }, [section]);

  useEffect(() => {
    // Load current user + check super admin status + load name
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id;
      const email = data?.user?.email || '';
      const metaName = data?.user?.user_metadata?.name || '';
      setCurrentUserId(uid);
      setCurrentUserEmail(email);
      if (uid) {
        const { data: rec } = await supabase
          .from('admin_team')
          .select('is_super_admin, name')
          .eq('user_id', uid)
          .maybeSingle();
        // Use name from admin_team row, fall back to user_metadata, then email prefix
        setAdminName(rec?.name || metaName || email.split('@')[0]);
        if (rec?.is_super_admin) {
          setIsSuperAdmin(true);
          fetchTeam();
          fetchLogs();
        }
      }
    });

    fetchAll();
    sub.current = supabase.channel('admin_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_verifications' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => fetchAll(true))
      .subscribe();
    return () => sub.current?.unsubscribe();
  }, []);

  // ── Team actions ──────────────────────────────────────────────────────────
  const inviteAdmin = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invite failed');
      setInviteMsg(`✓ Invite sent to ${inviteEmail.trim()}`);
      logActivity('invite_admin', json.userId || '', `Invited ${inviteName.trim() || inviteEmail.trim()} as admin`, { email: inviteEmail.trim() });
      setInviteEmail(''); setInviteName('');
      fetchTeam();
    } catch (e) {
      setInviteMsg(`✗ ${e.message}`);
    } finally {
      setInviting(false);
    }
  };

  const revokeAdmin = async (userId, name) => {
    setRevoking(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Revoke failed');
      const target = teamMembers.find(m => m.user_id === userId);
      logActivity('revoke_admin', userId, `Revoked admin access for ${target?.name || target?.email || userId}`, { email: target?.email });
      fetchTeam();
    } catch (e) {
      alert(e.message);
    } finally {
      setRevoking(null);
    }
  };

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

  // ── Activity fingerprint ────────────────────────────────────────────────
  const logActivity = (action, targetId, description, metadata = {}) => {
    if (!currentUserId) return;
    supabase.from('admin_activity_log').insert({
      admin_id:           currentUserId,
      admin_email:        currentUserEmail,
      admin_name:         adminName,
      action,
      target_id:          String(targetId),
      target_description: description,
      metadata,
    }).then(() => { if (isSuperAdmin) fetchLogs(); });
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  const approveVerif = async (id) => {
    const v = verifications.find(r => r.id === id);
    await supabase.from('rider_verifications').update({ status: 'approved' }).eq('id', id);
    logActivity('approve_rider', id, `Approved ${v?.rider_name || 'rider'} (${v?.rider_email || ''})`, { rider_id: v?.rider_id });
  };
  const rejectVerif = async (id) => {
    if (!rejectReason.trim()) return;
    const v = verifications.find(r => r.id === id);
    await supabase.from('rider_verifications').update({ status: 'rejected', rejection_reason: rejectReason.trim() }).eq('id', id);
    logActivity('reject_rider', id, `Rejected ${v?.rider_name || 'rider'} — "${rejectReason.trim()}"`, { rider_id: v?.rider_id, reason: rejectReason.trim() });
    setShowRejectInput(null); setRejectReason('');
  };
  const suspendRider = async (id) => {
    const v = verifications.find(r => r.id === id);
    await supabase.from('rider_verifications').update({ status: 'suspended' }).eq('id', id);
    logActivity('suspend_rider', id, `Suspended ${v?.rider_name || 'rider'}`, { rider_id: v?.rider_id });
  };
  const reinstateRider = async (id) => {
    const v = verifications.find(r => r.id === id);
    await supabase.from('rider_verifications').update({ status: 'approved' }).eq('id', id);
    logActivity('reinstate_rider', id, `Reinstated ${v?.rider_name || 'rider'}`, { rider_id: v?.rider_id });
  };
  const markPayoutPaid = async (id) => {
    const p = payouts.find(r => r.id === id);
    await supabase.from('payout_requests').update({ status: 'paid' }).eq('id', id);
    logActivity('payout_paid', id, `Paid R${p?.amount} to ${p?.rider_name || 'rider'} via ${p?.bank_name || ''}`, { amount: p?.amount, rider: p?.rider_name });
    // Push notification to rider
    if (p?.rider_id) {
      const { data: { session } } = await supabase.auth.getSession();
      const accNum = p.account_number ? `****${String(p.account_number).slice(-4)}` : '';
      fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId: p.rider_id,
          title: '💸 Payout Processed',
          body: `R${p.amount} has been paid to ${p.bank_name || 'your account'}${accNum ? ` ${accNum}` : ''}.`,
          tag: 'runit-payout',
        }),
      }).catch(() => {});
    }
  };
  const rejectPayout = async (id) => {
    const p = payouts.find(r => r.id === id);
    await supabase.from('payout_requests').update({ status: 'rejected' }).eq('id', id);
    logActivity('payout_rejected', id, `Rejected payout R${p?.amount} for ${p?.rider_name || 'rider'}`, { amount: p?.amount });
    // Push notification to rider
    if (p?.rider_id) {
      const { data: { session } } = await supabase.auth.getSession();
      fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId: p.rider_id,
          title: 'Payout Rejected',
          body: `Your R${p.amount} payout request was rejected. Please contact support for details.`,
          tag: 'runit-payout',
        }),
      }).catch(() => {});
    }
  };
  const cancelOrder = async (id) => {
    const o = orders.find(r => r.id === id);
    await supabase.from('orders').update({
      status: 'cancelled',
      rider_id: null,
      rider_name: null,
    }).eq('id', id);
    logActivity('cancel_order', id, `Cancelled order — ${o?.from_address?.slice(0,25) || ''} → ${o?.to_address?.slice(0,25) || ''}`, { price: o?.price, had_rider: !!o?.rider_id });
  };

  const replyTicket = async (id) => {
    const reply = replyText[id]?.trim();
    if (!reply) return;
    const t = tickets.find(r => r.id === id);
    setReplying(id);
    await supabase.from('support_tickets').update({
      admin_reply: reply,
      status: 'resolved',
      replied_at: new Date().toISOString(),
    }).eq('id', id);
    logActivity('reply_ticket', id, `Replied to "${t?.subject || 'ticket'}" from ${t?.user_name || t?.user_email || 'user'}`, { role: t?.role });
    setReplyText(prev => ({ ...prev, [id]: '' }));
    setReplying(null);
  };

  const setTicketStatus = async (id, status) => {
    const t = tickets.find(r => r.id === id);
    await supabase.from('support_tickets').update({ status }).eq('id', id);
    logActivity('ticket_status', id, `Set "${t?.subject || 'ticket'}" → ${status}`, { status });
  };

  const saveFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return;
    setFaqSaving(true);
    if (editingFaqId) {
      await supabase.from('faqs').update({
        question:      faqForm.question.trim(),
        answer:        faqForm.answer.trim(),
        display_order: Number(faqForm.display_order) || 0,
      }).eq('id', editingFaqId);
      logActivity('faq_edit', editingFaqId, `Edited FAQ: "${faqForm.question.trim().slice(0, 40)}"`, { role: faqTab });
    } else {
      await supabase.from('faqs').insert({
        role:          faqTab,
        question:      faqForm.question.trim(),
        answer:        faqForm.answer.trim(),
        display_order: Number(faqForm.display_order) || 0,
        is_active:     true,
      });
      logActivity('faq_add', 'new', `Added FAQ for ${faqTab}s: "${faqForm.question.trim().slice(0, 40)}"`, { role: faqTab });
    }
    setFaqForm({ question: '', answer: '', display_order: 0 });
    setEditingFaqId(null);
    setShowFaqForm(false);
    setFaqSaving(false);
    fetchFaqs();
  };

  const deleteFaq = async (id, question) => {
    await supabase.from('faqs').delete().eq('id', id);
    logActivity('faq_delete', id, `Deleted FAQ: "${(question || '').slice(0, 40)}"`, { role: faqTab });
    fetchFaqs();
  };

  const toggleFaq = async (id, current) => {
    await supabase.from('faqs').update({ is_active: !current }).eq('id', id);
    logActivity('faq_toggle', id, `${current ? 'Deactivated' : 'Activated'} FAQ`, { role: faqTab });
    fetchFaqs();
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const badge = (n, color = RED) => n > 0
    ? <View style={[s.dot, { backgroundColor: color }]}><Text style={s.dotTxt}>{n > 9 ? '9+' : n}</Text></View>
    : null;

  if (loading) return <View style={[s.container,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator color={LIME} size="large" /></View>;

  return (
    <View style={s.container}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.title}>Admin Panel</Text>
            {isSuperAdmin && (
              <View style={[s.badge, { backgroundColor: LIME + '18', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <Ionicons name="shield-checkmark" size={11} color={LIME} />
                <Text style={[s.badgeTxt, { color: LIME, fontSize: 10 }]}>Super Admin</Text>
              </View>
            )}
          </View>
          <Text style={s.subtitle}>
            Signed in as <Text style={{ color: '#aaa', fontWeight: '700' }}>{adminName || currentUserEmail}</Text>
          </Text>
        </View>
        <TouchableOpacity onPress={async () => { await signOut(); navigation.replace('Landing'); }} style={s.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={GREY} />
        </TouchableOpacity>
      </View>

      {/* ── Nav tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.navBar} contentContainerStyle={s.navBarContent}>
        {[
          ...SECTIONS.filter(s => isSuperAdmin || s.key !== 'payouts'),
          ...(isSuperAdmin ? [
            { key: 'team', label: 'Team',  icon: 'people-outline'     },
            { key: 'logs', label: 'Logs',  icon: 'receipt-outline'    },
          ] : []),
        ].map(sec => {
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
                      <View style={s.avatarCircle}>
                        {v.selfie_url
                          ? <Image source={{ uri: v.selfie_url }} style={s.avatarPhoto} />
                          : <Ionicons name="person-outline" size={20} color="#555" />}
                      </View>
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
                      <View style={s.avatarCircle}>
                        {v.selfie_url
                          ? <Image source={{ uri: v.selfie_url }} style={s.avatarPhoto} />
                          : <Ionicons name="person-outline" size={20} color="#555" />}
                      </View>
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
                  <View style={s.avatarCircle}><Ionicons name="cash-outline" size={20} color={LIME} /></View>
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

                {/* Banking details — laid out for quick PayShap / EFT */}
                <View style={{ backgroundColor: '#0e0e0e', borderRadius: 12, padding: 12, marginTop: 8, gap: 6 }}>
                  {[
                    { label: 'Bank',           value: p.bank_name },
                    { label: 'Account Holder', value: p.account_holder },
                    { label: 'Account No.',    value: p.account_number },
                    { label: 'Account Type',   value: p.account_type },
                    { label: 'Branch Code',    value: p.branch_code },
                  ].filter(r => r.value).map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: GREY, fontSize: 12 }}>{r.label}</Text>
                      <Text style={{ color: '#ddd', fontSize: 12, fontWeight: '700' }}>{r.value}</Text>
                    </View>
                  ))}
                </View>

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
                  {r === 'all' ? 'All' : r === 'customer' ? 'Customers' : 'Riders'}
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
                      <Ionicons name={t.role === 'rider' ? 'bicycle' : 'person-outline'} size={18} color={t.role === 'rider' ? LIME : BLUE} />
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

      {/* ════════ LOGS ════════ */}
      {section === 'logs' && isSuperAdmin && (() => {
        const ACTION_META = {
          approve_rider:   { label: 'Approved Rider',       color: GREEN  },
          reject_rider:    { label: 'Rejected Rider',        color: RED    },
          suspend_rider:   { label: 'Suspended Rider',       color: ORANGE },
          reinstate_rider: { label: 'Reinstated Rider',      color: GREEN  },
          cancel_order:    { label: 'Cancelled Order',       color: RED    },
          payout_paid:     { label: 'Payout Paid',           color: LIME   },
          payout_rejected: { label: 'Payout Rejected',       color: RED    },
          reply_ticket:    { label: 'Replied to Ticket',     color: BLUE   },
          ticket_status:   { label: 'Ticket Status Update',  color: GREY   },
          invite_admin:    { label: 'Admin Invited',         color: LIME   },
          revoke_admin:    { label: 'Admin Revoked',         color: RED    },
          faq_add:         { label: 'FAQ Added',             color: LIME   },
          faq_edit:        { label: 'FAQ Edited',            color: BLUE   },
          faq_delete:      { label: 'FAQ Deleted',           color: RED    },
          faq_toggle:      { label: 'FAQ Toggled',           color: GREY   },
        };
        // Unique admins for filter chips
        const admins = [...new Set(activityLog.map(l => l.admin_email))].filter(Boolean);
        const filtered = logFilter === 'all' ? activityLog : activityLog.filter(l => l.admin_email === logFilter);

        return (
          <ScrollView style={s.scroll} contentContainerStyle={[s.page, { gap: 16 }]} showsVerticalScrollIndicator={false}>

            {/* Filter + refresh row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['all', ...admins].map(a => (
                    <TouchableOpacity
                      key={a}
                      style={[ls.filterChip, logFilter === a && ls.filterChipActive]}
                      onPress={() => setLogFilter(a)}
                    >
                      <Text style={[ls.filterChipTxt, logFilter === a && { color: BG }]}>
                        {a === 'all' ? 'All admins' : (teamMembers.find(m => m.email === a)?.name || a.split('@')[0])}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity onPress={fetchLogs} style={{ padding: 6 }}>
                <Ionicons name="refresh-outline" size={18} color={GREY} />
              </TouchableOpacity>
            </View>

            {/* Summary strip */}
            <View style={ls.summaryRow}>
              {[
                { label: 'Total actions', val: activityLog.length },
                { label: 'Today', val: activityLog.filter(l => l.created_at?.startsWith(today)).length },
                { label: 'Admins active', val: admins.length },
              ].map((item, i) => (
                <View key={i} style={ls.summaryCard}>
                  <Text style={ls.summaryVal}>{item.val}</Text>
                  <Text style={ls.summaryLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {logsLoading && <ActivityIndicator color={LIME} style={{ marginTop: 20 }} />}

            {!logsLoading && filtered.length === 0 && (
              <View style={[s.center, { paddingTop: 30 }]}>
                <Ionicons name="receipt-outline" size={36} color={MUTED} />
                <Text style={[s.emptyTxt, { marginTop: 10 }]}>No activity yet</Text>
                <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 6 }}>
                  Every admin action is recorded here automatically
                </Text>
              </View>
            )}

            {/* Timeline */}
            {filtered.map((log, i) => {
              const meta = ACTION_META[log.action] || { label: log.action, color: GREY };
              const isFirst = i === 0;
              const isLast = i === filtered.length - 1;
              return (
                <View key={log.id} style={ls.logRow}>
                  {/* Timeline spine */}
                  <View style={ls.spineCol}>
                    <View style={[ls.dot, { backgroundColor: meta.color }]} />
                    {!isLast && <View style={ls.spine} />}
                  </View>
                  {/* Content */}
                  <View style={[ls.logCard, isFirst && { borderColor: meta.color + '40' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <View style={[ls.actionBadge, { backgroundColor: meta.color + '20' }]}>
                        <Text style={[ls.actionBadgeTxt, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <Text style={ls.timestamp}>{fmt(log.created_at)}</Text>
                    </View>
                    <Text style={ls.description}>{log.target_description}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <View style={ls.adminInitial}>
                        <Text style={ls.adminInitialTxt}>
                          {(log.admin_name || log.admin_email || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={ls.adminLabel}>
                        {log.admin_name || log.admin_email?.split('@')[0]}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

          </ScrollView>
        );
      })()}

      {/* ════════ FAQs ════════ */}
      {section === 'faqs' && (
        <>
          <View style={s.tabBar}>
            {['customer', 'rider'].map(r => {
              const count = faqs.filter(f => f.role === r).length;
              return (
                <TouchableOpacity
                  key={r}
                  style={[s.tab, faqTab === r && s.tabActive]}
                  onPress={() => { setFaqTab(r); setShowFaqForm(false); setEditingFaqId(null); }}
                >
                  <Text style={[s.tabTxt, faqTab === r && s.tabTxtActive]}>
                    {r === 'customer' ? 'Customers' : 'Riders'}{count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={[s.page, { gap: 12 }]} showsVerticalScrollIndicator={false}>

            {/* Admin search bar */}
            <View style={[afs.searchRow, faqSearch && afs.searchRowActive]}>
              <Ionicons name="search-outline" size={15} color={faqSearch ? LIME : GREY} />
              <TextInput
                style={afs.searchInput}
                placeholder="Search FAQs…"
                placeholderTextColor={GREY}
                value={faqSearch}
                onChangeText={v => { setFaqSearch(v); setShowFaqForm(false); setEditingFaqId(null); }}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {faqSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFaqSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={GREY} />
                </TouchableOpacity>
              )}
            </View>

            {faqsLoading && <ActivityIndicator color={LIME} />}

            {/* Empty state */}
            {!faqsLoading && faqs.filter(f => f.role === faqTab).length === 0 && !showFaqForm && !faqSearch && (
              <View style={[s.center, { paddingTop: 30 }]}>
                <Ionicons name="help-circle-outline" size={36} color={MUTED} />
                <Text style={[s.emptyTxt, { marginTop: 10 }]}>No FAQs yet for {faqTab}s</Text>
                <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 6 }}>
                  Add FAQs that users will see in their Settings screen
                </Text>
              </View>
            )}

            {/* Search no-results hint */}
            {faqSearch.length > 0 && (() => {
              const matches = faqs.filter(f => f.role === faqTab &&
                (f.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
                 f.answer.toLowerCase().includes(faqSearch.toLowerCase())));
              if (matches.length === 0) return (
                <View style={[s.center, { paddingTop: 16 }]}>
                  <Text style={s.emptyTxt}>No matches for "{faqSearch}"</Text>
                </View>
              );
              return <Text style={afs.resultCount}>{matches.length} match{matches.length !== 1 ? 'es' : ''}</Text>;
            })()}

            {/* Existing FAQ cards */}
            {faqs.filter(f => {
              if (f.role !== faqTab) return false;
              if (!faqSearch.trim()) return true;
              const q = faqSearch.toLowerCase();
              return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
            }).map(faq => (
              <View
                key={faq.id}
                style={[s.card, { gap: 10, borderWidth: showFaqForm && editingFaqId === faq.id ? 1 : 0, borderColor: LIME + '40' }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { fontSize: 14 }]}>{faq.question}</Text>
                    <Text style={[s.cardSub, { marginTop: 4, lineHeight: 18 }]} numberOfLines={2}>{faq.answer}</Text>
                  </View>
                  {!(showFaqForm && editingFaqId === faq.id) && (
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      <TouchableOpacity onPress={() => toggleFaq(faq.id, faq.is_active)} style={{ padding: 6 }}>
                        <Ionicons name={faq.is_active ? 'eye-outline' : 'eye-off-outline'} size={18} color={faq.is_active ? GREEN : MUTED} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingFaqId(faq.id);
                          setFaqForm({ question: faq.question, answer: faq.answer, display_order: faq.display_order });
                          setShowFaqForm(true);
                        }}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="pencil-outline" size={18} color={LIME} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteFaq(faq.id, faq.question)} style={{ padding: 6 }}>
                        <Ionicons name="trash-outline" size={18} color={RED} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={[s.badge, { backgroundColor: faq.is_active ? GREEN+'20' : MUTED+'20' }]}>
                    <Text style={[s.badgeTxt, { color: faq.is_active ? GREEN : MUTED }]}>
                      {faq.is_active ? 'Visible' : 'Hidden'}
                    </Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: '#1e1e1e' }]}>
                    <Text style={[s.badgeTxt, { color: GREY }]}>Order {faq.display_order}</Text>
                  </View>
                </View>

                {/* Inline edit form */}
                {showFaqForm && editingFaqId === faq.id && (
                  <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: '#1e1e1e', paddingTop: 12 }}>
                    <TextInput
                      style={ts.input}
                      placeholder="Question"
                      placeholderTextColor={GREY}
                      value={faqForm.question}
                      onChangeText={v => setFaqForm(p => ({ ...p, question: v }))}
                      multiline
                    />
                    <TextInput
                      style={[ts.input, { minHeight: 80, textAlignVertical: 'top' }]}
                      placeholder="Answer"
                      placeholderTextColor={GREY}
                      value={faqForm.answer}
                      onChangeText={v => setFaqForm(p => ({ ...p, answer: v }))}
                      multiline
                    />
                    <TextInput
                      style={ts.input}
                      placeholder="Display order (0 = first)"
                      placeholderTextColor={GREY}
                      value={String(faqForm.display_order)}
                      onChangeText={v => setFaqForm(p => ({ ...p, display_order: v }))}
                      keyboardType="numeric"
                    />
                    <View style={s.actionRow}>
                      <TouchableOpacity style={s.cancelBtn} onPress={() => { setEditingFaqId(null); setShowFaqForm(false); }}>
                        <Text style={s.cancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.approveBtn, faqSaving && { opacity: 0.6 }]} onPress={saveFaq} disabled={faqSaving}>
                        {faqSaving ? <ActivityIndicator color={BG} size="small" /> : <Text style={s.approveBtnTxt}>Save Changes</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}

            {/* Add new FAQ form — hidden while searching */}
            {showFaqForm && editingFaqId === null && !faqSearch && (
              <View style={[s.card, { gap: 12, borderWidth: 1, borderColor: LIME + '30' }]}>
                <Text style={[s.sectionHeading, { marginBottom: 0 }]}>
                  New {faqTab === 'customer' ? 'Customer' : 'Rider'} FAQ
                </Text>
                <TextInput
                  style={ts.input}
                  placeholder="Question"
                  placeholderTextColor={GREY}
                  value={faqForm.question}
                  onChangeText={v => setFaqForm(p => ({ ...p, question: v }))}
                  multiline
                />
                <TextInput
                  style={[ts.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder="Answer"
                  placeholderTextColor={GREY}
                  value={faqForm.answer}
                  onChangeText={v => setFaqForm(p => ({ ...p, answer: v }))}
                  multiline
                />
                <TextInput
                  style={ts.input}
                  placeholder="Display order (0 = first)"
                  placeholderTextColor={GREY}
                  value={String(faqForm.display_order)}
                  onChangeText={v => setFaqForm(p => ({ ...p, display_order: v }))}
                  keyboardType="numeric"
                />
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowFaqForm(false); setFaqForm({ question: '', answer: '', display_order: 0 }); }}>
                    <Text style={s.cancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.approveBtn, faqSaving && { opacity: 0.6 }]} onPress={saveFaq} disabled={faqSaving}>
                    {faqSaving ? <ActivityIndicator color={BG} size="small" /> : <Text style={s.approveBtnTxt}>Add FAQ</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Add FAQ button — hidden while searching */}
            {!showFaqForm && !faqSearch && (
              <TouchableOpacity
                style={[s.approveBtn, { flexDirection: 'row', gap: 8 }]}
                onPress={() => {
                  setEditingFaqId(null);
                  setFaqForm({ question: '', answer: '', display_order: faqs.filter(f => f.role === faqTab).length });
                  setShowFaqForm(true);
                }}
              >
                <Ionicons name="add" size={18} color={BG} />
                <Text style={s.approveBtnTxt}>Add FAQ</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </>
      )}

      {/* ════════ TEAM ════════ */}
      {section === 'team' && isSuperAdmin && (
        <ScrollView style={s.scroll} contentContainerStyle={[s.page, { gap: 20 }]} showsVerticalScrollIndicator={false}>

          {/* Super admin identity card */}
          <View style={[s.card, { borderWidth: 1, borderColor: LIME + '30', gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.avatarCircle, { backgroundColor: LIME + '20', width: 46, height: 46, borderRadius: 23 }]}>
                <Ionicons name="shield-checkmark" size={20} color={LIME} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { fontSize: 16 }]}>You — Super Admin</Text>
                <Text style={s.cardSub}>{currentUserEmail}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: LIME + '20' }]}>
                <Text style={[s.badgeTxt, { color: LIME }]}>Owner</Text>
              </View>
            </View>
            <Text style={{ color: MUTED, fontSize: 12, lineHeight: 17 }}>
              You have full access to all sections including payouts and team management. Other admins can manage orders, riders and feedback — but not payouts or the team.
            </Text>
          </View>

          {/* Current team members */}
          <Text style={s.sectionHeading}>Current Team ({teamMembers.filter(m => m.is_active && !m.is_super_admin).length})</Text>
          {teamMembers.filter(m => m.is_active && !m.is_super_admin).length === 0 && (
            <View style={[s.center, { paddingTop: 20 }]}>
              <Ionicons name="people-outline" size={36} color={MUTED} />
              <Text style={[s.emptyTxt, { marginTop: 10 }]}>No team members yet</Text>
              <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 6 }}>Invite someone below to give them admin access</Text>
            </View>
          )}
          {teamMembers.filter(m => m.is_active && !m.is_super_admin).map(member => (
            <View key={member.id} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={[s.avatarCircle, { width: 44, height: 44, borderRadius: 22 }]}>
                <Text style={{ color: LIME, fontWeight: '800', fontSize: 16 }}>
                  {(member.name || member.email || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { fontSize: 15 }]}>{member.name || '—'}</Text>
                <Text style={s.cardSub}>{member.email}</Text>
                {member.invited_by ? (
                  <Text style={[s.dateText, { marginTop: 3 }]}>Invited by {member.invited_by}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[s.rejectBtn, { flex: 0, paddingHorizontal: 14, borderColor: RED + '40' }]}
                onPress={() => revokeAdmin(member.user_id, member.name)}
                disabled={revoking === member.user_id}
              >
                {revoking === member.user_id
                  ? <ActivityIndicator size="small" color={RED} />
                  : <Text style={[s.rejectBtnTxt, { fontSize: 13 }]}>Revoke</Text>
                }
              </TouchableOpacity>
            </View>
          ))}

          {/* Invite new admin */}
          <Text style={[s.sectionHeading, { marginTop: 8 }]}>Invite Admin</Text>
          <View style={[s.card, { gap: 12 }]}>
            <TextInput
              style={ts.input}
              placeholder="Full name"
              placeholderTextColor={GREY}
              value={inviteName}
              onChangeText={setInviteName}
              autoCapitalize="words"
            />
            <TextInput
              style={ts.input}
              placeholder="Email address"
              placeholderTextColor={GREY}
              value={inviteEmail}
              onChangeText={v => { setInviteEmail(v); setInviteMsg(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={{ color: MUTED, fontSize: 12, lineHeight: 17 }}>
              They'll receive a setup link by email. Once they create a password, they land directly in the Admin panel.
            </Text>
            {inviteMsg ? (
              <Text style={{ color: inviteMsg.startsWith('✓') ? GREEN : RED, fontSize: 13, fontWeight: '600' }}>
                {inviteMsg}
              </Text>
            ) : null}
            <TouchableOpacity
              style={[s.approveBtn, (!inviteEmail.trim() || inviting) && { opacity: 0.5 }]}
              onPress={inviteAdmin}
              disabled={!inviteEmail.trim() || inviting}
            >
              {inviting
                ? <ActivityIndicator color={BG} size="small" />
                : <Text style={s.approveBtnTxt}>Send Invite</Text>
              }
            </TouchableOpacity>
          </View>

        </ScrollView>
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
  navBar:        { borderBottomWidth: 1, borderBottomColor: '#1a1a1a', backgroundColor: '#0d0d0d', flexGrow: 0 },
  navBarContent: { paddingHorizontal: 8, paddingVertical: 0, flexDirection: 'row', gap: 0 },
  navBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 14, position: 'relative', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  navBtnActive:  { borderBottomColor: LIME },
  navBtnTxt:     { fontSize: 13, fontWeight: '700', color: GREY },
  navBtnTxtActive:{ color: '#fff' },
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
  avatarCircle:{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarPhoto: { width: 42, height: 42, borderRadius: 21 },
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

// ─── Team section extra styles ──────────────────────────────────────────────
const ts = StyleSheet.create({
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: MUTED,
  },
});

// ─── Logs section styles ─────────────────────────────────────────────────────
const ls = StyleSheet.create({
  filterChip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: MUTED },
  filterChipActive: { backgroundColor: LIME, borderColor: LIME },
  filterChipTxt:    { fontSize: 12, fontWeight: '700', color: GREY },
  summaryRow:       { flexDirection: 'row', gap: 10 },
  summaryCard:      { flex: 1, backgroundColor: SURFACE, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  summaryVal:       { fontSize: 22, fontWeight: '900', color: '#fff' },
  summaryLabel:     { fontSize: 11, color: GREY, fontWeight: '600' },
  logRow:           { flexDirection: 'row', gap: 12 },
  spineCol:         { alignItems: 'center', width: 16 },
  dot:              { width: 12, height: 12, borderRadius: 6, marginTop: 14 },
  spine:            { flex: 1, width: 1.5, backgroundColor: '#1e1e1e', marginTop: 4 },
  logCard:          { flex: 1, backgroundColor: SURFACE, borderRadius: 14, padding: 14, gap: 6, marginBottom: 4, borderWidth: 1, borderColor: 'transparent' },
  actionBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  actionBadgeTxt:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  timestamp:        { fontSize: 11, color: MUTED, fontWeight: '500' },
  description:      { fontSize: 13, color: '#ddd', lineHeight: 19 },
  adminInitial:     { width: 18, height: 18, borderRadius: 9, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  adminInitialTxt:  { fontSize: 9, fontWeight: '900', color: LIME },
  adminLabel:       { fontSize: 12, color: GREY, fontWeight: '600' },
});

// ─── Admin FAQ search styles ──────────────────────────────────────────────────
const afs = StyleSheet.create({
  searchRow:       {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: MUTED,
  },
  searchRowActive: { borderColor: LIME + '55' },
  searchInput:     { flex: 1, paddingVertical: 12, color: '#fff', fontSize: 14 },
  resultCount:     { fontSize: 11, color: GREY, fontWeight: '700', letterSpacing: 0.5, marginLeft: 2 },
});
