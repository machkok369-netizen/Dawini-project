import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import NotificationService from './NotificationService';

import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
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

export default function App() {
  useEffect(() => {
    // Register for push notifications on app start so tokens are always fresh
    NotificationService.registerForPushNotifications();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">

        <Stack.Screen
          name="Admin"
          component={AdminScreen}
          options={{ title: 'Admin Panel', headerShown: false }}
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
          options={{ title: 'My Profile' }}
        />

        <Stack.Screen
          name="AppointmentHistory"
          component={AppointmentHistoryScreen}
          options={{ title: 'My Appointments' }}
        />

        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications' }}
        />

        <Stack.Screen
          name="SubscriptionPayment"
          component={SubscriptionPaymentScreen}
          options={{ title: 'Renew Subscription' }}
        />

      </Stack.Navigator>
    </NavigationContainer>
  );
}
