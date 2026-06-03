import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const LIME = '#c8f000';
const BG   = '#080808';

const TABS = {
  customer: [
    { id: 'home',     icon: 'home',        outlineIcon: 'home-outline',        label: 'Home'     },
    { id: 'orders',   icon: 'cube',         outlineIcon: 'cube-outline',         label: 'Orders'   },
    { id: 'profile',  icon: 'person',       outlineIcon: 'person-outline',       label: 'Profile'  },
    { id: 'settings', icon: 'settings',     outlineIcon: 'settings-outline',     label: 'Settings' },
  ],
  rider: [
    { id: 'home',     icon: 'bicycle',      outlineIcon: 'bicycle-outline',      label: 'Ride'     },
    { id: 'jobs',     icon: 'list',         outlineIcon: 'list-outline',         label: 'Jobs'     },
    { id: 'earnings', icon: 'wallet',       outlineIcon: 'wallet-outline',       label: 'Earnings' },
    { id: 'settings', icon: 'settings',     outlineIcon: 'settings-outline',     label: 'Settings' },
  ],
  merchant: [
    { id: 'home',     icon: 'storefront',   outlineIcon: 'storefront-outline',   label: 'Store'    },
    { id: 'orders',   icon: 'list',         outlineIcon: 'list-outline',         label: 'Orders'   },
    { id: 'profile',  icon: 'person',       outlineIcon: 'person-outline',       label: 'Profile'  },
    { id: 'settings', icon: 'settings',     outlineIcon: 'settings-outline',     label: 'Settings' },
  ],
};

export default function BottomBar({ active, onPress, role = 'customer' }) {
  const tabs = TABS[role] || TABS.customer;

  return (
    <View style={s.container}>
      <View style={[s.pill, Platform.OS === 'web' && {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }]}>
        {tabs.map(tab => {
          const isActive = active === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, isActive && s.tabActive]}
              onPress={() => onPress(tab.id)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={isActive ? tab.icon : tab.outlineIcon}
                size={20}
                color={isActive ? BG : '#666'}
              />
              {isActive && (
                <Text style={s.label}>{tab.label}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12,12,12,0.88)',
    borderRadius: 40,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 32,
    minWidth: 48,
  },
  tabActive: {
    backgroundColor: LIME,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: BG,
    letterSpacing: 0.1,
  },
});
