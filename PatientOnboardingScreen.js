import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

export default function PatientOnboardingScreen({ navigation }) {
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
      Alert.alert('Missing Info', 'Please enter your full name');
      return;
    }
    if (!age.trim()) {
      Alert.alert('Missing Info', 'Please enter your age');
      return;
    }
    if (parseInt(age) < 13 || parseInt(age) > 120) {
      Alert.alert('Invalid Age', 'Please enter a valid age between 13 and 120');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      Alert.alert('Missing Info', 'Please provide either a phone number or email');
      return;
    }
    if (phone.trim() && !validateAlgerianPhone(phone)) {
      Alert.alert('Invalid Phone', 'Use Algerian format: 05xxxxxxxx');
      return;
    }
    if (email.trim() && !validateEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
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

      Alert.alert('✅ Success', 'Your profile is ready! Searching for doctors...');
      navigation.replace('PatientMap');
    } catch (error) {
      console.log("Save error:", error);
      Alert.alert('Error', 'Failed to save your information: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Setting up your profile...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerIcon}>👋</Text>
          <Text style={styles.headerTitle}>Welcome to Dawini!</Text>
          <Text style={styles.headerSubtitle}>Let's get to know you</Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '50%' }]} />
          </View>
          <Text style={styles.progressText}>Step 1 of 1</Text>
        </View>

        {/* Info Section */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            This information helps doctors provide better care and remember you
          </Text>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          
          {/* Full Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              <Text style={styles.required}>*</Text> Full Name
            </Text>
            <Text style={styles.hint}>How doctors will call you</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ahmed Ben Ali"
              value={fullName}
              onChangeText={setFullName}
              placeholderTextColor="#cbd5e1"
              editable={!saving}
            />
          </View>

          {/* Age */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              <Text style={styles.required}>*</Text> Age
            </Text>
            <Text style={styles.hint}>Help doctors understand your health needs</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 28"
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
              <Text style={styles.required}>*</Text> How should we reach you?
            </Text>
            <Text style={styles.contactHint}>Provide at least one contact method</Text>

            {/* Phone */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>📱 Phone Number</Text>
              <Text style={styles.hint}>Algerian format: 05xxxxxxxx</Text>
              <TextInput
                style={styles.input}
                placeholder="05XX XXX XXX"
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
              <Text style={styles.label}>📧 Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
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
            <Text style={styles.contactTitle}>👨‍👩‍👧 Relative Information (Optional)</Text>
            <Text style={styles.contactHint}>Save this if you often book for someone else</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Relative Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Mother / Father name"
                value={relativeName}
                onChangeText={setRelativeName}
                placeholderTextColor="#cbd5e1"
                editable={!saving}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Relationship</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Mother, Father, Child"
                value={relativeRelation}
                onChangeText={setRelativeRelation}
                placeholderTextColor="#cbd5e1"
                editable={!saving}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Relative Age</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 62"
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
              Your information is secure and only shared with doctors you book appointments with
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
              <Text style={styles.buttonText}>Continue to Search</Text>
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
