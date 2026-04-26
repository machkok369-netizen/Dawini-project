import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { doc, onSnapshot } from 'firebase/firestore';
import * as Location from 'expo-location';
import { db } from './firebaseConfig';
import { useTranslation } from 'react-i18next';

export default function TrackingScreen({ route }) {
  const { t } = useTranslation('screens');
  const targetDoctor = route?.params?.doctor || null;
  const tripUserId = route?.params?.tripUserId || null;
  const [patientLocation, setPatientLocation] = useState(null);

  const [doctorLocation, setDoctorLocation] = useState({
    latitude: targetDoctor?.location?.latitude || 36.26,
    longitude: targetDoctor?.location?.longitude || 6.63,
  });

  useEffect(() => {
    if (targetDoctor?.location) return () => {};
    if (!tripUserId) return () => {};

    const unsubListener = onSnapshot(
      doc(db, "active_trips", tripUserId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDoctorLocation({
            latitude: data.lat,
            longitude: data.lng,
          });
        }
      },
      (error) => {
        console.log('Tracking error:', error);
      }
    );

    return () => unsubListener();
  }, [targetDoctor]);

  useEffect(() => {
    const loadLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        setPatientLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch (e) {}
    };
    loadLocation();
  }, []);

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map} 
        region={{
          ...(patientLocation || doctorLocation),
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker 
          coordinate={doctorLocation} 
          title={targetDoctor?.fullName ? `Dr. ${targetDoctor.fullName}` : t('tracking.doctorDestination')}
          description={t('tracking.doctorDestination')}
        />
        {patientLocation && (
          <Marker
            coordinate={patientLocation}
            title={t('tracking.you')}
            pinColor="green"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
});
