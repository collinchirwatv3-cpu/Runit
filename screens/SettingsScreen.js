import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Switch, Modal, TextInput, Alert, Linking, ActivityIndicator,
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
const MUTED = '#444';
const GREY = '#777';

// ─── Change Password sheet ────────────────────────────────────────────────

function ChangePasswordSheet({ visible, onClose }) {
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(null);

  const handleSave = async () => {
    if (newPass.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters.');
      return;
    }
    if (newPass !== confirm) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Done', 'Password updated successfully.');
      setNewPass(''); setConfirm('');
      onClose();
    }
  };

  const inputStyle = (f) => [s.input, focused === f && s.inputFocused];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBg}>
        <View style={s.sheet}>
          <View style={s.sheetBar} />
          <Text style={s.sheetTitle}>Change <Text style={{ color: LIME }}>Password</Text></Text>
          <Text style={s.sheetSub}>Pick something strong, min 6 characters</Text>

          <Text style={s.inputLbl}>New Password</Text>
          <TextInput
            style={inputStyle('new')}
            placeholder="Min 6 characters"
            placeholderTextColor={MUTED}
            secureTextEntry
            value={newPass}
            onChangeText={setNewPass}
            onFocus={() => setFocused('new')}
            onBlur={() => setFocused(null)}
          />

          <Text style={s.inputLbl}>Confirm Password</Text>
          <TextInput
            style={inputStyle('confirm')}
            placeholder="Repeat new password"
            placeholderTextColor={MUTED}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            onFocus={() => setFocused('confirm')}
            onBlur={() => setFocused(null)}
          />

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={BG} />
              : <Text style={s.saveBtnTxt}>Update Password</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Info sheet (Policy / Terms) ─────────────────────────────────────────

