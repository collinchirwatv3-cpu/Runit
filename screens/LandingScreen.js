import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import CityMapBackground from './CityMapBackground';

const LIME = '#c8f000';
const BG = '#080808';

function PulseRing({ delay, size }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.55, duration: 2200, useNativeDriver: false }),
          Animated.timing(opacity, { toValue: 0, duration: 2200, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: false }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: false }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View style={[{
      position: 'absolute',
      width: size, height: size,
      borderRadius: size / 2,
      borderWidth: 1.5,
      borderColor: LIME,
      transform: [{ scale }],
      opacity,
    }]} />
  );
}

export default function LandingScreen({ navigation }) {
  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <CityMapBackground />

      <View style={s.top}>
        <Text style={s.logo}>RUN<Text style={s.logoAccent}>IT</Text></Text>
      </View>

      <View style={s.hero}>
        <Text style={s.headline}>Cape Town</Text>
        <Text style={s.headlineAccent}>Delivered.</Text>
      </View>

      <View style={s.btnArea}>
        <PulseRing delay={0} size={230} />
        <PulseRing delay={750} size={230} />
        <TouchableOpacity style={s.onBtn} activeOpacity={0.85} onPress={() => navigation.navigate('Signup')}>
          <Text style={s.onLabel}>ON</Text>
          <Text style={s.onSub}>Get Started</Text>
        </TouchableOpacity>
      </View>

      <View style={s.bottom}>
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.signInBtn}>
          <Text style={s.signInTxt}>Have an account?</Text>
          <Text style={s.signInLink}> Sign In →</Text>
        </TouchableOpacity>
        <Text style={s.tagline}>Fast · Fair · Cape Town</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 28,
    paddingTop: 56,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'flex-start',
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 5,
  },
  logoAccent: { color: LIME },
  hero: {
    alignItems: 'flex-start',
    marginTop: 8,
  },
  headline: {
    fontSize: 60,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    lineHeight: 64,
  },
  headlineAccent: {
    fontSize: 60,
    fontWeight: '900',
    color: LIME,
    letterSpacing: -1,
    lineHeight: 64,
  },
  btnArea: {
    alignSelf: 'center',
    width: 230,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onBtn: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: LIME,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: LIME,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 60,
    elevation: 30,
  },
  onLabel: {
    fontSize: 52,
    fontWeight: '900',
    color: BG,
    letterSpacing: 6,
  },
  onSub: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(0,0,0,0.45)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: -4,
  },
  bottom: {
    alignItems: 'center',
    gap: 16,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  signInTxt: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  signInLink: {
    fontSize: 14,
    color: LIME,
    fontWeight: '800',
  },
  tagline: {
    fontSize: 11,
    color: '#555',
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
