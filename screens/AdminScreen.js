import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, TextInput, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const GREY = '#777';
const MUTED = '#444';

export default function AdminScreen({ navigation }) {
  const [section, setSection] = useState('verifications'); // 'verifications' | 'payouts'
  const [verifications, setVerifications] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('submitted');
  const [showRejectInput, setShowRejectInput] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const sub = useRef(null);

  // Helpers for disc expiry display
  const discStatus = (expiry) => {
    if (!expiry) return null;
    const exp = new Date(expiry);
    const now = new Date();
    const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: 'Expired', color: '#ef4444', bg: '#ef444420', days };
    if (days <= 30) return { label: `Expires in ${days}d`, color: '#f59e0b', bg: '#f59e0b20', days };
    return { label: `Valid · ${exp.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}`, color: '#22c55e', bg: '#22c55e20', days };
  };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: vData }, { data: pData }] = await Promise.all([
      supabase.from('rider_verifications').select('*').order('submitted_at', { ascending: false }),
      supabase.from('payout_requests').select('*').order('created_at', { ascending: false }),
    ]);
    setVerifications(vData || []);
    setPayouts(pData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    sub.current = supabase
      .channel('admin_data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_verifications' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests' }, fetchAll)
      .subscribe();
    return () => sub.current?.unsubscribe();
  }, []);

  const markPaid = async (id) => {
    await supabase.from('payout_requests').update({ status: 'paid' }).eq('id', id);
  };

  const rejectPayout = async (id) => {
    await supabase.from('payout_requests').update({ status: 'rejected' }).eq('id', id);
  };

  const approve = async (id) => {
    await supabase
      .from('rider_verifications')
      .update({ status: 'approved' })
      .eq('id', id);
  };

  const reject = async (id) => {
    if (!rejectReason.trim()) return;
    await supabase
      .from('rider_verifications')
      .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
      .eq('id', id);
    setShowRejectInput(null);
    setRejectReason('');
  };

  const tabCount = (t) => verifications.filter((v) => v.status === t).length;
  const filtered = verifications.filter((v) => v.status === tab);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Admin Panel</Text>
          <Text style={s.subtitle}>Rider Verifications</Text>
        </View>
        <TouchableOpacity
          onPress={async () => { await signOut(); navigation.replace('Landing'); }}
          style={s.logoutBtn}
        >
          <Ionicons name="log-out-outline" size={22} color={GREY} />
        </TouchableOpacity>
      </View>

      {/* Section toggle */}
      <View style={s.sectionToggle}>
        {['verifications', 'payouts'].map((sec) => (
          <TouchableOpacity
            key={sec}
            style={[s.sectionBtn, section === sec && s.sectionBtnActive]}
            onPress={() => setSection(sec)}
          >
            <Text style={[s.sectionBtnTxt, section === sec && s.sectionBtnTxtActive]}>
              {sec === 'verifications' ? 'Verifications' : `Payouts${payouts.filter(p => p.status === 'pending').length > 0 ? ` (${payouts.filter(p => p.status === 'pending').length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'payouts' && (
        loading ? (
          <View style={s.center}><ActivityIndicator color={LIME} /></View>
        ) : payouts.length === 0 ? (
          <View style={s.center}><Text style={s.emptyTxt}>No payout requests</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {payouts.map((p) => (
              <View key={p.id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.avatar}><Text style={{ fontSize: 20 }}>💸</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.riderName}>{p.rider_name || 'Unknown rider'}</Text>
                    <Text style={s.riderEmail}>{p.rider_email || '—'}</Text>
                    <Text style={s.dateText}>{new Date(p.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <View>
                    <Text style={{ color: LIME, fontSize: 20, fontWeight: '900' }}>R{p.amount}</Text>
                    {p.status === 'paid' && <View style={s.approvedBadge}><Text style={s.approvedBadgeTxt}>✓ Paid</Text></View>}
                    {p.status === 'rejected' && <View style={s.rejectedBadge}><Text style={s.rejectedBadgeTxt}>✗ Rejected</Text></View>}
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
                {p.branch_code ? <Text style={{ color: MUTED, fontSize: 12, paddingHorizontal: 4 }}>Branch: {p.branch_code}</Text> : null}
                {p.status === 'pending' && (
                  <View style={s.actions}>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => rejectPayout(p.id)}>
                      <Text style={s.rejectBtnTxt}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.approveBtn} onPress={() => markPaid(p.id)}>
                      <Text style={s.approveBtnTxt}>Mark as Paid</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )
      )}

      {section === 'verifications' && <View style={s.tabs}>
        {['submitted', 'approved', 'rejected'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {tabCount(t) > 0 ? ` (${tabCount(t)})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>}

      {section === 'verifications' && (loading ? (
        <View style={s.center}><ActivityIndicator color={LIME} /></View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyTxt}>No {tab} applications</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {filtered.map((v) => (
            <View key={v.id} style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.avatar}>
                  <Text style={{ fontSize: 20 }}>🏍️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.riderName}>{v.rider_name || 'Unnamed rider'}</Text>
                  <Text style={s.riderEmail}>{v.rider_email || '—'}</Text>
                  {v.submitted_at ? (
                    <Text style={s.dateText}>
                      {new Date(v.submitted_at).toLocaleDateString('en-ZA', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Text>
                  ) : null}
                </View>
                {v.status === 'approved' && (
                  <View style={s.approvedBadge}>
                    <Text style={s.approvedBadgeTxt}>✓ Approved</Text>
                  </View>
                )}
                {v.status === 'rejected' && (
                  <View style={s.rejectedBadge}>
                    <Text style={s.rejectedBadgeTxt}>✗ Rejected</Text>
                  </View>
                )}
              </View>

              <View style={s.docRow}>
                <TouchableOpacity
                  style={s.docBtn}
                  onPress={() => v.license_url && Linking.openURL(v.license_url)}
                >
                  <Ionicons name="card-outline" size={15} color={LIME} />
                  <Text style={s.docTxt}>License</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.docBtn}
                  onPress={() => v.bike_url && Linking.openURL(v.bike_url)}
                >
                  <Ionicons name="bicycle-outline" size={15} color={LIME} />
                  <Text style={s.docTxt}>Bike Photo</Text>
                </TouchableOpacity>
                {v.disc_url && (
                  <TouchableOpacity
                    style={s.docBtn}
                    onPress={() => Linking.openURL(v.disc_url)}
                  >
                    <Ionicons name="shield-checkmark-outline" size={15} color={LIME} />
                    <Text style={s.docTxt}>Disc</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Disc expiry badge */}
              {(() => {
                const ds = discStatus(v.disc_expiry);
                if (!ds) return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="warning-outline" size={13} color={MUTED} />
                    <Text style={{ color: MUTED, fontSize: 12 }}>No disc expiry submitted</Text>
                  </View>
                );
                return (
                  <View style={[s.discBadge, { backgroundColor: ds.bg }]}>
                    <Ionicons name={ds.days < 0 ? 'close-circle' : ds.days <= 30 ? 'warning' : 'shield-checkmark'} size={13} color={ds.color} />
                    <Text style={[s.discBadgeTxt, { color: ds.color }]}>Disc: {ds.label}</Text>
                  </View>
                );
              })()}

              {v.rejection_reason ? (
                <View style={s.reasonBox}>
                  <Text style={s.reasonLabel}>Rejection reason</Text>
                  <Text style={s.reasonTxt}>{v.rejection_reason}</Text>
                </View>
              ) : null}

              {v.status === 'submitted' && (
                showRejectInput === v.id ? (
                  <View style={s.rejectBox}>
                    <TextInput
                      style={s.rejectInput}
                      placeholder="Reason for rejection..."
                      placeholderTextColor={GREY}
                      value={rejectReason}
                      onChangeText={setRejectReason}
                      multiline
                    />
                    <View style={s.rejectActions}>
                      <TouchableOpacity
                        style={s.cancelBtn}
                        onPress={() => { setShowRejectInput(null); setRejectReason(''); }}
                      >
                        <Text style={s.cancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.confirmRejectBtn} onPress={() => reject(v.id)}>
                        <Text style={s.confirmRejectTxt}>Confirm Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={s.rejectBtn}
                      onPress={() => setShowRejectInput(v.id)}
                    >
                      <Text style={s.rejectBtnTxt}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.approveBtn} onPress={() => approve(v.id)}>
                      <Text style={s.approveBtnTxt}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          ))}
        </ScrollView>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: MUTED,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: GREY, marginTop: 2 },
  logoutBtn: { padding: 6 },
  sectionToggle: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: MUTED, backgroundColor: '#0d0d0d' },
  sectionBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  sectionBtnActive: { borderBottomWidth: 2, borderBottomColor: LIME },
  sectionBtnTxt: { color: GREY, fontSize: 14, fontWeight: '700' },
  sectionBtnTxtActive: { color: LIME },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: MUTED },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: LIME },
  tabTxt: { color: GREY, fontSize: 13, fontWeight: '600' },
  tabTxtActive: { color: LIME },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { color: GREY, fontSize: 15 },
  card: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e1e1e',
    alignItems: 'center', justifyContent: 'center',
  },
  riderName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  riderEmail: { fontSize: 12, color: GREY, marginTop: 2 },
  dateText: { fontSize: 11, color: MUTED, marginTop: 3 },
  approvedBadge: {
    backgroundColor: '#22c55e20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  approvedBadgeTxt: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  rejectedBadge: {
    backgroundColor: '#ef444420', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  rejectedBadgeTxt: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  docRow: { flexDirection: 'row', gap: 8 },
  docBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: MUTED,
  },
  docTxt: { color: LIME, fontSize: 13, fontWeight: '600' },
  reasonBox: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12 },
  reasonLabel: { fontSize: 11, color: GREY, marginBottom: 4 },
  reasonTxt: { fontSize: 13, color: '#ef4444' },
  actions: { flexDirection: 'row', gap: 8 },
  rejectBtn: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: MUTED,
    alignItems: 'center', justifyContent: 'center',
  },
  rejectBtnTxt: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  approveBtn: {
    flex: 2, height: 44, borderRadius: 10, backgroundColor: LIME,
    alignItems: 'center', justifyContent: 'center',
  },
  approveBtnTxt: { color: BG, fontWeight: '800', fontSize: 14 },
  rejectBox: { gap: 8 },
  rejectInput: {
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12,
    color: '#fff', fontSize: 14, minHeight: 70, borderWidth: 1, borderColor: MUTED,
  },
  rejectActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: MUTED,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelTxt: { color: GREY, fontSize: 13, fontWeight: '600' },
  confirmRejectBtn: {
    flex: 2, height: 40, borderRadius: 10, backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmRejectTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  discBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start',
  },
  discBadgeTxt: { fontSize: 12, fontWeight: '700' },
});
