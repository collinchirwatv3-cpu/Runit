import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const LIME = '#c8f000';
const BG = '#080808';
const GREY = '#555';

const TABS = {
  customer: [
    { id: 'home',     icon: 'home',      outlineIcon: 'home-outline',      label: 'Home'     },
    { id: 'orders',   icon: 'cube',       outlineIcon: 'cube-outline',       label: 'Orders'   },
    { id: 'profile',  icon: 'person',     outlineIcon: 'person-outline',     label: 'Profile'  },
    { id: 'settings', icon: 'settings',   outlineIcon: 'settings-outline',   label: 'Settings' },
  ],
  rider: [
    { id: 'home',     icon: 'bicycle',    outlineIcon: 'bicycle-outline',    label: 'Ride'     },
    { id: 'jobs',     icon: 'list',       outlineIcon: 'list-outline',       label: 'Jobs'     },
    { id: 'earnings', icon: 'wallet',     outlineIcon: 'wallet-outline',     label: 'Earnings' },
    { id: 'settings', icon: 'settings',   outlineIcon: 'settings-outline',   label: 'Settings' },
  ],
  merchant: [
    { id: 'home',     icon: 'storefront', outlineIcon: 'storefront-outline', label: 'Store'    },
    { id: 'orders',   icon: 'list',       outlineIcon: 'list-outline',       label: 'Orders'   },
    { id: 'profile',  icon: 'person',     outlineIcon: 'person-outline',     label: 'Profile'  },
    { id: 'settings', icon: 'settings',   outlineIcon: 'settings-outline',   label: 'Settings' },
  ],
};

export default function BottomBar({ active, onPress, role = 'customer' }) {
  const tabs = TABS[role] || TABS.customer;

  return (
    <View style={s.bar}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={s.tab}
            onPress={() => onPress(tab.id)}
            activeOpacity={0.7}
          >
            {isActive && <View style={s.activeDot} />}
            <Ionicons
              name={isActive ? tab.icon : tab.outlineIcon}
              size={22}
              color={isActive ? LIME : GREY}
            />
            <Text style={[s.label, isActive && s.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    backgroundColor: 'rgba(8,8,8,0.97)',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingBottom: 24,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  activeDot: {
    position: 'absolute',
    top: -10,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: LIME,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: GREY,
    letterSpacing: 0.3,
  },
  labelActive: {
    color: LIME,
    fontWeight: '800',
  },
});
