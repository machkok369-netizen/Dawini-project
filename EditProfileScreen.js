import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebaseConfig';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

const SPECIALTIES = [
  'General Practitioner', 'Dentist', 'Cardiologist', 'Pediatrician',
  'Gynecologist', 'Ophthalmologist', 'Dermatologist', 'Orthopedist',
  'ENT (Ear, Nose, Throat)', 'Neurologist', 'Psychiatrist', 'Radiologist',
  'Urologist', 'Endocrinologist', 'Other',
];

const STATUS_OPTIONS = [
  { key: 'in_office', label: 'In Office', icon: '🏥', color: '#059669' },
  { key: 'brb', label: 'Be Right Back', icon: '⏱️', color: '#d97706' },
  { key: 'away', label: 'Away', icon: '🚪', color: '#dc2626' },
  { key: 'vacation', label: 'On Vacation', icon: '🏖️', color: '#2563eb' },
];

const uploadPhoto = async (uri, path) => {
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const blob = await response.blob();
    const uniquePath = path.replace('.jpg', `_${Date.now()}.jpg`);
    const storageRef = ref(storage, uniquePath);
    
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    
    return downloadURL;
  } catch (e) {
    console.log("Upload error:", e.message);
    Alert.alert(i18n.t('common:error'), i18n.t('screens:editProfile.uploadError'));
    return null;
  }
};

