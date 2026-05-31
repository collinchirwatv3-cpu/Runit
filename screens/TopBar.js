import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';

const LIME = '#c8f000';
const BG = '#080808';

// ─── Smart greeting ───────────────────────────────────────────────────────
// Call this once after supabase.auth.getUser() resolves.
// Pass the full user object — reads created_at and user_metadata.name.
export function getSmartGreeting(user) {
  if (!user) return null;
  const firstName = (user.user_metadata?.name || '').split(' ')[0].trim() || 'there';

  // New user — account created today
  const createdAt = user.created_at ? new Date(user.created_at) : null;
  const isNewUser = createdAt && createdAt.toDateString() === new Date().toDateString();

  if (isNewUser) {
    _updateLastSeen();
    return `Welcome, ${firstName}!`;
  }

  // Long absence — 7+ days since last open
  let longAbsence = false;
  if (Platform.OS === 'web') {
    try {
      const raw = localStorage.getItem('runit_last_seen');
      if (raw) {
        const daysSince = (Date.now() - parseInt(raw, 10)) / (1000 * 60 * 60 * 24);
        if (daysSince >= 7) longAbsence = true;
      }
    } catch (_) {}
  }
  _updateLastSeen();

  if (longAbsence) return `Good to have you back, ${firstName}!`;
  return `Welcome back, ${firstName}!`;
}

function _updateLastSeen() {
  if (Platform.OS === 'web') {
    try { localStorage.setItem('runit_last_seen', Date.now().toString()); } catch (_) {}
  }
}

// ─── TopBar component ─────────────────────────────────────────────────────
// greetingText — if provided, overrides the time-of-day fallback greeting
export default function TopBar({ userName, greetingText, onLogoPress }) {
  function timeGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  const displayGreeting = greetingText
    || (userName ? `${timeGreeting()}, ${userName.split(' ')[0]}` : null);

  return (
    <View style={s.bar}>
      <View style={s.row}>
        <TouchableOpacity onPress={onLogoPress} activeOpacity={onLogoPress ? 0.6 : 1} disabled={!onLogoPress}>
          <Text style={s.logo}>RUN<Text style={{ color: LIME }}>IT</Text></Text>
        </TouchableOpacity>
        {displayGreeting ? (
          <Text style={s.greet} numberOfLines={1}>{displayGreeting}</Text>
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
    color: '#888',
    fontWeight: '600',
    maxWidth: 220,
  },
});
