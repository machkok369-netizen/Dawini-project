const ADMIN_UID = "WGQ7mo55xmTBOuQrrTnN98XMI9C3";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  TextInput, ActivityIndicator, Image, Alert, Modal, ScrollView
} from 'react-native';

import { collection, query, getDocs, doc, updateDoc, serverTimestamp, getDoc, where, arrayUnion, arrayRemove } from 'firebase/firestore'; 
import { db, auth } from './firebaseConfig';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

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

// Haversine distance in km
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const DOCTOR_STATUS_MAP = {
  in_office: { label: '🟢 IN OFFICE',     color: '#2E7D32', dot: '#4CAF50' },
  brb:       { label: '🟡 BE RIGHT BACK', color: '#d97706', dot: '#f59e0b' },
  away:      { label: '🔴 AWAY',          color: '#dc2626', dot: '#ef4444' },
  vacation:  { label: '🔵 ON VACATION',   color: '#2563eb', dot: '#3b82f6' },
};

const SPECIALTIES = ['All', 'Generaliste', 'Dentiste', 'Ophtalmologue', 'Pédiatre', 'Cardiologue', 'Orthopédiste'];
const MIN_RATINGS = [{ label: 'Any', value: 0 }, { label: '3+', value: 3 }, { label: '4+', value: 4 }, { label: '4.5+', value: 4.5 }];
const SORT_OPTIONS = [
  { key: 'default',  label: 'Default'  },
  { key: 'rating',   label: '⭐ Rating'  },
  { key: 'distance', label: '📍 Distance' },
];

