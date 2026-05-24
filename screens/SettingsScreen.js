import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../auth';
import LogoMenu from './LogoMenu';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const MUTED = '#444';
const GREY = '#777';

export default function SettingsScreen({ navigation }) {
  const [pushNotifs, setPushNotifs] = useState(true);
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [promoEmails, setPromoEmails] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const sections = [
    {
      title: 'Notifications',
      rows: [
        { label: 'Push Notifications', sub: 'Order alerts & updates',       toggle: pushNotifs,    onToggle: setPushNotifs },
        { label: 'Order Updates',      sub: 'Status changes for deliveries', toggle: orderUpdates,  onToggle: setOrderUpdates },
        { label: 'Promotions',         sub: 'Deals and offers',              toggle: promoEmails,   onToggle: setPromoEmails },
      ],
    },
    {
      title: 'Account',
      rows: [
        { label: 'Change Password', sub: 'Update your credentials', icon: 'lock-closed-outline',   onPress: () => {} },
        { label: 'Privacy Policy',  sub: 'How we use your data',    icon: 'shield-outline',         onPress: () => {} },
        { label: 'Terms of Service',sub: 'RunIt user agreement',    icon: 'document-text-outline',  onPress: () => {} },
        { label: 'Contact Support', sub: 'Get help from the team',  icon: 'headset-outline',        onPress: () => {} },
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
      <LogoMenu
        onSignOut={handleSignOut}
        onOrders={() => navigation.navigate('Orders')}
        onProfile={() => navigation.navigate('Profile')}
        onSettings={() => {}}
      />

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backRow}>
          <Ionicons name="arrow-back" size={18} color={GREY} />
          <Text style={s.backTxt}>Back</Text>
        </TouchableOpacity>

        <Text style={s.headline}>Settings.</Text>

        {sections.map((section, si) => (
          <View key={si} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <View style={s.card}>
              {section.rows.map((row, ri) => (
                <View key={ri}>
                  <View style={s.row}>
                    <View style={s.iconWrap}>
                      <Ionicons
                        name={row.icon || (row.toggle !== undefined ? 'notifications-outline' : 'chevron-forward')}
                        size={16}
                        color={GREY}
                      />
                    </View>
                    <View style={s.rowText}>
                      <Text style={s.rowLabel}>{row.label}</Text>
                      {row.sub && <Text style={s.rowSub}>{row.sub}</Text>}
                    </View>
                    {row.toggle !== undefined ? (
                      <Switch
                        value={row.toggle}
                        onValueChange={row.onToggle}
                        trackColor={{ false: '#2a2a2a', true: LIME + 'aa' }}
                        thumbColor={row.toggle ? LIME : '#555'}
                      />
                    ) : row.onPress ? (
                      <TouchableOpacity onPress={row.onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="chevron-forward" size={16} color={MUTED} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
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
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 100, paddingBottom: 60 },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },

  headline: {
    fontSize: 52, fontWeight: '900', color: '#fff',
    letterSpacing: -1, marginBottom: 32,
  },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: GREY,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10,
  },
  card: { backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  rowSub: { fontSize: 12, color: GREY, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#1a1a1a', marginLeft: 62 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: 16, height: 58,
  },
  signOutTxt: { fontSize: 16, fontWeight: '900', color: '#ef4444' },
});