export default function EditProfileScreen({ navigation, route }) {
  const isNewDoctor = route?.params?.isNewDoctor || false;
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(isNewDoctor);

  const [doctorName, setDoctorName] = useState('');
  const [doctorNameAr, setDoctorNameAr] = useState('');
  const [cabinetName, setCabinetName] = useState('');
  const [cabinetNameAr, setCabinetNameAr] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [specialtyOther, setSpecialtyOther] = useState('');
  const [phone, setPhone] = useState('');
  const [visitCost, setVisitCost] = useState('');
  const [experience, setExperience] = useState('');
  const [equipment, setEquipment] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState({ latitude: 36.365, longitude: 6.61 });
  const [photoMain, setPhotoMain] = useState(null);
  const [photoEntrance, setPhotoEntrance] = useState(null);
  const [photoStreet, setPhotoStreet] = useState(null);
  const [status, setStatus] = useState('in_office');
  const [maxSlots, setMaxSlots] = useState('10');
  const [acceptMode, setAcceptMode] = useState('manual');
  const [daysLeft, setDaysLeft] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const [specialtyPickerVisible, setSpecialtyPickerVisible] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          setDoctorName(d.fullName || '');
          setDoctorNameAr(d.fullNameAr || '');
          setCabinetName(d.cabinetName || '');
          setCabinetNameAr(d.cabinetNameAr || '');
          setSpecialty(d.specialty || '');
          setPhone(d.phone || '');
          setVisitCost(d.visitCost?.toString() || '');
          setExperience(d.experience?.toString() || '');
          setEquipment(d.equipment || '');
          setBio(d.bio || '');
          if (d.location) setLocation(d.location);
          if (d.photoMain) setPhotoMain(d.photoMain);
          if (d.photoEntrance) setPhotoEntrance(d.photoEntrance);
          if (d.photoStreet) setPhotoStreet(d.photoStreet);
          if (d.status) setStatus(d.status);
          if (d.maxSlots) setMaxSlots(d.maxSlots.toString());
          if (d.acceptMode) setAcceptMode(d.acceptMode);
          if (d.profileCompleted) setIsFirstTime(false);
          if (d.subscriptionEnd) {
            const end = d.subscriptionEnd.toDate ? d.subscriptionEnd.toDate() : new Date(d.subscriptionEnd);
            const diff = Math.ceil((end - new Date()) / 86400000);
            setDaysLeft(diff > 0 ? diff : 0);
            setShowWarning(diff <= 5 && diff > 0);
          }
        }
        if (isNewDoctor) {
          let { status: gpsStatus } = await Location.requestForegroundPermissionsAsync();
          if (gpsStatus === 'granted') {
            let loc = await Location.getCurrentPositionAsync({});
            setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        }
      } catch (e) {
        console.log(e);
        Alert.alert(i18n.t('common:error'), i18n.t('screens:editProfile.loadError'));
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const pickImage = async (setter) => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled) setter(result.assets[0].uri);
    } catch (e) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:editProfile.imageError'));
    }
  };

  const validateAlgerianPhone = (p) => /^0[5-7]\d{8}$/.test(p.replace(/\s/g, ''));

  const getFinalSpecialty = () => specialty === 'Other' ? specialtyOther : specialty;

  const saveProfile = async () => {
    const finalSpecialty = getFinalSpecialty();
    if (!doctorName || !cabinetName || !finalSpecialty || !phone || !visitCost || !photoMain) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:editProfile.missingFields'));
      return;
    }
    if (!validateAlgerianPhone(phone)) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:editProfile.invalidPhone'));
      return;
    }

    setUploading(true);
    try {
      const uid = auth.currentUser.uid;
      const existingUserDoc = await getDoc(doc(db, "users", uid));
      const existingData = existingUserDoc.data() || {};

      const uploadedMain = photoMain ? await uploadPhoto(photoMain, `clinic_photos/${uid}/main.jpg`) : photoMain;
      const uploadedEntrance = photoEntrance ? await uploadPhoto(photoEntrance, `clinic_photos/${uid}/entrance.jpg`) : photoEntrance;
      const uploadedStreet = photoStreet ? await uploadPhoto(photoStreet, `clinic_photos/${uid}/street.jpg`) : photoStreet;

      let subscriptionData = {};
      if (!existingData.profileCompleted) {
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 40);
        subscriptionData = {
          subscriptionStart: startDate,
          subscriptionEnd: endDate,
          subscriptionActive: true,
        };
      }

      const updateData = {
        fullName: doctorName,
        fullNameAr: doctorNameAr,
        cabinetName,
        cabinetNameAr,
        specialty: finalSpecialty,
        phone,
        visitCost: parseInt(visitCost),
        experience: parseInt(experience) || 0,
        equipment,
        bio,
        location,
        profileCompleted: true,
        isVerified: existingData.isVerified || false,
        completedAt: new Date(),
        photoMain: uploadedMain || existingData.photoMain,
        photoEntrance: uploadedEntrance || existingData.photoEntrance,
        photoStreet: uploadedStreet || existingData.photoStreet,
        clinicPhotoUrl: uploadedMain || existingData.photoMain,
        status,
        maxSlots: parseInt(maxSlots) || 10,
        acceptMode,
        ...subscriptionData
      };

      await updateDoc(doc(db, "users", uid), updateData);

      if (!existingData.profileCompleted) {
        Alert.alert("✅", i18n.t('screens:editProfile.successNew'));
        navigation.replace('DoctorDashboard');
      } else {
        Alert.alert("✅", i18n.t('screens:editProfile.successUpdate'));
        navigation.goBack();
      }
    } catch (error) {
      console.log("Save error:", error);
      Alert.alert(i18n.t('common:error'), error.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>{t('editProfile.loading')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerGradient}>
            <Text style={styles.headerIcon}>🏥</Text>
            <Text style={styles.headerTitle}>{isNewDoctor ? t('editProfile.newDoctorTitle') : t('editProfile.existingTitle')}</Text>
            <Text style={styles.headerSubtitle}>{t('editProfile.newDoctorSubtitle')}</Text>
          </View>
        </View>

        {/* Subscription Warning */}
        {daysLeft !== null && (
          <View style={[styles.subscriptionBanner, showWarning && styles.subscriptionBannerWarning]}>
            <Text style={styles.subscriptionIcon}>{showWarning ? '⚠️' : '✅'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.subscriptionTitle}>
                {showWarning ? t('editProfile.subscriptionEndsIn', { n: daysLeft }) : t('editProfile.daysLeft', { n: daysLeft })}
              </Text>
              <Text style={styles.subscriptionText}>
                {showWarning ? t('editProfile.renewSoon') : t('editProfile.freeTrial')}
              </Text>
            </View>
          </View>
        )}

        {/* Main Photo Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📸 {t('editProfile.displayPhotoTitle')}</Text>
          <Text style={styles.sectionHint}>{t('editProfile.displayPhotoSub')}</Text>
          <TouchableOpacity style={styles.imagePicker} onPress={() => pickImage(setPhotoMain)}>
            {photoMain ? (
              <Image source={{ uri: photoMain }} style={styles.img} />
            ) : (
              <View style={styles.imgPlaceholderBox}>
                <Text style={styles.imgIcon}>📷</Text>
                <Text style={styles.imgPlaceholder}>{t('editProfile.tapToUpload')}</Text>
                <Text style={styles.imgHint}>{t('editProfile.photoRecommend')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Doctor Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👨‍⚕️ {t('editProfile.yourInfoTitle')}</Text>
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('editProfile.fullNameLabel')} <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[styles.input, !isFirstTime && styles.inputDisabled]}
              placeholder={t('editProfile.fullNamePlaceholder')}
              value={doctorName}
              onChangeText={setDoctorName}
              editable={isFirstTime}
              placeholderTextColor="#9ca3af"
            />
            {!isFirstTime && <Text style={styles.lockedText}>🔒 Locked after registration</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>الاسم الكامل (العربية)</Text>
            <TextInput
              style={[styles.input, !isFirstTime && styles.inputDisabled]}
              placeholder="د. أحمد بن علي"
              value={doctorNameAr}
              onChangeText={setDoctorNameAr}
              editable={isFirstTime}
              textAlign="right"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Experience (years)</Text>
              <TextInput
                style={styles.input}
                placeholder="15"
                keyboardType="numeric"
                value={experience}
                onChangeText={setExperience}
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Visit Cost (DA) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="3000"
                keyboardType="numeric"
                value={visitCost}
                onChangeText={setVisitCost}
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone Number <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="05XX XXX XXX"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={10}
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Clinic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏢 Clinic Information</Text>
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>Cabinet Name (English) <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[styles.input, !isFirstTime && styles.inputDisabled]}
              placeholder="Your Clinic Name"
              value={cabinetName}
              onChangeText={setCabinetName}
              editable={isFirstTime}
              placeholderTextColor="#9ca3af"
            />
            {!isFirstTime && <Text style={styles.lockedText}>🔒 Locked after registration</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>اسم العيادة (العربية)</Text>
            <TextInput
              style={[styles.input, !isFirstTime && styles.inputDisabled]}
              placeholder="اسم عيادتك"
              value={cabinetNameAr}
              onChangeText={setCabinetNameAr}
              editable={isFirstTime}
              textAlign="right"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Medical Specialty <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity 
              style={styles.pickerBtn} 
              onPress={() => setSpecialtyPickerVisible(true)}
            >
              <Text style={[styles.pickerBtnText, !specialty && { color: '#9ca3af' }]}>
                {specialty || 'Select your specialty...'}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {specialty === 'Other' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Specify Your Specialty <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sports Medicine"
                value={specialtyOther}
                onChangeText={setSpecialtyOther}
                placeholderTextColor="#9ca3af"
              />
            </View>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Equipment & Facilities</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder="Ultrasound, X-ray, Laser, etc..."
              multiline
              value={equipment}
              onChangeText={setEquipment}
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Bio / About Your Practice</Text>
            <TextInput
              style={[styles.input, { height: 100 }]}
              placeholder="Tell patients about your experience and approach..."
              multiline
              value={bio}
              onChangeText={setBio}
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Additional Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📸 Additional Photos</Text>
          <Text style={styles.sectionHint}>Help patients find your clinic</Text>

          <TouchableOpacity style={styles.photoCard} onPress={() => pickImage(setPhotoEntrance)}>
            {photoEntrance ? (
              <Image source={{ uri: photoEntrance }} style={styles.photoCardImg} />
            ) : (
              <View style={styles.photoCardEmpty}>
                <Text style={styles.photoCardIcon}>🚪</Text>
                <Text style={styles.photoCardText}>Entrance</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.photoCard} onPress={() => pickImage(setPhotoStreet)}>
            {photoStreet ? (
              <Image source={{ uri: photoStreet }} style={styles.photoCardImg} />
            ) : (
              <View style={styles.photoCardEmpty}>
                <Text style={styles.photoCardIcon}>🗺️</Text>
                <Text style={styles.photoCardText}>Street View</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Status Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🟢 Current Status</Text>
          <Text style={styles.sectionHint}>Patients see this in real-time</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.statusBtn, status === opt.key && { ...styles.statusBtnActive, borderColor: opt.color }]}
                onPress={() => setStatus(opt.key)}
              >
                <Text style={styles.statusIcon}>{opt.icon}</Text>
                <Text style={[styles.statusBtnText, status === opt.key && { color: opt.color, fontWeight: '700' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Reservation Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Reservation Settings</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Max Daily Appointments</Text>
            <TextInput
              style={styles.input}
              placeholder="10"
              keyboardType="numeric"
              value={maxSlots}
              onChangeText={setMaxSlots}
              maxLength={3}
              placeholderTextColor="#9ca3af"
            />
          </View>

          <Text style={styles.label}>Approval Mode</Text>
          <View style={styles.row}>
            <TouchableOpacity 
              style={[styles.modeBtn, acceptMode === 'auto' && styles.modeBtnActive]}
              onPress={() => setAcceptMode('auto')}
            >
              <Text style={styles.modeIcon}>⚡</Text>
              <Text style={[styles.modeBtnText, acceptMode === 'auto' && { color: '#059669', fontWeight: '700' }]}>
                Auto Accept
              </Text>
              <Text style={styles.modeSubtext}>Instant confirmation</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.modeBtn, acceptMode === 'manual' && styles.modeBtnActive]}
              onPress={() => setAcceptMode('manual')}
            >
              <Text style={styles.modeIcon}>✋</Text>
              <Text style={[styles.modeBtnText, acceptMode === 'manual' && { color: '#2563eb', fontWeight: '700' }]}>
                Manual
              </Text>
              <Text style={styles.modeSubtext}>You approve each one</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Clinic Location</Text>
          <Text style={styles.sectionHint}>Tap on map to set exact location</Text>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            onPress={(e) => setLocation(e.nativeEvent.coordinate)}
          >
            <Marker coordinate={location} title="Your Clinic" />
          </MapView>
        </View>

        {/* Save Button */}
        <TouchableOpacity 
          style={[styles.saveBtn, uploading && styles.saveBtnDisabled]}
          onPress={saveProfile}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.saveBtnIcon}>💾</Text>
              <Text style={styles.saveBtnText}>
                {isNewDoctor ? 'Complete Registration' : 'Save Profile'}
              </Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* Specialty Modal */}
      <Modal visible={specialtyPickerVisible} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Specialty</Text>
              <TouchableOpacity onPress={() => setSpecialtyPickerVisible(false)}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {SPECIALTIES.map((spec, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.pickerOption, specialty === spec && styles.pickerOptionActive]}
                  onPress={() => {
                    setSpecialty(spec);
                    setSpecialtyPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerOptionText, specialty === spec && styles.pickerOptionTextActive]}>
                    {spec}
                  </Text>
                  {specialty === spec && <Text style={styles.pickerCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
  },

  // Header
  header: {
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerGradient: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },

  // Subscription Banner
  subscriptionBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#86efac',
  },
  subscriptionBannerWarning: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  subscriptionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  subscriptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803d',
  },
  subscriptionBannerWarning: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  subscriptionText: {
    fontSize: 12,
    color: '#059669',
    marginTop: 2,
  },

  // Sections
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 14,
    fontWeight: '500',
  },

  // Form
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 7,
    letterSpacing: 0.3,
  },
  required: {
    color: '#dc2626',
    fontWeight: '800',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontWeight: '500',
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
  },
  lockedText: {
    fontSize: 11,
    color: '#dc2626',
    marginTop: 5,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },

  // Image Picker
  imagePicker: {
    height: 180,
    backgroundColor: '#f0f4f8',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imgPlaceholderBox: {
    alignItems: 'center',
  },
  imgIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  imgPlaceholder: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  imgHint: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },

  // Photo Cards
  photoCard: {
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  photoCardImg: {
    width: '100%',
    height: '100%',
  },
  photoCardEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCardIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  photoCardText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },

  // Picker
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 13,
    backgroundColor: '#f8fafc',
  },
  pickerBtnText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  pickerArrow: {
    fontSize: 12,
    color: '#94a3b8',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  pickerClose: {
    fontSize: 20,
    color: '#94a3b8',
    fontWeight: '600',
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerOptionActive: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
  },
  pickerOptionText: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
  },
  pickerOptionTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  pickerCheck: {
    fontSize: 16,
    color: '#059669',
    fontWeight: '700',
  },

  // Status Grid
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  statusBtn: {
    flex: 1,
    minWidth: '48%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
  },
  statusBtnActive: {
    backgroundColor: '#f0fdf4',
  },
  statusIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  statusBtnText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
  },

  // Mode Buttons
  modeBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  modeBtnActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#059669',
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  modeBtnText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  modeSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 3,
    fontWeight: '500',
  },

  // Map
  map: {
    height: 240,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  // Buttons
  saveBtn: {
    marginHorizontal: 16,
    marginBottom: 24,
    marginTop: 8,
    backgroundColor: '#059669',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnIcon: {
    fontSize: 18,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});