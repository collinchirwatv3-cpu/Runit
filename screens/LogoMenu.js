import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#141414';
const BORDER = '#222';
const MUTED = '#555';

export default function LogoMenu({ onSignOut, onProfile, onOrders, onSettings }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    Animated.spring(anim, {
      toValue: open ? 0 : 1,
      useNativeDriver: false,
      tension: 120,
      friction: 14,
    }).start();
    setOpen(!open);
  };

  const menuHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });
  const menuOpacity = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });

  const items = [
    { icon: 'cube-outline',     label: 'My Orders',  onPress: onOrders,   red: false },
    { icon: 'person-outline',   label: 'Profile',    onPress: onProfile,  red: false },
    { icon: 'settings-outline', label: 'Settings',   onPress: onSettings, red: false },
    { icon: 'power-outline',    label: 'Sign Out',   onPress: onSignOut,  red: true  },
  ];

  return (
    <View style={s.wrap}>
      <TouchableOpacity onPress={toggle} style={s.trigger} activeOpacity={0.7}>
        <Text style={s.logo}>RUN<Text style={s.accent}>IT</Text></Text>
        <View style={[s.chevronWrap, open && s.chevronWrapOpen]}>
          <Ionicons name="chevron-down" size={11} color={open ? LIME : MUTED} />
        </View>
      </TouchableOpacity>

      <Animated.View style={[s.menu, { height: menuHeight, opacity: menuOpacity }]}>
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={[s.item, i === items.length - 1 && s.itemLast]}
            activeOpacity={0.6}
            onPress={() => { setOpen(false); anim.setValue(0); item.onPress?.(); }}
          >
            <View style={[s.iconWrap, item.red && s.iconWrapRed]}>
              <Ionicons name={item.icon} size={15} color={item.red ? '#ef4444' : '#777'} />
            </View>
            <Text style={[s.label, item.red && s.labelRed]}>{item.label}</Text>
            {!item.red && <Ionicons name="chevron-forward" size={11} color="#333" />}
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 48,
    left: 24,
    zIndex: 100,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
  },
  accent: { color: LIME },
  chevronWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronWrapOpen: { backgroundColor: 'rgba(200,240,0,0.12)' },
  menu: {
    marginTop: 12,
    backgroundColor: SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    width: 210,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 30,
    borderWidth: 1,
    borderColor: BORDER,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  itemLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapRed: { backgroundColor: 'rgba(239,68,68,0.1)' },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#bbb',
    letterSpacing: 0.1,
  },
  labelRed: { color: '#ef4444' },
});
