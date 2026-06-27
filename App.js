import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';

import NotificationService from './NotificationService';
import { LanguageProvider } from './LanguageContext';
import i18n from './i18n';
import { ThemeProvider, useTheme } from './ThemeContext';
import BottomTabBar from './BottomTabBar';

import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import TermsAcceptanceScreen from './TermsAcceptanceScreen';
import PatientOnboardingScreen from './PatientOnboardingScreen';
import DoctorListScreen from './DoctorListScreen';
import TrackingScreen from './TrackingScreen';
import EditProfileScreen from './EditProfileScreen';
import DoctorDashboardScreen from './DoctorDashBoardScreen';
import PatientMapScreen from './Patientmapscreen';
import AppointmentHistoryScreen from './AppointmentHistoryScreen';
import NotificationsScreen from './NotificationsScreen';
import AdminScreen from './AdminScreen';
import PatientProfileScreen from './PatientProfileScreen';
import SubscriptionPaymentScreen from './SubscriptionPaymentScreen';

const Stack = createStackNavigator();

const SCREENS_WITH_TABS = new Set([
  'PatientMap',
  'AppointmentHistory',
  'Notifications',
  'PatientProfile',
  'DoctorDashboard',
  'EditProfile',
]);

function AppNavigator() {
  const { colors, isDark } = useTheme();
  const navigationRef = useNavigationContainerRef();
  const [currentRoute, setCurrentRoute] = useState(null);

  const navTheme = {
    dark: isDark,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.tabBar,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };

  const showTabBar = SCREENS_WITH_TABS.has(currentRoute);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() =>
        setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? null)
      }
      onStateChange={() =>
        setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? null)
      }
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Navigator initialRouteName="Login">

          <Stack.Screen
            name="Admin"
            component={AdminScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="TermsAcceptance"
            component={TermsAcceptanceScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />

          <Stack.Screen
            name="PatientOnboarding"
            component={PatientOnboardingScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />

          <Stack.Screen
            name="DoctorList"
            component={DoctorListScreen}
            options={{ title: 'Dawini', headerShown: true }}
          />

          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={({ route }) => ({
              title: route.params?.isNewDoctor ? 'Setup Clinic' : 'Edit Profile',
              headerShown: false,
            })}
          />

          <Stack.Screen
            name="Tracking"
            component={TrackingScreen}
            options={{ title: 'Live Tracking' }}
          />

          <Stack.Screen
            name="DoctorDashboard"
            component={DoctorDashboardScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="PatientMap"
            component={PatientMapScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="PatientProfile"
            component={PatientProfileScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="AppointmentHistory"
            component={AppointmentHistoryScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="SubscriptionPayment"
            component={SubscriptionPaymentScreen}
            options={{ title: 'Renew Subscription' }}
          />

        </Stack.Navigator>

        {showTabBar && (
          <BottomTabBar navigation={navigationRef} currentRoute={currentRoute} />
        )}
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    NotificationService.registerForPushNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <I18nextProvider i18n={i18n}>
            <AppNavigator />
          </I18nextProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}