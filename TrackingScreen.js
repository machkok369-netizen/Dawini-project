import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function TrackingScreen() {
  // 1. We start with a default location (center of town)
  const [doctorLocation, setDoctorLocation] = useState({
    latitude: 36.26, // Change to your city's lat
    longitude: 6.63, // Change to your city's lng
  });

  useEffect(() => {
    // 2. This "Listens" to Firebase. Every time the doctor's GPS moves,
    // this function fires and updates the map automatically!
    const unsub = onSnapshot(doc(db, "active_trips", "trip_001"), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setDoctorLocation({
          latitude: data.lat,
          longitude: data.lng,
        });
      }
    });

    return () => unsub();
  }, []);

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map} 
        region={{
          ...doctorLocation,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* 3. The Marker represents the Doctor */}
        <Marker 
          coordinate={doctorLocation} 
          title="Le Docteur arrive 🏎️"
          description="Votre aide est en chemin"
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
});