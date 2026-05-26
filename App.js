import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { navigationRef } from './screens/navRef';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './supabase';

import LandingScreen from './screens/LandingScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import CustomerScreen from './screens/CustomerScreen';
import RiderScreen from './screens/RiderScreen';
import RiderVerificationScreen from './screens/RiderVerificationScreen';
import AdminScreen from './screens/AdminScreen';
import MerchantScreen from './screens/MerchantScreen';
import ProfileScreen from './screens/ProfileScreen';
import OrdersScreen from './screens/OrdersScreen';
import SettingsScreen from './screens/SettingsScreen';

const Stack = createStackNavigator();

async function resolveRoute(user) {
  const role = user.user_metadata?.role;
  if (role === 'admin') return 'Admin';
  if (role === 'merchant') return 'Merchant';
  if (role === 'rider') {
    const { data } = await supabase
      .from('rider_verifications')
      .select('status')
      .eq('rider_id', user.id)
      .single();
    return data?.status === 'approved' ? 'Rider' : 'RiderVerification';
  }
  return 'Customer';
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState('Landing');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const route = await resolveRoute(session.user);
        setInitialRoute(route);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setInitialRoute('Landing');
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0c0c0c', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#c8f000" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0c0c0c' }}>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: '#0c0c0c' },
            animationEnabled: true,
          }}
        >
          <Stack.Screen name="Landing" component={LandingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="Customer" component={CustomerScreen} />
          <Stack.Screen name="Rider" component={RiderScreen} />
          <Stack.Screen name="RiderVerification" component={RiderVerificationScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
          <Stack.Screen name="Merchant" component={MerchantScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Orders" component={OrdersScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
