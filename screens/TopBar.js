import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const LIME = '#c8f000';
const BG = '#080808';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TopBar({ userName }) {
  return (
    <View style={s.bar}>
      <View style={s.row}>
        <Text style={s.logo}>RUN<Text style={{ color: LIME }}>IT</Text></Text>
        {userName ? (
          <Text style={s.greet}>{greeting()}, <Text style={s.greetName}>{userName.split(' ')[0]}</Text></Text>
        ) : null}
      </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
  },
  greet: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  greetName: {
    color: '#aaa',
    fontWeight: '700',
  },
});
