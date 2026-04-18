import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import NotificationService from './NotificationService';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import PatientOnboardingScreen from './screens/PatientOnboardingScreen';
import DoctorListScreen from './screens/DoctorListScreen';
import TrackingScreen from './screens/TrackingScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import DoctorDashboardScreen from './screens/DoctorDashBoardScreen';
import PatientMapScreen from './screens/Patientmapscreen';
import AppointmentHistoryScreen from './screens/AppointmentHistoryScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import AdminScreen from './screens/AdminScreen';
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
          name="AppointmentHistory"
          component={AppointmentHistoryScreen}
          options={{ title: 'My Appointments' }}
        />

        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications' }}
        />

      </Stack.Navigator>
    </NavigationContainer>
  );
}