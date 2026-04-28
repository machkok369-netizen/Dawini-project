import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Modal, Image, Alert, ActivityIndicator
} from 'react-native';
import * as Location from 'expo-location';
import {
  collection, query, where, getDocs, addDoc,
  serverTimestamp, doc, getDoc, updateDoc, increment,
  onSnapshot, runTransaction
} from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  in_office: '#16a34a',
  brb:       '#f59e0b',
  away:      '#ef4444',
  vacation:  '#9ca3af',
};

const SPECIALTIES = [
  'All',
  'General Practitioner', 'Dentist', 'Cardiologist', 'Pediatrician',
  'Gynecologist', 'Ophthalmologist', 'Dermatologist', 'Orthopedist',
  'ENT', 'Neurologist', 'Psychiatrist', 'Radiologist',
  'Urologist', 'Endocrinologist', 'Other',
];

const normalizeText = (str = '') =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const dateKey = (d) => d.toISOString().split('T')[0];
const EARTH_RADIUS_KM = 6371;
const DISCOVERY_RADIUS_KM = 3;

const toRad = (deg) => (deg * Math.PI) / 180;
const calculateDistanceKm = (from, to) => {
  if (!from || !to) return null;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.latitude))
    * Math.cos(toRad(to.latitude))
    * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const REVIEW_CATEGORIES = [
  { label: 'Overall',     field: 'overall' },
  { label: 'Wait',        field: 'waitTime' },
  { label: 'Attitude',    field: 'attitude' },
  { label: 'Cleanliness', field: 'cleanliness' },
];

