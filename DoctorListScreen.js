const ADMIN_UID = "WGQ7mo55xmTBOuQrrTnN98XMI9C3";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  TextInput, ActivityIndicator, Image, Alert 
} from 'react-native';

import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, getDoc, where } from 'firebase/firestore'; 
import { db, auth } from './firebaseConfig';
import * as Location from 'expo-location';

const emojiMap = {
  '🦷': ['dentiste', 'طبيب أسنان', 'اسنان', 'dentaire', 'teeth'],
  '👁️': ['ophtalmologue', 'عيون', 'ophtalmo', 'eye'],
  '👶': ['pédiatre', 'طبيب اطفال', 'pediatrie'],
  '🫀': ['cardiologue', 'قلب', 'cardio'],
  '🦴': ['orthopédiste', 'عظام', 'ortho'],
  '🩺': ['generaliste', 'عام', 'général']
};

const normalizeText = (str = '') => 
  str.normalize('NFD')
     .replace(/[\u0300-\u036f]/g, "") 
     .replace(/[\u0617-\u061A\u064B-\u065F]/g, "") 
     .toLowerCase()
     .trim();

const checkSubscriptionStatus = (expiryDate) => {
  if (!expiryDate) return false;
  try {
    let expiry = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate);
    return expiry > new Date();
  } catch (e) { return false; }
};

const DOCTOR_STATUS_MAP = {
  in_office: { label: '🟢 IN OFFICE',     color: '#2E7D32', dot: '#4CAF50' },
  brb:       { label: '🟡 BE RIGHT BACK', color: '#d97706', dot: '#f59e0b' },
  away:      { label: '🔴 AWAY',          color: '#dc2626', dot: '#ef4444' },
  vacation:  { label: '🔵 ON VACATION',   color: '#2563eb', dot: '#3b82f6' },
};

export default function DoctorListScreen({ navigation }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDoctor, setIsDoctor] = useState(false); // ← NEW

  // Check if current user is a doctor
  useEffect(() => {
    const checkRole = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists() && userDoc.data().role === 'doctor') {
          setIsDoctor(true);
        }
      } catch (e) {
        console.log("Role check error:", e);
      }
    };
    checkRole();
  }, []);

  const handleStartJourney = async (doctor) => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Denied", "We need GPS to track the journey!");
      return;
    }
    await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 }, 
      (location) => {
        updateDoc(doc(db, "active_trips", "trip_001"), {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          lastUpdated: serverTimestamp()
        });
      }
    );
    navigation.navigate('Tracking', { doctor });
  };

  useEffect(() => {
    const unsubDocs = onSnapshot(
      query(
        collection(db, 'users'),
        where('role', '==', 'doctor'),
        where('profileCompleted', '==', true),
        where('isVerified', '==', true)
      ),
      (snapshot) => {
        const doctorsList = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.location && d.fullName); // ✅ Filter valid doctors
        setDoctors(doctorsList);
        setLoading(false);
      },
      (error) => {
        console.log('Doctors fetch error:', error);
        Alert.alert('Error', 'Failed to load doctors');
        setLoading(false);
      }
    );
    return () => unsubDocs();
  }, []);

  const filteredDoctors = useMemo(() => {
    if (!searchQuery.trim()) return doctors;
    const qNorm = normalizeText(searchQuery);
    return doctors.filter(d => {
      const matchFields = (
        normalizeText(d.name).includes(qNorm) ||
        normalizeText(d.specialty).includes(qNorm) ||
        normalizeText(d.city || '').includes(qNorm)
      );
      if (matchFields) return true;
      for (const char of searchQuery) {
        if (emojiMap[char]) {
          const keywords = emojiMap[char];
          if (keywords.some(kw => normalizeText(d.specialty).includes(kw))) return true;
        }
      }
      return false;
    });
  }, [searchQuery, doctors]);

  const renderDoctor = ({ item }) => {
    const isPremium = checkSubscriptionStatus(item.subscriptionExpiry);
    const statusInfo = DOCTOR_STATUS_MAP[item.status] || { label: '⚪ OFFLINE', color: '#999', dot: '#BDC3C7' };
    const canNavigate = item.status === 'in_office';
    return (
      <View style={[styles.card, isPremium && styles.premiumBorder]}>
        <View style={styles.header}>
          <Image source={{ uri: item.profilePic || 'https://via.placeholder.com/150' }} style={styles.avatar} />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>Dr. {item.name}</Text>
              {isPremium && <Text style={styles.goldBadge}>✅</Text>}
              <View style={[styles.pulse, { backgroundColor: statusInfo.dot }]} />
            </View>
            <Text style={styles.subText}>{item.specialty} • {item.experience || 0} yrs</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={[styles.status, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          {canNavigate && (
            <TouchableOpacity style={styles.onWayBtn} onPress={() => handleStartJourney(item)}>
              <Text style={styles.btnText}>🗺️ Get Directions</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Dawini 🏥</Text>
      <TextInput 
        style={styles.search} 
        placeholder="Search 🦷, Specialty, or Name..." 
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      
      {loading ? (
        <ActivityIndicator size="large" color="#1877F2" />
      ) : (
        <FlatList 
          data={filteredDoctors} 
          renderItem={renderDoctor} 
          keyExtractor={item => item.id} 
        />
      )}

      {/* DOCTOR DASHBOARD BUTTON */}
      {isDoctor && (
        <TouchableOpacity 
          style={styles.doctorFloatingBtn} 
          onPress={() => navigation.navigate('DoctorDashboard')}
        >
          <Text style={styles.doctorBtnText}>🩺 My Dashboard</Text>
        </TouchableOpacity>
      )}

      {/* ADMIN BUTTON */}
      {auth.currentUser?.uid === ADMIN_UID && (
        <TouchableOpacity 
          style={styles.adminFloatingBtn} 
          onPress={() => navigation.navigate('Admin')}
        >
          <Text style={styles.adminBtnText}>🛡️ Admin</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5', padding: 15 },
  logo: { fontSize: 32, fontWeight: '900', color: '#2ecc71', marginTop: 30, marginBottom: 15 },
  search: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, elevation: 4, marginBottom: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, marginBottom: 15 },
  premiumBorder: { borderColor: '#1877F2', borderWidth: 1.5 },
  header: { flexDirection: 'row' },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  info: { marginLeft: 15, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 18, fontWeight: 'bold' },
  goldBadge: { marginLeft: 6 },
  pulse: { width: 10, height: 10, borderRadius: 5, marginLeft: 10 },
  subText: { color: '#65676B', fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
  status: { fontWeight: 'bold', fontSize: 12 },
  onWayBtn: { backgroundColor: '#2ecc71', padding: 10, borderRadius: 12 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  doctorFloatingBtn: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: '#2ecc71',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  doctorBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  adminFloatingBtn: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  adminBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
});