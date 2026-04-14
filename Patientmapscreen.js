import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Modal, Image, Alert, ActivityIndicator, FlatList, Linking
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  collection, query, where, getDocs, addDoc,
  serverTimestamp, doc, getDoc, updateDoc, increment,
  onSnapshot, orderBy, limit
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

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

const REVIEW_CATEGORIES = [
  { label: 'Overall',     field: 'overall' },
  { label: 'Wait',        field: 'waitTime' },
  { label: 'Attitude',    field: 'attitude' },
  { label: 'Cleanliness', field: 'cleanliness' },
];

export default function PatientMapScreen({ navigation, route }) {
  const isDoctor = route?.params?.isDoctor || false;
  const userLocation = route?.params?.userLocation || null;

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

  // Upcoming appointment banner (A)
  const [upcomingAppointment, setUpcomingAppointment] = useState(null);

  // Doctor ratings (C)
  const [doctorRatings, setDoctorRatings] = useState([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  // Rating
  const [ratingVisible, setRatingVisible] = useState(false);
  const [ratingStars, setRatingStars]   = useState(0);
  const [ratingWait, setRatingWait]     = useState(0);
  const [ratingAttitude, setRatingAttitude] = useState(0);
  const [ratingCleanliness, setRatingCleanliness] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  const mapRef = useRef(null);

  // ── Get location & fetch doctors ─────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Ask user for context before triggering the OS permission dialog
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            '📍 Location Needed',
            'Dawini uses your location to show nearby doctors on the map. Your location is only used while the app is open and is never stored on our servers.',
            [{ text: 'OK' }]
          );
        } else {
          const loc = await Location.getCurrentPositionAsync({});
          setMyLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }

        // Fetch all doctors from users collection
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'doctor'), where('profileCompleted', '==', true)));
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDoctors(docs);
      } catch (e) {
        console.log('Map init error:', e);
        Alert.alert('Connection Error', 'Could not load doctor data. Please check your internet connection and restart the app.');
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
    }, (err) => { console.log('Appointment banner error:', err); setUpcomingAppointment(null); });
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
      setRatingsLoading(true);
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
          .sort((a, b) => b.createdAt - a.createdAt);
        setDoctorRatings(ratings);
      } catch (e) {
        console.log('Fetch ratings error:', e);
        setDoctorRatings([]);
      } finally {
        setRatingsLoading(false);
      }
    };
    fetchRatings();
  }, [selectedDoctor]);

  // ── Filtered doctors ──────────────────────────────────────────────────────────
  const filteredDoctors = useMemo(() => {
    return doctors.filter(d => {
      const matchSearch = !searchQuery.trim() ||
        normalizeText(d.fullName).includes(normalizeText(searchQuery)) ||
        normalizeText(d.specialty).includes(normalizeText(searchQuery)) ||
        normalizeText(d.cabinetName || '').includes(normalizeText(searchQuery));
      const matchFilter = selectedFilter === 'All' ||
        normalizeText(d.specialty).includes(normalizeText(selectedFilter));
      return matchSearch && matchFilter && d.location;
    });
  }, [doctors, searchQuery, selectedFilter]);

  // ── Handle pin tap ────────────────────────────────────────────────────────────
  const handlePinTap = (doctor) => {
    setSelectedDoctor(doctor);
    setCardVisible(true);
    mapRef.current?.animateToRegion({
      latitude: doctor.location.latitude - 0.008,
      longitude: doctor.location.longitude,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    }, 400);
  };

  // ── Book reservation ──────────────────────────────────────────────────────────
  const handleBook = async () => {
    if (!bookingTime.trim()) {
      Alert.alert('Missing', 'Please enter a preferred time.');
      return;
    }
    setBookingLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.data();
      const today = dateKey(new Date());
      const acceptMode = selectedDoctor.acceptMode || 'manual';

      // ✅ AUTO-FILLED FROM PATIENT ONBOARDING
      await addDoc(collection(db, 'reservations'), {
        doctorId: selectedDoctor.id,
        patientId: uid,
        doctorName: selectedDoctor.fullName || selectedDoctor.name || 'Doctor',
        doctorLocation: selectedDoctor.location || null,
        patientName: userData?.fullName || 'Patient', // ← Auto-filled
        patientPhone: userData?.phone || '', // ← Auto-filled
        patientAge: userData?.age || null, // ← New field
        date: new Date(),
        time: bookingTime,
        note: bookingNote,
        status: acceptMode === 'auto' ? 'confirmed' : 'pending',
        createdAt: serverTimestamp(),
      });

      // Increment booked count
      try {
        await updateDoc(doc(db, 'slots', `${selectedDoctor.id}_${today}`), {
          booked: increment(1)
        });
      } catch (e) {}

      Alert.alert(
        '✅ Booked!',
        acceptMode === 'auto'
          ? 'Your reservation is confirmed!'
          : 'Your request was sent. Waiting for doctor confirmation.'
      );
      setBookingVisible(false);
      setBookingTime('');
      setBookingNote('');
    } catch (e) {
      Alert.alert('Error', 'Could not complete booking. Try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  // ── Submit rating ─────────────────────────────────────────────────────────────
  const handleRating = async () => {
    if (ratingStars === 0) {
      Alert.alert('Missing', 'Please give at least an overall star rating.');
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
        createdAt: serverTimestamp(),
      });
      Alert.alert('Thank you!', 'Your review has been submitted.');
      setRatingVisible(false);
      setRatingStars(0); setRatingWait(0); setRatingAttitude(0);
      setRatingCleanliness(0); setRatingComment('');
    } catch (e) {
      Alert.alert('Error', 'Could not submit rating.');
    }
  };

  // ── Get directions via device maps app (B) ────────────────────────────────────
  const handleGetDirections = (doctor) => {
    if (!doctor?.location) { Alert.alert('Location unavailable', 'This doctor has no location set.'); return; }
    const { latitude, longitude } = doctor.location;
    const label = encodeURIComponent(`Dr. ${doctor.fullName}`);
    const url = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`;
    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web URL
      Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`);
    });
  };

  // ── On My Way: open directions + notify doctor (E) ───────────────────────────
  const handleOnMyWay = async (doctor) => {
    handleGetDirections(doctor);
    try {
      const uid = auth.currentUser?.uid;
      const userSnap = await getDoc(doc(db, 'users', uid));
      const patientName = userSnap.data()?.fullName || 'A patient';
      await addDoc(collection(db, 'notifications'), {
        userId: doctor.id,
        type: 'patient_on_way',
        title: '🚀 Patient On The Way',
        message: `${patientName} is heading to your clinic`,
        patientId: uid,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.log('On My Way notify error:', e);
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

  const initialRegion = myLocation
    ? { ...myLocation, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : { latitude: 36.365, longitude: 6.61, latitudeDelta: 0.15, longitudeDelta: 0.15 };

  if (loading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#16a34a" />
      <Text style={styles.loadingText}>Loading map...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ── Full screen map ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {filteredDoctors.map(doctor => (
          doctor.location ? (
            <Marker
              key={doctor.id}
              coordinate={doctor.location}
              onPress={() => handlePinTap(doctor)}
            >
              <View style={[styles.pin, { backgroundColor: STATUS_COLORS[doctor.status] || '#9ca3af' }]}>
                <Text style={styles.pinText}>{doctor.specialty?.charAt(0) || 'D'}</Text>
              </View>
            </Marker>
          ) : null
        ))}
      </MapView>

      {/* ── Search bar ── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search doctor, specialty, clinic..."
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

      {/* ── Back button for doctor mode ── */}
      {isDoctor && (
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      )}

      {/* ── Results count ── */}
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{filteredDoctors.length} clinics nearby</Text>
      </View>

      {/* ── Upcoming appointment banner (A) ── */}
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
              onPress={() => handleGetDirections({ location: upcomingAppointment.doctorLocation, fullName: upcomingAppointment.doctorName })}
            >
              <Text style={styles.apptBannerNavText}>🗺️</Text>
            </TouchableOpacity>
          )}
        </View>
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
                    <Text style={styles.cardName}>Dr. {selectedDoctor.fullName}</Text>
                    {selectedDoctor.fullNameAr ? <Text style={styles.cardNameAr}>{selectedDoctor.fullNameAr}</Text> : null}
                    <Text style={styles.cardSpecialty}>{selectedDoctor.specialty}</Text>
                    <Text style={styles.cardCabinet}>{selectedDoctor.cabinetName}</Text>
                    {selectedDoctor.experience ? (
                      <Text style={styles.cardExperience}>🎓 {selectedDoctor.experience} yrs experience</Text>
                    ) : null}
                    <View style={styles.cardStatusRow}>
                      <View style={[styles.cardStatusDot, { backgroundColor: STATUS_COLORS[selectedDoctor.status] || '#9ca3af' }]} />
                      <Text style={[styles.cardStatusText, { color: STATUS_COLORS[selectedDoctor.status] || '#9ca3af' }]}>
                        {selectedDoctor.status === 'in_office' ? 'In Office'
                          : selectedDoctor.status === 'brb' ? 'Be Right Back'
                          : selectedDoctor.status === 'away' ? 'Away'
                          : selectedDoctor.status === 'vacation' ? 'On Vacation'
                          : 'Offline'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Stats row */}
                <View style={styles.cardStats}>
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatValue}>{selectedDoctor.visitCost ? `${selectedDoctor.visitCost} DA` : '—'}</Text>
                    <Text style={styles.cardStatLabel}>Visit Cost</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatValue}>
                      {todaySlot ? `${todaySlot.available}/${todaySlot.max}` : '—'}
                    </Text>
                    <Text style={styles.cardStatLabel}>Slots Today</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatValue}>
                      {selectedDoctor.averageRating ? `${selectedDoctor.averageRating}★` : '—'}
                    </Text>
                    <Text style={styles.cardStatLabel}>Rating</Text>
                  </View>
                  <View style={styles.cardStatDivider} />
                  <View style={styles.cardStat}>
                    <Text style={styles.cardStatValue} numberOfLines={1}>{selectedDoctor.phone || '—'}</Text>
                    <Text style={styles.cardStatLabel}>Phone</Text>
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
                    <Text style={styles.cardEquipmentLabel}>🩺 Equipment & Services</Text>
                    <Text style={styles.cardEquipment}>{selectedDoctor.equipment}</Text>
                  </View>
                ) : null}

                {/* Entrance / Street photos */}
                {(selectedDoctor.photoEntrance || selectedDoctor.photoStreet) && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardPhotosRow}>
                    {selectedDoctor.photoEntrance && (
                      <View style={styles.cardPhotoThumbWrap}>
                        <Image source={{ uri: selectedDoctor.photoEntrance }} style={styles.cardPhotoThumb} />
                        <Text style={styles.cardPhotoThumbLabel}>Entrance</Text>
                      </View>
                    )}
                    {selectedDoctor.photoStreet && (
                      <View style={styles.cardPhotoThumbWrap}>
                        <Image source={{ uri: selectedDoctor.photoStreet }} style={styles.cardPhotoThumb} />
                        <Text style={styles.cardPhotoThumbLabel}>Street View</Text>
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
                        <Text style={styles.reviewsTitle}>Patient Reviews</Text>
                        <Text style={styles.reviewsCount}>⭐ {avg('overall')} · {doctorRatings.length} reviews</Text>
                      </View>
                      <View style={styles.reviewsBars}>
                        {REVIEW_CATEGORIES.map(({ label, field }) => (
                          <View key={field} style={styles.reviewBarItem}>
                            <Text style={styles.reviewBarLabel}>{label}</Text>
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
                        <Text style={styles.seeAllReviews}>+ {comments.length - 3} more reviews</Text>
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
                      onPress={() => handleGetDirections(selectedDoctor)}
                    >
                      <Text style={styles.directionsBtnText}>🗺️ Get Directions</Text>
                    </TouchableOpacity>

                    {/* Book appointment button */}
                    {selectedDoctor.status === 'in_office' && todaySlot?.available > 0 ? (
                      <TouchableOpacity
                        style={styles.bookBtn}
                        onPress={() => { setCardVisible(false); setBookingVisible(true); }}
                      >
                        <Text style={styles.bookBtnText}>📅 Book an Appointment</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.bookBtnDisabled}>
                        <Text style={styles.bookBtnDisabledText}>
                          {selectedDoctor.status !== 'in_office' ? '⚠️ Doctor not available right now' : '⚠️ No slots available today'}
                        </Text>
                      </View>
                    )}

                    {/* On My Way — notify doctor (E) */}
                    <TouchableOpacity
                      style={styles.onMyWayBtn}
                      onPress={() => { setCardVisible(false); handleOnMyWay(selectedDoctor); }}
                    >
                      <Text style={styles.onMyWayBtnText}>🚀 On My Way — Notify Doctor</Text>
                    </TouchableOpacity>

                    {/* Rate & Review */}
                    <TouchableOpacity
                      style={styles.rateBtn}
                      onPress={() => { setCardVisible(false); setRatingVisible(true); }}
                    >
                      <Text style={styles.rateBtnText}>⭐ Rate & Review</Text>
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
            <Text style={styles.modalTitle}>Book Appointment</Text>
            <Text style={styles.modalSub}>Dr. {selectedDoctor?.fullName} · {selectedDoctor?.cabinetName}</Text>

            <Text style={styles.modalLabel}>Preferred Time</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 10:30 AM"
              value={bookingTime}
              onChangeText={setBookingTime}
            />

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder="Describe your issue briefly..."
              value={bookingNote}
              onChangeText={setBookingNote}
              multiline
            />

            {selectedDoctor?.acceptMode === 'auto' ? (
              <View style={styles.autoAcceptBadge}>
                <Text style={styles.autoAcceptText}>⚡ This doctor auto-confirms bookings</Text>
              </View>
            ) : (
              <View style={styles.manualBadge}>
                <Text style={styles.manualText}>✋ Booking needs doctor approval</Text>
              </View>
            )}

            <TouchableOpacity style={styles.modalBtn} onPress={handleBook} disabled={bookingLoading}>
              {bookingLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalBtnText}>Confirm Booking</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setBookingVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Rating modal ── */}
      <Modal visible={ratingVisible} transparent animationType="slide" onRequestClose={() => setRatingVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Rate Your Visit</Text>
              <Text style={styles.modalSub}>Dr. {selectedDoctor?.fullName}</Text>

              <StarPicker value={ratingStars} onChange={setRatingStars} label="Overall Experience" />
              <StarPicker value={ratingWait} onChange={setRatingWait} label="Wait Time" />
              <StarPicker value={ratingAttitude} onChange={setRatingAttitude} label="Doctor Attitude" />
              <StarPicker value={ratingCleanliness} onChange={setRatingCleanliness} label="Clinic Cleanliness" />

              <Text style={styles.modalLabel}>Comment (optional)</Text>
              <TextInput
                style={[styles.modalInput, { height: 100 }]}
                placeholder="Share your experience..."
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
              />

              <TouchableOpacity style={styles.modalBtn} onPress={handleRating}>
                <Text style={styles.modalBtnText}>Submit Review</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRatingVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },

  // Search
  searchContainer: { position: 'absolute', top: 56, left: 16, right: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  searchClear: { fontSize: 14, color: '#9ca3af', paddingLeft: 8 },

  // Filters
  filterWrapper: { position: 'absolute', top: 118, left: 0, right: 0 },
  filterBar: { paddingHorizontal: 16, gap: 8 },
  filterChip: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  filterChipActive: { backgroundColor: '#16a34a' },
  filterChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },

  // Count badge
  countBadge: { position: 'absolute', bottom: 32, left: 16, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  countText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Back button
  backBtn: { 
    position: 'absolute', 
    top: 170,  // ✅ Moved below filters
    left: 16, 
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    elevation: 6,
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },

  // Pin
  pin: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: '#fff', elevation: 4 },
  pinText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Doctor card
  cardOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  cardSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, maxHeight: '85%' },
  dragHandle: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  cardHeader: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  cardPhoto: { width: 80, height: 80, borderRadius: 16 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  cardNameAr: { fontSize: 14, color: '#374151', textAlign: 'right', marginTop: 2 },
  cardSpecialty: { fontSize: 14, color: '#6b7280', marginTop: 3 },
  cardCabinet: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
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

  // Appointment banner (A)
  apptBanner: { position: 'absolute', bottom: 90, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#16a34a', borderRadius: 16, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, overflow: 'hidden' },
  apptBannerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  apptBannerIcon: { fontSize: 22, marginRight: 10 },
  apptBannerInfo: { flex: 1 },
  apptBannerTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  apptBannerDate: { fontSize: 12, color: '#bbf7d0', marginTop: 2 },
  apptBannerNav: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.15)' },
  apptBannerNavText: { fontSize: 22 },

  // Card experience & details (C)
  cardExperience: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  cardDetailsBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 },
  cardDetailItem: { fontSize: 13, color: '#374151' },
  cardEquipmentBox: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, marginBottom: 12 },
  cardEquipmentLabel: { fontSize: 11, fontWeight: '700', color: '#16a34a', marginBottom: 4, letterSpacing: 0.5 },

  // Reviews section (C)
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

  // Action sheet buttons (B + E)
  directionsBtn: { backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#3b82f6', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 2 },
  directionsBtnText: { color: '#1d4ed8', fontWeight: '700', fontSize: 15 },
  onMyWayBtn: { backgroundColor: '#fff7ed', borderWidth: 1.5, borderColor: '#f97316', padding: 14, borderRadius: 14, alignItems: 'center' },
  onMyWayBtnText: { color: '#c2410c', fontWeight: '700', fontSize: 15 },
});