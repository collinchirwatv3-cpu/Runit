import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const LIME = '#c8f000';
const BG = '#080808';

export default function TopBar() {
  return (
    <View style={s.bar}>
      <Text style={s.logo}>RUN<Text style={{ color: LIME }}>IT</Text></Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingTop: 52,
    paddingBottom: 14,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(8,8,8,0.95)',
  },
  logo: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
  },
});
