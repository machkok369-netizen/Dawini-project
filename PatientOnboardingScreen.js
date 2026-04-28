import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

export default function PatientOnboardingScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relativeName, setRelativeName] = useState('');
  const [relativeRelation, setRelativeRelation] = useState('');
  const [relativeAge, setRelativeAge] = useState('');

  useEffect(() => {
    const initialize = async () => {
      try {
        // Check if patient already completed onboarding
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          
          // If profile is already completed, go straight to PatientMap
          if (data.patientProfileCompleted) {
            navigation.replace('PatientMap');
            return;
          }
          
          // Pre-fill email from auth
          if (auth.currentUser.email) {
            setEmail(auth.currentUser.email);
          }
        }
      } catch (e) {
        console.log("Initialization error:", e);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateAlgerianPhone = (phone) => {
    return /^0[5-7]\d{8}$/.test(phone.replace(/\s/g, ''));
  };

  const handleContinue = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert(i18n.t('screens:onboarding.missingName'), i18n.t('screens:onboarding.missingName'));
      return;
    }
    if (!age.trim()) {
      Alert.alert(i18n.t('screens:onboarding.missingAge'), i18n.t('screens:onboarding.missingAge'));
      return;
    }
    if (parseInt(age) < 13 || parseInt(age) > 120) {
      Alert.alert(i18n.t('screens:onboarding.invalidAge'), i18n.t('screens:onboarding.invalidAge'));
      return;
    }
    if (!phone.trim() && !email.trim()) {
      Alert.alert(i18n.t('screens:onboarding.missingContact'), i18n.t('screens:onboarding.missingContact'));
      return;
    }
    if (phone.trim() && !validateAlgerianPhone(phone)) {
      Alert.alert(i18n.t('screens:onboarding.invalidPhone'), i18n.t('screens:onboarding.invalidPhone'));
      return;
    }
    if (email.trim() && !validateEmail(email)) {
      Alert.alert(i18n.t('screens:onboarding.invalidEmail'), i18n.t('screens:onboarding.invalidEmail'));
      return;
    }

    setSaving(true);
    try {
      const uid = auth.currentUser.uid;
      
      await updateDoc(doc(db, "users", uid), {
        fullName,
        age: parseInt(age),
        phone: phone.trim(),
        email: email.trim() || auth.currentUser.email,
        relativeProfile: {
          name: relativeName.trim(),
          relation: relativeRelation.trim(),
          age: relativeAge.trim() ? parseInt(relativeAge, 10) : null,
        },
        patientProfileCompleted: true,
        role: 'patient',
        isVerified: true,
        completedPatientOnboarding: new Date(),
      });

      Alert.alert(i18n.t('screens:onboarding.successTitle'), i18n.t('screens:onboarding.successMsg'));
      navigation.replace('PatientMap');
    } catch (error) {
      console.log("Save error:", error);
      Alert.alert(i18n.t('screens:onboarding.saveError'), i18n.t('screens:onboarding.saveError') + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>{t('onboarding.loadingText')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerIcon}>👋</Text>
          <Text style={styles.headerTitle}>{t('onboarding.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('onboarding.subtitle')}</Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '50%' }]} />
          </View>
          <Text style={styles.progressText}>{t('onboarding.step')}</Text>
        </View>

        {/* Info Section */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            {t('onboarding.infoText')}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          
          {/* Full Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              <Text style={styles.required}>*</Text> {t('onboarding.fullNameLabel')}
            </Text>
            <Text style={styles.hint}>{t('onboarding.fullNameHint')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('onboarding.fullNamePlaceholder')}
              value={fullName}
              onChangeText={setFullName}
              placeholderTextColor="#cbd5e1"
              editable={!saving}
            />
          </View>

          {/* Age */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              <Text style={styles.required}>*</Text> {t('onboarding.ageLabel')}
            </Text>
            <Text style={styles.hint}>{t('onboarding.ageHint')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('onboarding.agePlaceholder')}
              keyboardType="number-pad"
              value={age}
              onChangeText={setAge}
              placeholderTextColor="#cbd5e1"
              maxLength={3}
              editable={!saving}
            />
          </View>

          {/* Contact Info Section */}
          <View style={styles.contactSection}>
            <Text style={styles.contactTitle}>
              <Text style={styles.required}>*</Text> {t('onboarding.contactTitle')}
            </Text>
            <Text style={styles.contactHint}>{t('onboarding.contactHint')}</Text>

            {/* Phone */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>📱 {t('onboarding.phoneLabel')}</Text>
              <Text style={styles.hint}>{t('onboarding.phoneHint')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.phonePlaceholder')}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                placeholderTextColor="#cbd5e1"
                maxLength={10}
                editable={!saving}
              />
            </View>

            {/* Email */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>📧 {t('onboarding.emailLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.emailPlaceholder')}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholderTextColor="#cbd5e1"
                autoCapitalize="none"
                editable={!saving}
              />
            </View>
          </View>

          {/* Relative Info Section */}
          <View style={styles.contactSection}>
            <Text style={styles.contactTitle}>👨‍👩‍👧 {t('onboarding.relativeTitle')}</Text>
            <Text style={styles.contactHint}>{t('onboarding.relativeHint')}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('onboarding.relativeNameLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.relativeNamePlaceholder')}
                value={relativeName}
                onChangeText={setRelativeName}
                placeholderTextColor="#cbd5e1"
                editable={!saving}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('onboarding.relativeRelationLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.relativeRelationPlaceholder')}
                value={relativeRelation}
                onChangeText={setRelativeRelation}
                placeholderTextColor="#cbd5e1"
                editable={!saving}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('onboarding.relativeAgeLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('onboarding.relativeAgePlaceholder')}
                keyboardType="number-pad"
                value={relativeAge}
                onChangeText={setRelativeAge}
                maxLength={3}
                placeholderTextColor="#cbd5e1"
                editable={!saving}
              />
            </View>
          </View>

          {/* Privacy Note */}
          <View style={styles.privacyBox}>
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>
              {t('onboarding.privacyText')}
            </Text>
          </View>

        </View>

        {/* Button */}
        <TouchableOpacity 
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.buttonText}>{t('onboarding.continueBtn')}</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  headerIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 6,
    fontWeight: '500',
  },

  // Progress
  progressContainer: {
    marginBottom: 28,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#059669',
  },
  progressText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'right',
  },

  // Info Box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    fontWeight: '500',
    lineHeight: 19,
  },

  // Form
  formContainer: {
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  required: {
    color: '#dc2626',
    fontWeight: '800',
  },
  hint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#0f172a',
    fontWeight: '500',
  },

  // Contact Section
  contactSection: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  contactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 4,
  },
  contactHint: {
    fontSize: 12,
    color: '#4d7c0f',
    marginBottom: 14,
    fontWeight: '500',
  },

  // Privacy Box
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fde047',
  },
  privacyIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 2,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
    lineHeight: 18,
  },

  // Button
  button: {
    backgroundColor: '#059669',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
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
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonArrow: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
});
