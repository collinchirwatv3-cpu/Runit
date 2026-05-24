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

const ROLE_LABEL = { customer: 'Customer', rider: 'Rider', merchant: 'Merchant' };

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const name = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';
  const phone = user?.user_metadata?.phone || '';
  const role = user?.user_metadata?.role || 'customer';
  const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    : 'Recently';

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={LIME} size="large" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <LogoMenu
        onSignOut={handleSignOut}
        onOrders={() => navigation.navigate('Orders')}
        onProfile={() => {}}
        onSettings={() => navigation.navigate('Settings')}
      />

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backRow}>
          <Ionicons name="arrow-back" size={18} color={GREY} />
          <Text style={s.backTxt}>Back</Text>
        </TouchableOpacity>

        <Text style={s.headline}>My{'\n'}<Text style={s.headlineAccent}>Profile.</Text></Text>

        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initials}</Text>
          </View>
          <Text style={s.name}>{name}</Text>
          <View style={s.rolePill}>
            <Text style={s.roleTxt}>{ROLE_LABEL[role] || role}</Text>
          </View>
        </View>

        <View style={s.infoCard}>
          {[
            { icon: 'mail-outline',     label: 'Email',        value: email || '—' },
            { icon: 'call-outline',     label: 'Phone',        value: phone || '—' },
            { icon: 'calendar-outline', label: 'Member Since', value: memberSince },
            { icon: 'location-outline', label: 'City',         value: 'Cape Town' },
          ].map((row, i, arr) => (
            <View key={i}>
              <View style={s.infoRow}>
                <View style={s.infoIconWrap}>
                  <Ionicons name={row.icon} size={16} color={GREY} />
                </View>
                <Text style={s.infoLbl}>{row.label}</Text>
                <Text style={s.infoVal} numberOfLines={1}>{row.value}</Text>
              </View>
              {i < arr.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>

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
    fontSize: 56, fontWeight: '900', color: '#fff',
    letterSpacing: -1, lineHeight: 60, marginBottom: 36,
  },
  headlineAccent: { color: LIME },

  avatarWrap: { alignItems: 'center', marginBottom: 32 },
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 32, elevation: 16,
  },
  avatarTxt: { fontSize: 38, fontWeight: '900', color: BG },
  name: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 10 },
  rolePill: {
    backgroundColor: LIME + '15', borderWidth: 1, borderColor: LIME + '35',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 5,
  },
  roleTxt: { fontSize: 12, fontWeight: '800', color: LIME, letterSpacing: 2, textTransform: 'uppercase' },

  infoCard: { backgroundColor: SURFACE, borderRadius: 20, marginBottom: 24, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
  infoIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
  },
  infoLbl: { fontSize: 14, color: GREY, fontWeight: '600', flex: 1 },
  infoVal: { fontSize: 14, fontWeight: '800', color: '#fff', maxWidth: '55%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#1a1a1a', marginLeft: 60 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: 16, height: 58,
  },
  signOutTxt: { fontSize: 16, fontWeight: '900', color: '#ef4444' },
});