export default function DoctorListScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDoctor, setIsDoctor] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [savedDoctors, setSavedDoctors] = useState([]);

  // Filter / sort state
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterSpecialty, setFilterSpecialty] = useState('All');
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterAvailableNow, setFilterAvailableNow] = useState(false);
  const [sortBy, setSortBy] = useState('default');

  // Check role and load saved doctors
  useEffect(() => {
    const init = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.role === 'doctor') setIsDoctor(true);
          setSavedDoctors(data.savedDoctors || []);
        }
      } catch (e) {
        console.log("Init error:", e);
      }
    };
    init();

    // Request location quietly (for distance sort)
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then(loc => setUserLocation(loc.coords))
          .catch(() => {});
      }
    });
  }, []);

  // Fetch doctors
  useEffect(() => {
    let isMounted = true;

    const fetchDoctors = async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, 'users'),
            where('role', '==', 'doctor'),
            where('profileCompleted', '==', true),
            where('isVerified', '==', true)
          )
        );
        if (!isMounted) return;
        const doctorsList = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.location && d.fullName);
        setDoctors(doctorsList);
        setLoading(false);
      } catch (error) {
        console.log('Doctors fetch error:', error);
        if (isMounted) {
          Alert.alert(i18n.t('common:error'), i18n.t('screens:doctorList.loadError'));
          setLoading(false);
        }
      }
    };

    fetchDoctors();
    const interval = setInterval(fetchDoctors, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Toggle favorite
  const toggleFavorite = useCallback(async (doctorId) => {
    const isFav = savedDoctors.includes(doctorId);
    const updated = isFav
      ? savedDoctors.filter(id => id !== doctorId)
      : [...savedDoctors, doctorId];
    setSavedDoctors(updated);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        savedDoctors: isFav ? arrayRemove(doctorId) : arrayUnion(doctorId),
      });
    } catch (e) {
      // Revert on error
      setSavedDoctors(savedDoctors);
      Alert.alert(i18n.t('common:error'), i18n.t('screens:doctorList.loadError'));
    }
  }, [savedDoctors]);

  const handleStartJourney = async (doctor) => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(i18n.t('common:permissionDenied'), i18n.t('screens:doctorList.gpsError'));
      return;
    }
    await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 }, 
      (location) => {
        updateDoc(doc(db, "active_trips", auth.currentUser.uid), {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          lastUpdated: serverTimestamp()
        });
      }
    );
    navigation.navigate('Tracking', { doctor, tripUserId: auth.currentUser.uid });
  };

  const filteredAndSorted = useMemo(() => {
    let list = doctors;

    // Text search
    if (searchQuery.trim()) {
      const qNorm = normalizeText(searchQuery);
      list = list.filter(d => {
        const matchFields = (
          normalizeText(d.name).includes(qNorm) ||
          normalizeText(d.fullName || '').includes(qNorm) ||
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
    }

    // Specialty filter
    if (filterSpecialty && filterSpecialty !== 'All') {
      const specNorm = normalizeText(filterSpecialty);
      list = list.filter(d => normalizeText(d.specialty || '').includes(specNorm));
    }

    // Min rating filter
    if (filterMinRating > 0) {
      list = list.filter(d => (d.averageRating || 0) >= filterMinRating);
    }

    // Available now filter
    if (filterAvailableNow) {
      list = list.filter(d => d.status === 'in_office');
    }

    // Sort
    if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    } else if (sortBy === 'distance' && userLocation) {
      list = [...list].sort((a, b) => {
        const dA = a.location ? getDistanceKm(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude) : 9999;
        const dB = b.location ? getDistanceKm(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude) : 9999;
        return dA - dB;
      });
    }

    return list;
  }, [searchQuery, doctors, filterSpecialty, filterMinRating, filterAvailableNow, sortBy, userLocation]);

  const activeFilterCount = [
    filterSpecialty !== 'All',
    filterMinRating > 0,
    filterAvailableNow,
    sortBy !== 'default',
  ].filter(Boolean).length;

  const renderDoctor = ({ item }) => {
    const isPremium = checkSubscriptionStatus(item.subscriptionExpiry);
    const statusInfo = DOCTOR_STATUS_MAP[item.status] || { label: '⚪ OFFLINE', color: '#999', dot: '#BDC3C7' };
    const canNavigate = item.status === 'in_office';
    const isFav = savedDoctors.includes(item.id);
    const dist = userLocation && item.location
      ? getDistanceKm(userLocation.latitude, userLocation.longitude, item.location.latitude, item.location.longitude)
      : null;

    return (
      <View style={[styles.card, isPremium && styles.premiumBorder]}>
        <View style={styles.header}>
          <Image source={{ uri: item.profilePic || 'https://via.placeholder.com/150' }} style={styles.avatar} />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>Dr. {item.fullName || item.name}</Text>
              {isPremium && <Text style={styles.goldBadge}>✅</Text>}
              <View style={[styles.pulse, { backgroundColor: statusInfo.dot }]} />
            </View>
            <Text style={styles.subText}>{item.specialty} • {item.experience || 0} yrs</Text>
            {item.averageRating > 0 && (
              <Text style={styles.ratingText}>⭐ {item.averageRating.toFixed(1)} ({item.totalRatings || 0})</Text>
            )}
            {dist !== null && (
              <Text style={styles.distanceText}>📍 {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.favBtn} onPress={() => toggleFavorite(item.id)}>
            <Text style={styles.favBtnText}>{isFav ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footer}>
          <Text style={[styles.status, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          {canNavigate && (
            <TouchableOpacity style={styles.onWayBtn} onPress={() => handleStartJourney(item)}>
              <Text style={styles.btnText}>🗺️ {t('doctorList.getDirections')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <Text style={styles.logo}>{t('doctorList.appName')}</Text>

      {/* Search + Filter row */}
      <View style={styles.searchRow}>
        <TextInput 
          style={styles.search} 
          placeholder={t('doctorList.searchPlaceholder')}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]} onPress={() => setFilterVisible(true)}>
          <Text style={[styles.filterBtnText, activeFilterCount > 0 && styles.filterBtnTextActive]}>
            {activeFilterCount > 0 ? t('doctorList.filtersActive', { n: activeFilterCount }) : t('doctorList.filtersLabel')}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1877F2" />
      ) : (
        <FlatList 
          data={filteredAndSorted} 
          renderItem={renderDoctor} 
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t('doctorList.noResults')}</Text>
            </View>
          }
        />
      )}

      {/* DOCTOR DASHBOARD BUTTON */}
      {isDoctor && (
        <TouchableOpacity 
          style={styles.doctorFloatingBtn} 
          onPress={() => navigation.navigate('DoctorDashboard')}
        >
          <Text style={styles.doctorBtnText}>🩺 {t('doctorList.myDashboard')}</Text>
        </TouchableOpacity>
      )}

      {/* ADMIN BUTTON */}
      {auth.currentUser?.uid === ADMIN_UID && (
        <TouchableOpacity 
          style={styles.adminFloatingBtn} 
          onPress={() => navigation.navigate('Admin')}
        >
          <Text style={styles.adminBtnText}>🛡️ {t('doctorList.adminPanel')}</Text>
        </TouchableOpacity>
      )}

      {/* ── Filter / Sort Modal ──────────────────────────────────────────── */}
      <Modal visible={filterVisible} transparent animationType="slide" onRequestClose={() => setFilterVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.filterSheet}>
            <Text style={styles.filterTitle}>{t('doctorList.filtersTitle')}</Text>

            {/* Specialty */}
            <Text style={styles.filterLabel}>{t('doctorList.specialtyLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {SPECIALTIES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, filterSpecialty === s && styles.chipActive]}
                  onPress={() => setFilterSpecialty(s)}
                >
                  <Text style={[styles.chipText, filterSpecialty === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Min Rating */}
            <Text style={styles.filterLabel}>{t('doctorList.minRatingLabel')}</Text>
            <View style={styles.chipRow}>
              {MIN_RATINGS.map(r => (
                <TouchableOpacity
                  key={r.label}
                  style={[styles.chip, filterMinRating === r.value && styles.chipActive]}
                  onPress={() => setFilterMinRating(r.value)}
                >
                  <Text style={[styles.chipText, filterMinRating === r.value && styles.chipTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Available now */}
            <TouchableOpacity
              style={[styles.toggleRow, filterAvailableNow && styles.toggleRowActive]}
              onPress={() => setFilterAvailableNow(v => !v)}
            >
              <Text style={styles.toggleLabel}>🟢 {t('doctorList.availableNow')}</Text>
              <Text style={styles.toggleSwitch}>{filterAvailableNow ? '✅' : '⬜'}</Text>
            </TouchableOpacity>

            {/* Sort */}
            <Text style={styles.filterLabel}>{t('doctorList.sortByLabel')}</Text>
            <View style={styles.chipRow}>
              {SORT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, sortBy === opt.key && styles.chipActive]}
                  onPress={() => setSortBy(opt.key)}
                >
                  <Text style={[styles.chipText, sortBy === opt.key && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.resetBtn} onPress={() => {
                setFilterSpecialty('All');
                setFilterMinRating(0);
                setFilterAvailableNow(false);
                setSortBy('default');
              }}>
                <Text style={styles.resetBtnText}>{t('doctorList.reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterVisible(false)}>
                <Text style={styles.applyBtnText}>{t('doctorList.apply')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5', padding: 15 },
  logo: { fontSize: 32, fontWeight: '900', color: '#2ecc71', marginTop: 30, marginBottom: 15 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 20, alignItems: 'center' },
  search: { flex: 1, backgroundColor: '#FFF', padding: 15, borderRadius: 30, elevation: 4 },
  filterBtn: { backgroundColor: '#FFF', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, elevation: 4, borderWidth: 1.5, borderColor: '#e5e7eb' },
  filterBtnActive: { borderColor: '#2ecc71', backgroundColor: '#f0fdf4' },
  filterBtnText: { fontWeight: '600', color: '#65676B', fontSize: 13 },
  filterBtnTextActive: { color: '#2ecc71' },
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
  ratingText: { color: '#f59e0b', fontSize: 13, fontWeight: '600', marginTop: 2 },
  distanceText: { color: '#6b7280', fontSize: 12, marginTop: 1 },
  favBtn: { padding: 6 },
  favBtnText: { fontSize: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
  status: { fontWeight: 'bold', fontSize: 12 },
  onWayBtn: { backgroundColor: '#2ecc71', padding: 10, borderRadius: 12 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  emptyBox: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  doctorFloatingBtn: {
    position: 'absolute', bottom: 30, left: 20,
    backgroundColor: '#2ecc71', paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 30, elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  doctorBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  adminFloatingBtn: {
    position: 'absolute', bottom: 30, right: 20,
    backgroundColor: '#e74c3c', paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 30, elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  adminBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  // Filter modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  filterTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 20 },
  filterLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#f9fafb' },
  chipActive: { borderColor: '#2ecc71', backgroundColor: '#f0fdf4' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#2ecc71', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  toggleRowActive: { borderColor: '#2ecc71', backgroundColor: '#f0fdf4' },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  toggleSwitch: { fontSize: 18 },
  filterActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  resetBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center' },
  resetBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  applyBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: '#2ecc71', alignItems: 'center' },
  applyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});