function InfoSheet({ visible, onClose, title, body }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBg}>
        <View style={s.sheet}>
          <View style={s.sheetBar} />
          <Text style={s.sheetTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            <Text style={s.infoBody}>{body}</Text>
          </ScrollView>
          <TouchableOpacity style={[s.saveBtn, { marginTop: 24 }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.saveBtnTxt}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const PRIVACY_BODY = `RunIt collects the minimum data needed to operate the delivery service.

What we collect
• Name and email address for your account
• Phone number (optional) for delivery coordination
• Pickup and drop-off addresses for each order
• Device location is never stored — it is only used in-session to match you with nearby riders

How we use it
• To process and track your deliveries
• To contact you about your orders
• We do not sell your data to third parties

Data retention
• Order history is kept for 12 months
• You may request deletion of your account at any time by contacting support

Security
• All data is encrypted in transit (TLS) and at rest via Supabase

Questions? hello@runit.co.za`;

const TERMS_BODY = `By using RunIt you agree to the following:

Service
• RunIt connects customers with independent motorbike riders for same-day delivery within Cape Town
• Deliveries are point-to-point; the rider does not wait at the destination
• We are not liable for delays caused by traffic, weather, or incorrect addresses

Prohibited items
• Illegal substances or contraband
• Firearms or dangerous materials
• Live animals

Pricing
• Prices are calculated at the time of booking based on distance
• The quoted price is final unless the destination changes mid-delivery

Cancellations
• Orders may be cancelled before a rider accepts
• Once a rider is en route, a cancellation fee may apply

Liability
• RunIt is not responsible for damage to fragile or improperly packaged items
• Maximum liability per order is R500

Last updated: May 2026`;

// ─── Settings screen ──────────────────────────────────────────────────────

export default function SettingsScreen({ navigation }) {
  const [pushNotifs, setPushNotifs] = useState(true);
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [promoEmails, setPromoEmails] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const openSupport = () => {
    Linking.openURL('mailto:hello@runit.co.za?subject=Support%20Request').catch(() =>
      Alert.alert('Email not available', 'Contact us at hello@runit.co.za')
    );
  };

  const sections = [
    {
      title: 'Notifications',
      rows: [
        { label: 'Push Notifications', sub: 'Order alerts & updates',        icon: 'notifications-outline', toggle: pushNotifs,   onToggle: setPushNotifs },
        { label: 'Order Updates',      sub: 'Status changes for deliveries', icon: 'cube-outline',          toggle: orderUpdates, onToggle: setOrderUpdates },
        { label: 'Promotions',         sub: 'Deals and offers',               icon: 'pricetag-outline',      toggle: promoEmails,  onToggle: setPromoEmails },
      ],
    },
    {
      title: 'Account',
      rows: [
        { label: 'Change Password', sub: 'Update your credentials', icon: 'lock-closed-outline',   onPress: () => setShowChangePass(true) },
        { label: 'Privacy Policy',  sub: 'How we use your data',    icon: 'shield-outline',         onPress: () => setShowPrivacy(true) },
        { label: 'Terms of Service',sub: 'RunIt user agreement',    icon: 'document-text-outline',  onPress: () => setShowTerms(true) },
        { label: 'Contact Support', sub: 'hello@runit.co.za',       icon: 'headset-outline',        onPress: openSupport },
      ],
    },
    {
      title: 'App',
      rows: [
        { label: 'Version', sub: '1.0.0', icon: 'information-circle-outline', onPress: null },
      ],
    },
  ];

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <TopBar />
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Settings.</Text>

        {sections.map((section, si) => (
          <View key={si} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <View style={s.card}>
              {section.rows.map((row, ri) => (
                <View key={ri}>
                  {row.toggle !== undefined ? (
                    /* Toggle row — not a button */
                    <View style={s.row}>
                      <View style={s.iconWrap}>
                        <Ionicons name={row.icon} size={16} color={GREY} />
                      </View>
                      <View style={s.rowText}>
                        <Text style={s.rowLabel}>{row.label}</Text>
                        {row.sub && <Text style={s.rowSub}>{row.sub}</Text>}
                      </View>
                      <Switch
                        value={row.toggle}
                        onValueChange={row.onToggle}
                        trackColor={{ false: '#2a2a2a', true: LIME + 'aa' }}
                        thumbColor={row.toggle ? LIME : '#555'}
                      />
                    </View>
                  ) : row.onPress ? (
                    /* Tappable row — full row is the button */
                    <TouchableOpacity style={s.row} onPress={row.onPress} activeOpacity={0.6}>
                      <View style={s.iconWrap}>
                        <Ionicons name={row.icon} size={16} color={GREY} />
                      </View>
                      <View style={s.rowText}>
                        <Text style={s.rowLabel}>{row.label}</Text>
                        {row.sub && <Text style={s.rowSub}>{row.sub}</Text>}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={MUTED} />
                    </TouchableOpacity>
                  ) : (
                    /* Static row (Version) */
                    <View style={s.row}>
                      <View style={s.iconWrap}>
                        <Ionicons name={row.icon} size={16} color={GREY} />
                      </View>
                      <View style={s.rowText}>
                        <Text style={s.rowLabel}>{row.label}</Text>
                        {row.sub && <Text style={s.rowSub}>{row.sub}</Text>}
                      </View>
                    </View>
                  )}
                  {ri < section.rows.length - 1 && <View style={s.divider} />}
                </View>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="power-outline" size={18} color="#ef4444" />
          <Text style={s.signOutTxt}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>

      <ChangePasswordSheet visible={showChangePass} onClose={() => setShowChangePass(false)} />
      <InfoSheet visible={showPrivacy} onClose={() => setShowPrivacy(false)} title="Privacy Policy" body={PRIVACY_BODY} />
      <InfoSheet visible={showTerms}   onClose={() => setShowTerms(false)}   title="Terms of Service" body={TERMS_BODY} />
      <BottomBar active="settings" role="customer" onPress={(tabId) => {
        if (tabId === 'home') navigation.navigate('Customer');
        else if (tabId === 'orders') navigation.navigate('Orders');
        else if (tabId === 'profile') navigation.navigate('Profile');
      }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 90, paddingBottom: 100 },

  headline: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 32 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: GREY, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
  card: { backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  rowSub: { fontSize: 12, color: GREY, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#1a1a1a', marginLeft: 62 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: 16, height: 58,
  },
  signOutTxt: { fontSize: 16, fontWeight: '900', color: '#ef4444' },

  // Sheet
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141414', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingBottom: 48 },
  sheetBar: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  sheetTitle: { fontSize: 32, fontWeight: '900', color: '#fff', marginBottom: 6 },
  sheetSub: { fontSize: 14, color: GREY, marginBottom: 24 },

  inputLbl: { fontSize: 10, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: SURFACE, borderWidth: 1.5, borderColor: '#1e1e1e',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    color: '#fff', fontSize: 15, fontWeight: '600',
  },
  inputFocused: { borderColor: 'rgba(200,240,0,0.4)', backgroundColor: '#181818' },

  saveBtn: {
    backgroundColor: LIME, borderRadius: 16, height: 56,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
    shadowColor: LIME, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  saveBtnTxt: { fontSize: 16, fontWeight: '900', color: BG },
  cancelTxt: { color: GREY, fontSize: 14, textAlign: 'center', marginTop: 16 },

  infoBody: { fontSize: 14, color: '#aaa', lineHeight: 22, fontWeight: '500' },
});