export default function PatientMapScreen({ navigation, route }) {
  const isDoctor = route?.params?.isDoctor || false;
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();

  const [doctors, setDoctors]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [cardVisible, setCardVisible]   = useState(false);
  const [myLocation, setMyLocation]     = useState(null);
  const [todaySlot, setTodaySlot]       = useState(null);

  // Booking
  const [bookingVisible, setBookingVisible] = useState(false);
  const [bookingTime, setBookingTime]   = useState('');
  const [bookingNote, setBookingNote]   = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [patientProfile, setPatientProfile] = useState(null);
  const [bookForRelative, setBookForRelative] = useState(false);
  const [bookingRelativeName, setBookingRelativeName] = useState('');
  const [bookingRelativeRelation, setBookingRelativeRelation] = useState('');
  const [bookingRelativeAge, setBookingRelativeAge] = useState('');

  // Upcoming appointment banner (A)
  const [upcomingAppointment, setUpcomingAppointment] = useState(null);

  // Doctor ratings (C)
  const [doctorRatings, setDoctorRatings] = useState([]);

  // Rating
  const [ratingVisible, setRatingVisible] = useState(false);
  const [ratingStars, setRatingStars]   = useState(0);
  const [ratingWait, setRatingWait]     = useState(0);
  const [ratingAttitude, setRatingAttitude] = useState(0);
  const [ratingCleanliness, setRatingCleanliness] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  // Suggestions
  const [suggestionVisible, setSuggestionVisible] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionLoading, setSuggestionLoading] = useState(false);



  // ── Get location & fetch doctors ─────────────────────────────────────────────
  useEffect(() => {
    const requestLocationPermission = () =>
      new Promise((resolve) => {
        Alert.alert(
          `📍 ${t('patientMap.locationTitle')}`,
          t('patientMap.locationMsg'),
          [
            { text: t('patientMap.locationSkip'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('patientMap.locationContinue'), onPress: () => resolve(true) },
          ],
          { onDismiss: () => resolve(false) }
        );
      });

    const init = async () => {
      try {
        const agreed = await requestLocationPermission();
        if (agreed) {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({});
            setMyLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        }

        // Fetch all doctors from users collection
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'doctor'), where('profileCompleted', '==', true)));
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDoctors(docs);

        const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userSnap.exists()) {
          const profile = userSnap.data();
          setPatientProfile(profile);
          setBookingRelativeName(profile.relativeProfile?.name || '');
          setBookingRelativeRelation(profile.relativeProfile?.relation || '');
          setBookingRelativeAge(profile.relativeProfile?.age ? String(profile.relativeProfile.age) : '');
        }
      } catch (e) {
        console.log('Map init error:', e);
        Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.connectionError'));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ── Real-time upcoming appointment banner (A) ─────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(
      collection(db, 'reservations'),
      where('patientId', '==', uid),
      where('status', 'in', ['confirmed', 'pending'])
    );
    const unsub = onSnapshot(q, snap => {
      const now = new Date();
      const upcoming = snap.docs
        .map(d => ({
          id: d.id,
          ...d.data(),
          date: d.data().date?.toDate ? d.data().date.toDate() : new Date(d.data().date),
        }))
        .filter(a => a.date >= now)
        .sort((a, b) => a.date - b.date);
      setUpcomingAppointment(upcoming.length > 0 ? upcoming[0] : null);
    }, (err) => {
      console.log('Appointment banner error:', err);
      setUpcomingAppointment(null);
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.appointmentError'));
    });
    return () => unsub();
  }, []);

  // ── Fetch today's slot for selected doctor ────────────────────────────────────
  useEffect(() => {
    if (!selectedDoctor) return;
    const fetchSlot = async () => {
      try {
        const today = dateKey(new Date());
        const slotDoc = await getDoc(doc(db, 'slots', `${selectedDoctor.id}_${today}`));
        if (slotDoc.exists()) {
          const s = slotDoc.data();
          setTodaySlot({ available: Math.max(0, s.max - s.booked), max: s.max });
        } else {
          setTodaySlot(null);
        }
      } catch (e) {
        setTodaySlot(null);
      }
    };
    fetchSlot();
  }, [selectedDoctor]);

  // ── Fetch doctor ratings when a doctor is selected (C) ───────────────────────
  useEffect(() => {
    if (!selectedDoctor) { setDoctorRatings([]); return; }
    const fetchRatings = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'ratings'),
          where('doctorId', '==', selectedDoctor.id)
        ));
        const ratings = snap.docs
          .map(d => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date(),
          }))
          .filter(r => r.isPublicComment === true)
          .sort((a, b) => b.createdAt - a.createdAt);
        setDoctorRatings(ratings);
      } catch (e) {
        console.log('Fetch ratings error:', e);
        setDoctorRatings([]);
      }
    };
    fetchRatings();
  }, [selectedDoctor]);

  // ── Filtered doctors ──────────────────────────────────────────────────────────
  const filteredDoctors = useMemo(() => {
    const qNorm = normalizeText(searchQuery);
    return doctors
      .filter(d => d.location)
      .map(d => ({
        ...d,
        distanceKm: myLocation ? calculateDistanceKm(myLocation, d.location) : null,
      }))
      .filter(d => {
        const matchSearch = !qNorm
          || normalizeText(d.fullName).includes(qNorm)
          || normalizeText(d.specialty).includes(qNorm)
          || normalizeText(d.cabinetName || '').includes(qNorm);
        const matchFilter = selectedFilter === 'All'
          || normalizeText(d.specialty).includes(normalizeText(selectedFilter));
        const withinRadius = myLocation ? d.distanceKm <= DISCOVERY_RADIUS_KM : true;
        return matchSearch && matchFilter && withinRadius;
      })
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  }, [doctors, searchQuery, selectedFilter, myLocation]);

  const getRatingEligibility = async () => {
    if (!selectedDoctor) return { allowed: false, reason: 'Choose a doctor first.' };
    const uid = auth.currentUser.uid;
    const reservationsSnap = await getDocs(query(
      collection(db, 'reservations'),
      where('doctorId', '==', selectedDoctor.id),
      where('patientId', '==', uid),
      where('status', '==', 'completed')
    ));
    if (reservationsSnap.empty) {
      return { allowed: false, reason: 'You can rate only after a completed appointment.' };
    }
    const ratingsSnap = await getDocs(query(
      collection(db, 'ratings'),
      where('doctorId', '==', selectedDoctor.id),
      where('patientId', '==', uid)
    ));
    const ratedAppointmentIds = new Set(
      ratingsSnap.docs.map(r => r.data().appointmentId).filter(Boolean)
    );
    const now = new Date();
    const eligible = reservationsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .find((appointment) => {
        const appointmentDate = appointment.date?.toDate ? appointment.date.toDate() : new Date(appointment.date);
        if (Number.isNaN(appointmentDate.getTime())) return false;
        const afterCutoff = new Date(appointmentDate);
        afterCutoff.setHours(18, 0, 0, 0);
        return now >= afterCutoff && !ratedAppointmentIds.has(appointment.id);
      });

    if (!eligible) {
      return { allowed: false, reason: 'Rating opens after 18:00 on your completed appointment day.' };
    }
    return { allowed: true, appointmentId: eligible.id };
  };

  // ── Handle doctor card tap ────────────────────────────────────────────────────
  const handleDoctorSelect = (doctor) => {
    setSelectedDoctor(doctor);
    setCardVisible(true);
  };

  // ── Book reservation ──────────────────────────────────────────────────────────
  const handleBook = async () => {
    const parsedRelativeAge = bookingRelativeAge.trim() ? parseInt(bookingRelativeAge, 10) : null;
    if (!bookingTime.trim()) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.missingTime'));
      return;
    }
    if (bookForRelative && !bookingRelativeName.trim()) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.missingRelativeName'));
      return;
    }
    if (bookForRelative && bookingRelativeAge.trim() && Number.isNaN(parsedRelativeAge)) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.invalidRelAge'));
      return;
    }
    setBookingLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.notLoggedIn'));
        return;
      }
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.data();
      const today = dateKey(new Date());
      const acceptMode = selectedDoctor.acceptMode || 'manual';

      const appointmentData = {
        doctorId: selectedDoctor.id,
        patientId: uid,
        doctorName: selectedDoctor.fullName || selectedDoctor.name || 'Doctor',
        doctorLocation: selectedDoctor.location || null,
        patientName: userData?.fullName || 'Patient',
        patientPhone: userData?.phone || '',
        patientAge: userData?.age || null,
        bookingFor: bookForRelative ? 'relative' : 'self',
        bookedForName: bookForRelative ? bookingRelativeName.trim() : (userData?.fullName || 'Patient'),
        bookedForRelation: bookForRelative ? bookingRelativeRelation.trim() : 'self',
        bookedForAge: bookForRelative ? parsedRelativeAge : (userData?.age || null),
        date: new Date(),
        time: bookingTime,
        note: bookingNote,
        status: acceptMode === 'auto' ? 'confirmed' : 'pending',
        createdAt: serverTimestamp(),
      };

      // ✅ Atomic slot-capacity check: read → verify capacity → write both
      // reservation and slot increment in a single transaction to prevent
      // double-booking when concurrent requests arrive for the last slot.
      const slotRef = doc(db, 'slots', `${selectedDoctor.id}_${today}`);
      const newReservationRef = doc(collection(db, 'reservations'));

      let noSlotsAvailable = false;
      await runTransaction(db, async (transaction) => {
        const slotDoc = await transaction.get(slotRef);
        if (slotDoc.exists()) {
          const { booked = 0, max = 10 } = slotDoc.data();
          if (booked >= max) {
            noSlotsAvailable = true;
            return;
          }
          transaction.update(slotRef, { booked: increment(1) });
        }
        transaction.set(newReservationRef, appointmentData);
      });

      if (noSlotsAvailable) {
        Alert.alert(
          i18n.t('common:error'),
          i18n.t('screens:patientMap.noSlotsMsg')
        );
        return;
      }

      Alert.alert(
        '✅',
        acceptMode === 'auto'
          ? i18n.t('screens:patientMap.bookedConfirmed')
          : i18n.t('screens:patientMap.bookedPending')
      );
      setBookingVisible(false);
      setBookingTime('');
      setBookingNote('');
      setBookForRelative(false);
    } catch (e) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.bookError'));
    } finally {
      setBookingLoading(false);
    }
  };

  // ── Submit rating ─────────────────────────────────────────────────────────────
  const handleRating = async () => {
    const eligibility = await getRatingEligibility();
    if (!eligibility.allowed) {
      Alert.alert('Not Allowed Yet', eligibility.reason);
      return;
    }
    if (ratingStars === 0) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.missingRating'));
      return;
    }
    try {
      await addDoc(collection(db, 'ratings'), {
        doctorId: selectedDoctor.id,
        patientId: auth.currentUser.uid,
        overall: ratingStars,
        waitTime: ratingWait,
        attitude: ratingAttitude,
        cleanliness: ratingCleanliness,
        comment: ratingComment,
        appointmentId: eligibility.appointmentId,
        isPublicComment: true,
        createdAt: serverTimestamp(),
      });
      Alert.alert('🙏', i18n.t('screens:patientMap.reviewThanks'));
      setRatingVisible(false);
      setRatingStars(0); setRatingWait(0); setRatingAttitude(0);
      setRatingCleanliness(0); setRatingComment('');
    } catch (e) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.reviewError'));
    }
  };

  const handleGoNow = (doctor) => {
    if (!doctor?.location) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.noLocation'));
      return;
    }
    navigation.navigate('Tracking', { doctor });
  };

  const openRatingModal = async () => {
    const eligibility = await getRatingEligibility();
    if (!eligibility.allowed) {
      Alert.alert('Not Allowed Yet', eligibility.reason);
      return;
    }
    setCardVisible(false);
    setRatingVisible(true);
  };

  const submitSuggestion = async () => {
    if (!suggestionText.trim()) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.missingSuggestion'));
      return;
    }
    setSuggestionLoading(true);
    try {
      await addDoc(collection(db, 'suggestions'), {
        userId: auth.currentUser.uid,
        text: suggestionText.trim(),
        source: 'patient_map',
        status: 'new',
        createdAt: serverTimestamp(),
      });
      Alert.alert('🙏', i18n.t('screens:patientMap.suggestionThanks'));
      setSuggestionText('');
      setSuggestionVisible(false);
    } catch (e) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientMap.suggestionError'));
    } finally {
      setSuggestionLoading(false);
    }
  };

  // ── Star picker component ─────────────────────────────────────────────────────
  const StarPicker = ({ value, onChange, label }) => (
    <View style={styles.starRow}>
      <Text style={styles.starLabel}>{label}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map(i => (
          <TouchableOpacity key={i} onPress={() => onChange(i)}>
            <Text style={[styles.star, i <= value && styles.starFilled]}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Render individual doctor card ─────────────────────────────────────────────
  const renderDoctorCard = (doctor) => {
    const statusColor = STATUS_COLORS[doctor.status] || '#9ca3af';
    const statusLabel = doctor.status === 'in_office' ? t('patientMap.statusInOffice')
      : doctor.status === 'brb' ? t('patientMap.statusBeRightBack')
      : doctor.status === 'away' ? t('patientMap.statusAway')
      : doctor.status === 'vacation' ? t('patientMap.statusOnVacation')
      : t('patientMap.statusOffline');
    return (
      <TouchableOpacity style={styles.doctorCard} onPress={() => handleDoctorSelect(doctor)} activeOpacity={0.85}>
        {doctor.photoMain ? (
          <Image source={{ uri: doctor.photoMain }} style={styles.doctorCardPhoto} />
        ) : (
          <View style={[styles.doctorCardPhoto, styles.doctorCardPhotoPlaceholder]}>
            <Text style={{ fontSize: 28 }}>🏥</Text>
          </View>
        )}
        <View style={styles.doctorCardInfo}>
          <View style={styles.doctorCardTopRow}>
            <Text style={styles.doctorCardName} numberOfLines={1}>Dr. {doctor.fullName}</Text>
            <Text style={styles.doctorCardRating}>⭐ {doctor.averageRating || '0.0'}</Text>
          </View>
          <Text style={styles.doctorCardSpecialty} numberOfLines={1}>{doctor.specialty}</Text>
          {doctor.distanceKm != null && (
            <Text style={styles.doctorCardDistance}>📍 {doctor.distanceKm.toFixed(2)} {t('patientMap.kmAway')}</Text>
          )}
          <View style={styles.doctorCardStatusRow}>
            <View style={[styles.doctorCardStatusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.doctorCardStatusLabel, { color: statusColor }]}>{statusLabel}</Text>
            {doctor.visitCost ? <Text style={styles.doctorCardCost}> · {doctor.visitCost} DA</Text> : null}
          </View>
        </View>
        <Text style={styles.doctorCardChevron}>›</Text>
      </TouchableOpacity>
    );
  };

  if (loading) return (
    <View style={[styles.loadingContainer, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <ActivityIndicator size="large" color="#16a34a" />
      <Text style={styles.loadingText}>{t('patientMap.loading')}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      {/* ── Upcoming appointment banner ── */}
      {upcomingAppointment && (
        <View style={styles.apptBanner}>
          <TouchableOpacity
            style={styles.apptBannerMain}
            onPress={() => navigation.navigate('AppointmentHistory')}
            activeOpacity={0.8}
          >
            <Text style={styles.apptBannerIcon}>📅</Text>
            <View style={styles.apptBannerInfo}>
              <Text style={styles.apptBannerTitle} numberOfLines={1}>
                Dr. {upcomingAppointment.doctorName || 'Doctor'}
              </Text>
              <Text style={styles.apptBannerDate}>
                {upcomingAppointment.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                {upcomingAppointment.time ? ` · ${upcomingAppointment.time}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
          {upcomingAppointment.doctorLocation && (
            <TouchableOpacity
              style={styles.apptBannerNav}
              onPress={() => handleGoNow({ location: upcomingAppointment.doctorLocation, fullName: upcomingAppointment.doctorName })}
            >
              <Text style={styles.apptBannerNavText}>🗺️</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Search bar ── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('patientMap.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Specialty filter bar ── */}
      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          {SPECIALTIES.map(spec => (
            <TouchableOpacity
              key={spec}
              style={[styles.filterChip, selectedFilter === spec && styles.filterChipActive]}
              onPress={() => setSelectedFilter(spec)}
            >
              <Text style={[styles.filterChipText, selectedFilter === spec && styles.filterChipTextActive]}>
                {spec}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Results count & back button ── */}
      <View style={styles.countRow}>
        {isDoctor && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>← {t('patientMap.backToList')}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.countText}>
          {t('patientMap.doctorsNearby', { n: filteredDoctors.length, km: DISCOVERY_RADIUS_KM })}
        </Text>
      </View>

      {/* ── Doctor list (closest → farthest) ── */}
      <FlatList
        data={filteredDoctors}
        keyExtractor={item => item.id}
        renderItem={({ item }) => renderDoctorCard(item)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>{t('patientMap.noDoctors')}</Text>
            <Text style={styles.emptySubText}>{t('patientMap.noDoctorsHint')}</Text>
          </View>
        }
      />

      {!isDoctor && (
        <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('PatientProfile')}>
          <Text style={styles.profileBtnText}>👤</Text>
        </TouchableOpacity>
      )}

      {!isDoctor && (
        <TouchableOpacity style={styles.suggestionBtn} onPress={() => setSuggestionVisible(true)}>
          <Text style={styles.suggestionBtnText}>💡</Text>
        </TouchableOpacity>
      )}

      {/* ── Doctor card bottom sheet ── */}
      <Modal visible={cardVisible} transparent animationType="slide" onRequestClose={() => setCardVisible(false)}>
        <TouchableOpacity style={styles.cardOverlay} activeOpacity={1} onPress={() => setCardVisible(false)}>
          <View style={styles.cardSheet} onStartShouldSetResponder={() => true}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>

            {/* Drag handle */}
            <View style={styles.dragHandle} />

            {selectedDoctor && (
              <>
                {/* Doctor info */}
                <View style={styles.cardHeader}>
                  {selectedDoctor.photoMain ? (
                    <Image source={{ uri: selectedDoctor.photoMain }} style={styles.cardPhoto} />
                  ) : (
                    <View style={[styles.cardPhoto, { backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 24 }}>🏥</Text>
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardName}>Dr. {selectedDoctor.fullName}</Text>
                      <View style={styles.cardRatingBadge}>
                        <Text style={styles.cardRatingText}>⭐ {selectedDoctor.averageRating || '0.0'}</Text>
                      </View>
                    </View>
                    {selectedDoctor.fullNameAr ? <Text style={styles.cardNameAr}>{selectedDoctor.fullNameAr}</Text> : null}
                    <Text style={styles.cardSpecialty}>{selectedDoctor.specialty}</Text>
                    <Text style={styles.cardCabinet}>{selectedDoctor.cabinetName}</Text>
                    {selectedDoctor.distanceKm != null ? (
                      <Text style={styles.cardDistance}>📍 {selectedDoctor.distanceKm.toFixed(2)} {t('patientMap.kmAway')}</Text>
                    ) : null}
                    {selectedDoctor.experience ? (
                      <Text style={styles.cardExperience}>🎓 {selectedDoctor.experience} yrs experience</Text>
                    ) : null}
                    <View style={styles.cardStatusRow}>
                      <View style={[styles.cardStatusDot, { backgroundColor: STATUS_COLORS[selectedDoctor.status] || '#9ca3af' }]} />
                      <Text style={[styles.cardStatusText, { color: STATUS_COLORS[selectedDoctor.status] || '#9ca3af' }]}>
                        {selectedDoctor.status === 'in_office' ? t('patientMap.statusInOffice')
                          : selectedDoctor.status === 'brb' ? t('patientMap.statusBeRightBack')
                          : selectedDoctor.status === 'away' ? t('patientMap.statusAway')
                          : selectedDoctor.status === 'vacation' ? t('patientMap.statusOnVacation')
                          : t('patientMap.statusOffline')}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Stats row */}
                <View style={styles.cardStats}>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatValue}>{selectedDoctor.visitCost ? `${selectedDoctor.visitCost} DA` : '—'}</Text>
                    <Text style={styles.cardStatLabel}>{t('patientMap.visitCost')}</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatValue}>
                      {todaySlot ? `${todaySlot.available}/${todaySlot.max}` : '—'}
                    </Text>
                    <Text style={styles.cardStatLabel}>{t('patientMap.slotsToday')}</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatValue}>
                      {selectedDoctor.averageRating ? `${selectedDoctor.averageRating}★` : '—'}
                    </Text>
                    <Text style={styles.cardStatLabel}>{t('patientMap.rating')}</Text>
                  </View>
                </View>

                {/* Additional details */}
                {(selectedDoctor.city || selectedDoctor.address || selectedDoctor.workingHours) ? (
                  <View style={styles.cardDetailsBox}>
                    {selectedDoctor.city ? (
                      <Text style={styles.cardDetailItem}>📍 {selectedDoctor.address ? `${selectedDoctor.address}, ` : ''}{selectedDoctor.city}</Text>
                    ) : null}
                    {selectedDoctor.workingHours ? (
                      <Text style={styles.cardDetailItem}>🕐 {selectedDoctor.workingHours}</Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Equipment */}
                {selectedDoctor.equipment ? (
                  <View style={styles.cardEquipmentBox}>
                    <Text style={styles.cardEquipmentLabel}>🩺 {t('patientMap.equipmentServices')}</Text>
                    <Text style={styles.cardEquipment}>{selectedDoctor.equipment}</Text>
                  </View>
                ) : null}

                {/* Entrance / Street photos */}
                {(selectedDoctor.photoEntrance || selectedDoctor.photoStreet) && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardPhotosRow}>
                    {selectedDoctor.photoEntrance && (
                      <View style={styles.cardPhotoThumbWrap}>
                        <Image source={{ uri: selectedDoctor.photoEntrance }} style={styles.cardPhotoThumb} />
                        <Text style={styles.cardPhotoThumbLabel}>{t('patientMap.entrancePhoto')}</Text>
                      </View>
                    )}
                    {selectedDoctor.photoStreet && (
                      <View style={styles.cardPhotoThumbWrap}>
                        <Image source={{ uri: selectedDoctor.photoStreet }} style={styles.cardPhotoThumb} />
                        <Text style={styles.cardPhotoThumbLabel}>{t('patientMap.streetViewPhoto')}</Text>
                      </View>
                    )}
                  </ScrollView>
                )}

                {/* Reviews section (C) */}
                {doctorRatings.length > 0 && (() => {
                  const avg = (field) => (doctorRatings.reduce((s, r) => s + (r[field] || 0), 0) / doctorRatings.length).toFixed(1);
                  const comments = doctorRatings.filter(r => r.comment);
                  return (
                    <View style={styles.reviewsSection}>
                      <View style={styles.reviewsHeader}>
                        <Text style={styles.reviewsTitle}>{t('patientMap.patientReviews')}</Text>
                        <Text style={styles.reviewsCount}>⭐ {avg('overall')} · {doctorRatings.length} {t('patientMap.reviews')}</Text>
                      </View>
                      <View style={styles.reviewsBars}>
                        {REVIEW_CATEGORIES.map(({ field }) => (
                          <View key={field} style={styles.reviewBarItem}>
                            <Text style={styles.reviewBarLabel}>
                              {field === 'overall' ? t('patientMap.catOverall')
                                : field === 'waitTime' ? t('patientMap.catWait')
                                : field === 'attitude' ? t('patientMap.catAttitude')
                                : t('patientMap.catCleanliness')}
                            </Text>
                            <Text style={styles.reviewBarVal}>{avg(field)}★</Text>
                          </View>
                        ))}
                      </View>
                      {comments.slice(0, 3).map(r => (
                        <View key={r.id} style={styles.commentCard}>
                          <Text style={styles.commentText}>"{r.comment}"</Text>
                          <Text style={styles.commentDate}>{r.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                        </View>
                      ))}
                      {comments.length > 3 && (
                        <Text style={styles.seeAllReviews}>{t('patientMap.moreReviews', { n: comments.length - 3 })}</Text>
                      )}
                    </View>
                  );
                })()}

                {/* Action sheet (B + E) */}
                {!isDoctor && (
                  <View style={styles.cardActions}>
                    {/* Get Directions button (B) */}
                    <TouchableOpacity
                      style={styles.directionsBtn}
                      onPress={() => handleGoNow(selectedDoctor)}
                    >
                      <Text style={styles.directionsBtnText}>🗺️ {t('patientMap.goNow')}</Text>
                    </TouchableOpacity>

                    {/* Book appointment button */}
                    {selectedDoctor.status === 'in_office' && todaySlot?.available > 0 ? (
                      <TouchableOpacity
                        style={styles.bookBtn}
                        onPress={() => { setCardVisible(false); setBookingVisible(true); }}
                      >
                        <Text style={styles.bookBtnText}>📅 {t('patientMap.makeAppointment')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.bookBtnDisabled}>
                        <Text style={styles.bookBtnDisabledText}>
                          {selectedDoctor.status !== 'in_office' ? `⚠️ ${t('patientMap.doctorUnavailable')}` : `⚠️ ${t('patientMap.noSlotsAvailable')}`}
                        </Text>
                      </View>
                    )}

                    {/* Rate & Review */}
                    <TouchableOpacity
                      style={styles.rateBtn}
                      onPress={openRatingModal}
                    >
                      <Text style={styles.rateBtnText}>⭐ {t('patientMap.rateReview')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Booking modal ── */}
      <Modal visible={bookingVisible} transparent animationType="slide" onRequestClose={() => setBookingVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('patientMap.bookAppointmentTitle')}</Text>
            <Text style={styles.modalSub}>Dr. {selectedDoctor?.fullName} · {selectedDoctor?.cabinetName}</Text>

            <View style={styles.bookingProfileBox}>
              <Text style={styles.bookingProfileTitle}>{t('patientMap.bookingProfile')}</Text>
              <Text style={styles.bookingProfileText}>{t('patientMap.nameLabel')} {patientProfile?.fullName || '—'}</Text>
              <Text style={styles.bookingProfileText}>{t('patientMap.ageLabel')} {patientProfile?.age || '—'}</Text>
              <View style={styles.bookingForSwitchRow}>
                <TouchableOpacity
                  style={[styles.bookingForBtn, !bookForRelative && styles.bookingForBtnActive]}
                  onPress={() => setBookForRelative(false)}
                >
                  <Text style={[styles.bookingForBtnText, !bookForRelative && styles.bookingForBtnTextActive]}>{t('patientMap.forMe')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bookingForBtn, bookForRelative && styles.bookingForBtnActive]}
                  onPress={() => setBookForRelative(true)}
                >
                  <Text style={[styles.bookingForBtnText, bookForRelative && styles.bookingForBtnTextActive]}>{t('patientMap.forRelative')}</Text>
                </TouchableOpacity>
              </View>
              {bookForRelative && (
                <>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Relative name"
                    value={bookingRelativeName}
                    onChangeText={setBookingRelativeName}
                  />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Relationship (mother, child...)"
                    value={bookingRelativeRelation}
                    onChangeText={setBookingRelativeRelation}
                  />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Relative age"
                    value={bookingRelativeAge}
                    onChangeText={setBookingRelativeAge}
                    keyboardType="number-pad"
                  />
                </>
              )}
            </View>

            <Text style={styles.modalLabel}>{t('patientMap.preferredTime')}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('patientMap.timePlaceholder')}
              value={bookingTime}
              onChangeText={setBookingTime}
            />

            <Text style={styles.modalLabel}>{t('patientMap.noteOptional')}</Text>
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder={t('patientMap.notePlaceholder')}
              value={bookingNote}
              onChangeText={setBookingNote}
              multiline
            />

            {selectedDoctor?.acceptMode === 'auto' ? (
              <View style={styles.autoAcceptBadge}>
                <Text style={styles.autoAcceptText}>⚡ {t('patientMap.autoConfirm')}</Text>
              </View>
            ) : (
              <View style={styles.manualBadge}>
                <Text style={styles.manualText}>✋ {t('patientMap.needsApproval')}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.modalBtn} onPress={handleBook} disabled={bookingLoading}>
              {bookingLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalBtnText}>{t('patientMap.confirmBooking')}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setBookingVisible(false)}>
              <Text style={styles.modalCancelText}>{i18n.t('common:cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Rating modal ── */}
      <Modal visible={ratingVisible} transparent animationType="slide" onRequestClose={() => setRatingVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>{t('patientMap.rateTitle')}</Text>
              <Text style={styles.modalSub}>Dr. {selectedDoctor?.fullName}</Text>

              <StarPicker value={ratingStars} onChange={setRatingStars} label={t('patientMap.rateOverall')} />
              <StarPicker value={ratingWait} onChange={setRatingWait} label={t('patientMap.rateWait')} />
              <StarPicker value={ratingAttitude} onChange={setRatingAttitude} label={t('patientMap.rateAttitude')} />
              <StarPicker value={ratingCleanliness} onChange={setRatingCleanliness} label={t('patientMap.rateCleanliness')} />

              <Text style={styles.modalLabel}>{t('patientMap.rateCommentLabel')}</Text>
              <TextInput
                style={[styles.modalInput, { height: 100 }]}
                placeholder={t('patientMap.rateCommentPlaceholder')}
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
              />

              <TouchableOpacity style={styles.modalBtn} onPress={handleRating}>
                <Text style={styles.modalBtnText}>{t('patientMap.submitReview')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRatingVisible(false)}>
                <Text style={styles.modalCancelText}>{i18n.t('common:cancel')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Suggestion modal ── */}
      <Modal visible={suggestionVisible} transparent animationType="slide" onRequestClose={() => setSuggestionVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('patientMap.suggestionTitle')}</Text>
            <Text style={styles.modalSub}>{t('patientMap.suggestionSubtitle')}</Text>
            <TextInput
              style={[styles.modalInput, { height: 110 }]}
              multiline
              placeholder={t('patientMap.suggestionPlaceholder')}
              value={suggestionText}
              onChangeText={setSuggestionText}
            />
            <TouchableOpacity style={styles.modalBtn} onPress={submitSuggestion} disabled={suggestionLoading}>
              {suggestionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>{t('patientMap.sendSuggestion')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSuggestionVisible(false)}>
              <Text style={styles.modalCancelText}>{i18n.t('common:cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', paddingTop: 50 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },

  // Search
  searchContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  searchClear: { fontSize: 14, color: '#9ca3af', paddingLeft: 8 },

  // Filters
  filterWrapper: { marginBottom: 4 },
  filterBar: { paddingHorizontal: 16, gap: 8 },
  filterChip: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  filterChipActive: { backgroundColor: '#16a34a' },
  filterChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },

  // Count row
  countRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, gap: 10 },
  countText: { fontSize: 13, fontWeight: '600', color: '#6b7280', flex: 1 },

  // Doctor list
  listContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },

  // Doctor list card
  doctorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  doctorCardPhoto: { width: 64, height: 64, borderRadius: 12 },
  doctorCardPhotoPlaceholder: { backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' },
  doctorCardInfo: { flex: 1, marginLeft: 12 },
  doctorCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doctorCardName: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1, marginRight: 6 },
  doctorCardRating: { fontSize: 12, fontWeight: '700', color: '#b45309' },
  doctorCardSpecialty: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  doctorCardDistance: { fontSize: 12, color: '#059669', marginTop: 2, fontWeight: '600' },
  doctorCardStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  doctorCardStatusDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  doctorCardStatusLabel: { fontSize: 11, fontWeight: '600' },
  doctorCardCost: { fontSize: 11, color: '#6b7280' },
  doctorCardChevron: { fontSize: 24, color: '#d1d5db', marginLeft: 8 },

  profileBtn: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    elevation: 6,
  },
  profileBtnText: { fontSize: 16 },
  suggestionBtn: {
    position: 'absolute',
    bottom: 30,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    elevation: 6,
  },
  suggestionBtnText: { fontSize: 16 },

  // Back button (inline in count row)
  backBtn: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },

  // Doctor card bottom sheet
  cardOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  cardSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, maxHeight: '85%' },
  dragHandle: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  cardHeader: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  cardPhoto: { width: 80, height: 80, borderRadius: 16 },
  cardInfo: { flex: 1 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  cardRatingBadge: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 },
  cardRatingText: { color: '#b45309', fontSize: 12, fontWeight: '700' },
  cardNameAr: { fontSize: 14, color: '#374151', textAlign: 'right', marginTop: 2 },
  cardSpecialty: { fontSize: 14, color: '#6b7280', marginTop: 3 },
  cardCabinet: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  cardDistance: { fontSize: 12, color: '#059669', marginTop: 4, fontWeight: '600' },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cardStatusDot: { width: 8, height: 8, borderRadius: 4 },
  cardStatusText: { fontSize: 13, fontWeight: '600' },
  cardStats: { flexDirection: 'row', backgroundColor: '#f9fafb', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardStatLabel: { fontSize: 11, color: '#9ca3af', marginTop: 3 },
  cardStatDivider: { width: 1, backgroundColor: '#e5e7eb' },
  cardEquipment: { fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 20 },
  cardPhotosRow: { marginBottom: 16 },
  cardPhotoThumbWrap: { marginRight: 10 },
  cardPhotoThumb: { width: 120, height: 80, borderRadius: 12 },
  cardPhotoThumbLabel: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 },
  cardActions: { gap: 10 },
  bookBtn: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bookBtnDisabled: { backgroundColor: '#f3f4f6', padding: 16, borderRadius: 14, alignItems: 'center' },
  bookBtnDisabledText: { color: '#9ca3af', fontWeight: '600', fontSize: 15 },
  rateBtn: { backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#16a34a', padding: 14, borderRadius: 14, alignItems: 'center' },
  rateBtnText: { color: '#16a34a', fontWeight: '700', fontSize: 15 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 44 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 4 },
  modalSub: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 10 },
  modalInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 4 },
  bookingProfileBox: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 8 },
  bookingProfileTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  bookingProfileText: { fontSize: 12, color: '#475569', marginBottom: 2 },
  bookingForSwitchRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8 },
  bookingForBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
  bookingForBtnActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  bookingForBtnText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  bookingForBtnTextActive: { color: '#fff' },
  autoAcceptBadge: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, marginVertical: 10 },
  autoAcceptText: { color: '#16a34a', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  manualBadge: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 10, marginVertical: 10 },
  manualText: { color: '#92400e', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  modalBtn: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalCancelBtn: { padding: 14, alignItems: 'center' },
  modalCancelText: { color: '#6b7280', fontSize: 15 },

  // Stars
  starRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  starLabel: { fontSize: 14, color: '#374151', fontWeight: '500', flex: 1 },
  stars: { flexDirection: 'row', gap: 4 },
  star: { fontSize: 28, color: '#e5e7eb' },
  starFilled: { color: '#f59e0b' },

  // Appointment banner
  apptBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16a34a', marginHorizontal: 16, marginBottom: 4, borderRadius: 16, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, overflow: 'hidden' },
  apptBannerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  apptBannerIcon: { fontSize: 22, marginRight: 10 },
  apptBannerInfo: { flex: 1 },
  apptBannerTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  apptBannerDate: { fontSize: 12, color: '#bbf7d0', marginTop: 2 },
  apptBannerNav: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.15)' },
  apptBannerNavText: { fontSize: 22 },

  // Card experience & details
  cardExperience: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  cardDetailsBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 },
  cardDetailItem: { fontSize: 13, color: '#374151' },
  cardEquipmentBox: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, marginBottom: 12 },
  cardEquipmentLabel: { fontSize: 11, fontWeight: '700', color: '#16a34a', marginBottom: 4, letterSpacing: 0.5 },

  // Reviews section
  reviewsSection: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 16, marginTop: 4, marginBottom: 8 },
  reviewsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reviewsTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  reviewsCount: { fontSize: 13, color: '#f59e0b', fontWeight: '600' },
  reviewsBars: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  reviewBarItem: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 8, padding: 8, alignItems: 'center' },
  reviewBarLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '600', marginBottom: 3 },
  reviewBarVal: { fontSize: 13, fontWeight: '700', color: '#f59e0b' },
  commentCard: { backgroundColor: '#fefce8', borderRadius: 10, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
  commentText: { fontSize: 13, color: '#374151', fontStyle: 'italic', lineHeight: 18 },
  commentDate: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  seeAllReviews: { fontSize: 13, color: '#6b7280', textAlign: 'center', paddingVertical: 6 },

  // Action sheet buttons
  directionsBtn: { backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#3b82f6', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 2 },
  directionsBtnText: { color: '#1d4ed8', fontWeight: '700', fontSize: 15 },
  onMyWayBtn: { backgroundColor: '#fff7ed', borderWidth: 1.5, borderColor: '#f97316', padding: 14, borderRadius: 14, alignItems: 'center' },
  onMyWayBtnText: { color: '#c2410c', fontWeight: '700', fontSize: 15 },
});
