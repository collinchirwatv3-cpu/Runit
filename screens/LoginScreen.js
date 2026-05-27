import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { signIn } from '../auth';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const BORDER = '#1e1e1e';
const MUTED = '#444';
const GREY = '#777';

function roleToRoute(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'rider') return 'Rider';
  if (role === 'merchant') return 'Merchant';
  return 'Customer';
}

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Info', 'Please enter your email and password');
      return;
    }
    setLoading(true);
    try {
      const { user } = await signIn({ email, password });
      navigation.reset({ index: 0, routes: [{ name: roleToRoute(user?.user_metadata?.role) }] });
    } catch (err) {
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field) => [
    s.input,
    focusedField === field && s.inputFocused,
  ];

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <StatusBar style="light" />

      <TouchableOpacity onPress={() => navigation.navigate('Landing')} style={s.backBtn}>
        <Text style={s.backTxt}>← Back</Text>
      </TouchableOpacity>

      <View style={s.mid}>
        <View style={s.header}>
          <Text style={s.logo}>RUN<Text style={s.accent}>IT</Text></Text>
          <Text style={s.headline}>Welcome{'\n'}Back.</Text>
          <Text style={s.sub}>Sign in to continue</Text>
        </View>

        <View style={s.form}>
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
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
          />
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.label}>Password</Text>
          <TextInput
            style={inputStyle('password')}
            placeholder="Your password"
            placeholderTextColor={MUTED}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
          />
        </View>

        <TouchableOpacity
          style={[s.btn, loading && s.btnLoading]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={s.btnTxt}>{loading ? 'Signing in…' : 'Sign In'}</Text>
        </TouchableOpacity>
      </View>
      </View>

      <View style={s.footer}>
        <View style={s.trustRow}>
          {['🔒 Secure', '🏍️ Local riders', '⚡ Fast delivery'].map((item, i) => (
            <View key={i} style={s.trustChip}>
              <Text style={s.trustTxt}>{item}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={s.switchWrap}>
          <Text style={s.switchTxt}>No account? </Text>
          <Text style={s.switchLink}>Create one →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: BG },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 60, justifyContent: 'space-between' },
  backBtn: { marginBottom: 0 },
  backTxt: { fontSize: 14, color: GREY, fontWeight: '600' },
  mid: { flex: 1, justifyContent: 'center', paddingVertical: 20 },
  header: { marginBottom: 48 },
  logo: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 4, marginBottom: 32 },
  accent: { color: LIME },
  headline: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    lineHeight: 60,
    marginBottom: 12,
  },
  sub: { fontSize: 16, color: GREY, fontWeight: '500' },
  form: { gap: 20, marginBottom: 32 },
  fieldWrap: { gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
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
  inputFocused: {
    borderColor: 'rgba(200,240,0,0.4)',
    backgroundColor: '#141414',
  },
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
  footer: { gap: 20 },
  trustRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  trustChip: {
    backgroundColor: '#111',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  trustTxt: { fontSize: 11, color: '#555', fontWeight: '600' },
  switchWrap: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  switchTxt: { fontSize: 15, color: GREY, fontWeight: '500' },
  switchLink: { fontSize: 15, color: LIME, fontWeight: '800' },
});
