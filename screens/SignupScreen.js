import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { signUp } from '../auth';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const BORDER = '#1e1e1e';
const MUTED = '#444';
const GREY = '#777';

function roleToRoute(role) {
  if (role === 'rider') return 'Rider';
  if (role === 'merchant') return 'Merchant';
  return 'Customer';
}

const ROLES = [
  { id: 'customer', icon: 'cube-outline',      label: 'Send a package',   desc: 'Book a motorbike pickup' },
  { id: 'rider',    icon: 'bicycle',            label: 'Ride & earn',      desc: 'Accept deliveries near you' },
  { id: 'merchant', icon: 'storefront-outline', label: 'Business account', desc: 'Manage store deliveries' },
];

export default function SignupScreen({ navigation }) {
  const [role, setRole] = useState('customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert('Missing Info', 'Name, email and password are required');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const { session, user } = await signUp({ email, password, name, phone, role });

      // Session exists → email confirmation is OFF, user is in immediately
      if (session) {
        navigation.reset({ index: 0, routes: [{ name: roleToRoute(role) }] });
        return;
      }

      // User created but no session → email confirmation is ON
      if (user) {
        Alert.alert(
          'Almost there!',
          'We sent a confirmation link to ' + email + '.\n\nClick it then come back and sign in.',
          [{ text: 'Go to Sign In', onPress: () => navigation.navigate('Login') }]
        );
        return;
      }

      // Neither — something unexpected
      Alert.alert('Something went wrong', 'Please try again or contact support.');
    } catch (err) {
      // Map common Supabase error messages to friendly text
      const msg = err.message || '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        Alert.alert('Account exists', 'An account with this email already exists. Try signing in instead.', [
          { text: 'Sign In', onPress: () => navigation.navigate('Login') },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else if (msg.includes('invalid') && msg.includes('email')) {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
      } else if (msg.includes('rate limit') || msg.includes('too many')) {
        Alert.alert('Too many attempts', 'Please wait a few minutes before trying again.');
      } else {
        Alert.alert('Sign up failed', msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field) => [s.input, focused === field && s.inputFocused];

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <StatusBar style="light" />

      <TouchableOpacity onPress={() => navigation.navigate('Landing')} style={s.backBtn}>
        <Text style={s.backTxt}>← Back</Text>
      </TouchableOpacity>

      <View style={s.header}>
        <Text style={s.logo}>RUN<Text style={s.accent}>IT</Text></Text>
        <Text style={s.headline}>Create{'\n'}Account.</Text>
        <Text style={s.sub}>Who are you?</Text>
      </View>

      <View style={s.roles}>
        {ROLES.map(r => (
          <TouchableOpacity
            key={r.id}
            style={[s.roleCard, role === r.id && s.roleCardOn]}
            onPress={() => setRole(r.id)}
            activeOpacity={0.7}
          >
            <View style={[s.roleIconWrap, role === r.id && s.roleIconWrapOn]}>
              <Ionicons name={r.icon} size={20} color={role === r.id ? '#080808' : LIME} />
            </View>
            <View style={s.roleText}>
              <Text style={[s.roleLabel, role === r.id && s.roleLabelOn]}>{r.label}</Text>
              <Text style={s.roleDesc}>{r.desc}</Text>
            </View>
            <View style={[s.check, role === r.id && s.checkOn]}>
              {role === r.id && <Ionicons name="checkmark" size={12} color="#080808" />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.form}>
        <View style={s.fieldWrap}>
          <Text style={s.label}>Full Name</Text>
          <TextInput
            style={inputStyle('name')}
            placeholder="Your name"
            placeholderTextColor={MUTED}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={inputStyle('email')}
            placeholder="you@email.com"
            placeholderTextColor={MUTED}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.label}>Phone <Text style={s.optional}>(optional)</Text></Text>
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
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.label}>Password</Text>
          <TextInput
            style={inputStyle('password')}
            placeholder="Min 6 characters"
            placeholderTextColor={MUTED}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
          />
        </View>

        <TouchableOpacity
          style={[s.btn, loading && s.btnLoading]}
          onPress={handleSignup}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={s.btnTxt}>{loading ? 'Creating…' : 'Create Account'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.switchWrap}>
        <Text style={s.switchTxt}>Have an account? </Text>
        <Text style={s.switchLink}>Sign In →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 28, paddingTop: 60, paddingBottom: 60 },
  backBtn: { marginBottom: 36 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },
  header: { marginBottom: 32 },
  logo: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 4, marginBottom: 28 },
  accent: { color: LIME },
  headline: {
    fontSize: 52,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    lineHeight: 56,
    marginBottom: 10,
  },
  sub: { fontSize: 16, color: GREY, fontWeight: '500' },
  roles: { gap: 8, marginBottom: 32 },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#1a1a1a',
    gap: 14,
  },
  roleCardOn: {
    borderColor: LIME,
    backgroundColor: 'rgba(200,240,0,0.10)',
  },
  roleIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
  },
  roleIconWrapOn: { backgroundColor: LIME },
  roleText: { flex: 1 },
  roleLabel: { fontSize: 15, fontWeight: '800', color: '#aaa', marginBottom: 2 },
  roleLabelOn: { color: '#fff' },
  roleDesc: { fontSize: 12, color: '#555', fontWeight: '500' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: LIME, borderColor: LIME },
  checkMark: { fontSize: 12, fontWeight: '900', color: BG },
  form: { gap: 18, marginBottom: 32 },
  fieldWrap: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 2 },
  optional: { fontWeight: '500', textTransform: 'none', letterSpacing: 0, color: '#444' },
  input: {
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inputFocused: { borderColor: 'rgba(200,240,0,0.4)', backgroundColor: '#141414' },
  btn: {
    backgroundColor: LIME,
    borderRadius: 16,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: LIME,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  btnLoading: { opacity: 0.6 },
  btnTxt: { fontSize: 17, fontWeight: '900', color: BG, letterSpacing: 0.3 },
  switchWrap: { flexDirection: 'row', justifyContent: 'center' },
  switchTxt: { fontSize: 15, color: GREY, fontWeight: '500' },
  switchLink: { fontSize: 15, color: LIME, fontWeight: '800' },
});
