import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

const TERMS_VERSION = '1.0';

export default function TermsAcceptanceScreen({ navigation, route }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const { uid, nextScreen, nextScreenParams } = route.params;
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToMedical, setAgreedToMedical] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        termsAccepted: true,
        termsAcceptedAt: serverTimestamp(),
        termsVersion: TERMS_VERSION,
      });
      navigation.replace(nextScreen, nextScreenParams || {});
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to save your acceptance. Please check your connection and try again, or contact support@dawini.app if the problem persists.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    Alert.alert(
      'Decline Terms?',
      'You must accept the Terms & Conditions to use Dawini. Declining will prevent you from accessing the app.',
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Decline & Exit', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  const canAccept = agreedToTerms && agreedToMedical;

  return (
    <View style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <Text style={styles.header}>{t('terms.title')}</Text>
      <Text style={styles.subheader}>{t('terms.subtitle')}</Text>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.sectionText}>
          By accessing, downloading, or using the Dawini application ("App"), you agree to be
          bound by these Terms and Conditions. If you do not agree to any part of these terms,
          you may not use the App.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.sectionText}>
          Dawini is a healthcare appointment management platform that connects patients with
          licensed doctors, enables appointment booking and scheduling, and facilitates
          patient-doctor interactions and rating systems.
        </Text>

        <Text style={styles.sectionTitle}>3. User Eligibility</Text>
        <Text style={styles.sectionText}>
          You must be at least 18 years of age to use this App, or have parental/guardian
          consent if under 18. You represent and warrant that you have the legal capacity to
          enter into binding agreements in your jurisdiction.{'\n\n'}
          Users must provide accurate, complete, and up-to-date information during registration
          and are responsible for maintaining the confidentiality of their account credentials.
        </Text>

        <Text style={styles.sectionTitle}>4. User Responsibilities</Text>
        <Text style={styles.sectionText}>
          <Text style={styles.bold}>Patients: </Text>
          Must provide accurate medical history and health information, honor confirmed
          appointments or cancel with adequate notice, and not misuse the rating system.{'\n\n'}
          <Text style={styles.bold}>Doctors: </Text>
          Must be licensed and authorized to practice medicine in their jurisdiction, maintain
          professional standards and ethical obligations, and comply with applicable healthcare
          regulations and privacy laws.
        </Text>

        <Text style={styles.sectionTitle}>5. Appointment Booking &amp; Cancellation</Text>
        <Text style={styles.sectionText}>
          All appointment bookings are subject to doctor availability. Patients may cancel
          appointments with at least 24 hours' notice. Repeated no-shows may result in account
          restrictions or termination of access to the App.
        </Text>

        <Text style={styles.sectionTitle}>6. ⚠️ Medical Disclaimer</Text>
        <Text style={[styles.sectionText, styles.disclaimer]}>
          IMPORTANT: Dawini is NOT a substitute for professional medical diagnosis or
          treatment. The App is a booking and communication platform ONLY. Users should
          consult qualified healthcare professionals for medical advice. Dawini is not
          responsible for doctor qualifications, service quality, or medical outcomes.
          Doctors are independent professionals, not employees of Dawini.
        </Text>

        <Text style={styles.sectionTitle}>7. Limitation of Liability</Text>
        <Text style={styles.sectionText}>
          To the fullest extent permitted by law, Dawini shall not be liable for indirect,
          incidental, or consequential damages; medical complications or adverse health
          outcomes; appointment cancellations by doctors; data loss; or any damages exceeding
          the amount paid by the user for services.
        </Text>

        <Text style={styles.sectionTitle}>8. Prohibited Conduct</Text>
        <Text style={styles.sectionText}>
          Users agree NOT to: provide false or misleading information, access the App through
          unauthorized means, harass or abuse other users or healthcare providers, manipulate
          ratings or reviews, share login credentials, use the App for purposes other than
          legitimate healthcare appointment management, or violate any applicable laws.
        </Text>

        <Text style={styles.sectionTitle}>9. Privacy &amp; Confidentiality</Text>
        <Text style={styles.sectionText}>
          All personal and medical information is protected according to our Privacy Policy.
          Healthcare provider-patient relationships maintain professional confidentiality.
          Medical information is not shared with third parties without explicit consent.
          Appointment details are accessible only to relevant parties (patient, doctor, admin).
        </Text>

        <Text style={styles.sectionTitle}>10. Termination of Access</Text>
        <Text style={styles.sectionText}>
          Dawini may terminate or suspend user access if a user violates these Terms and
          Conditions, engages in fraudulent or illegal activity, repeatedly violates policies,
          or due to security concerns. Upon termination, users lose access to the App and
          associated features.
        </Text>

        <Text style={styles.version}>Version 1.0 — Effective April 26, 2026</Text>
      </ScrollView>

      <View style={styles.checkboxContainer}>
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setAgreedToTerms(!agreedToTerms)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
            {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>I agree to Dawini's Terms &amp; Conditions</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setAgreedToMedical(!agreedToMedical)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, agreedToMedical && styles.checkboxChecked]}>
            {agreedToMedical && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>I understand the medical disclaimer</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.declineButton}
          onPress={handleDecline}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.declineText}>{t('terms.declineBtn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.acceptButton, !canAccept && styles.acceptButtonDisabled]}
          onPress={handleAccept}
          disabled={!canAccept || loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptText}>{t('terms.acceptBtn')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: '#16a34a',
    paddingTop: 52,
    paddingHorizontal: 20,
  },
  subheader: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  scrollView: { flex: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  scrollContent: { padding: 20, paddingBottom: 32 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 18,
    marginBottom: 6,
  },
  sectionText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  bold: { fontWeight: '700' },
  disclaimer: {
    backgroundColor: '#fef3c7',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    padding: 12,
    borderRadius: 6,
    color: '#92400e',
  },
  version: {
    marginTop: 28,
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  checkboxContainer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#16a34a',
    borderRadius: 5,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#16a34a' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  checkboxLabel: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
    gap: 12,
  },
  declineButton: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#d1d5db',
  },
  declineText: { color: '#6b7280', fontWeight: '600', fontSize: 16 },
  acceptButton: {
    flex: 2,
    backgroundColor: '#16a34a',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonDisabled: { opacity: 0.4 },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
