import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { routeAuthenticatedUser } from './authNavigation';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import i18n from '../i18n';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen({ navigation, route }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const incomingGoogleUser = route?.params?.googleUser;
  const [email, setEmail] = useState(incomingGoogleUser?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const googleConfigReady = useMemo(
    () => Boolean(
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    ),
    []
  );

  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const routeNewUserToOnboarding = (uid) => {
    if (role === 'patient') {
      navigation.replace('TermsAcceptance', {
        uid,
        nextScreen: 'PatientOnboarding',
      });
    } else {
      navigation.replace('TermsAcceptance', {
        uid,
        nextScreen: 'EditProfile',
        nextScreenParams: { isNewDoctor: true },
      });
    }
  };

  const validateRoleFields = () => {
    if (role === 'doctor' && !specialty.trim()) {
      Alert.alert(i18n.t('screens:register.title'), i18n.t('screens:register.errorFillFields'));
      return false;
    }
    return true;
  };

  const buildUserData = (user) => ({
    uid: user.uid,
    email: user.email,
    role,
    createdAt: new Date(),
    isVerified: role === 'patient',
    profileCompleted: false,
    patientProfileCompleted: false,
    termsAccepted: false,
  });

  const handleRegister = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !password) {
      Alert.alert(i18n.t('screens:register.title'), i18n.t('screens:register.errorFillFields'));
      return;
    }
    if (!emailRegex.test(email.trim())) {
      Alert.alert(i18n.t('screens:register.title'), i18n.t('screens:register.errorFillFields'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(i18n.t('screens:register.title'), i18n.t('screens:register.errorPasswordLength'));
      return;
    }
    if (!validateRoleFields()) {
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const userData = buildUserData(userCredential.user);

      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
      Alert.alert(i18n.t('screens:register.successTitle'), i18n.t('screens:register.successMsg'));
      routeNewUserToOnboarding(userCredential.user.uid);
    } catch (error) {
      Alert.alert(i18n.t('screens:register.title'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    if (!validateRoleFields()) {
      return;
    }
    if (!googleConfigReady) {
      Alert.alert(
        t('register.googleTitle', { defaultValue: 'Google Sign-In' }),
        t('register.googleMissingConfig', { defaultValue: 'Google credentials are missing. Please configure Google client IDs.' })
      );
      return;
    }
    if (!request && !incomingGoogleUser) {
      Alert.alert(
        t('register.googleTitle', { defaultValue: 'Google Sign-In' }),
        t('register.googleInitializing', { defaultValue: 'Google Sign-In is initializing, please try again.' })
      );
      return;
    }

    setLoading(true);

    try {
      let signedInUser = auth.currentUser;
      if (!signedInUser) {
        const result = await promptAsync();
        if (result.type !== 'success') {
          return;
        }

        const idToken = result.params?.id_token || result.authentication?.idToken;
        if (!idToken) {
          Alert.alert(
            t('register.googleTitle', { defaultValue: 'Google Sign-In' }),
            t('register.googleTokenMissing', { defaultValue: 'Google token was not returned. Please try again.' })
          );
          return;
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
        signedInUser = userCredential.user;
      }

      const userDocRef = doc(db, 'users', signedInUser.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        routeAuthenticatedUser(navigation, signedInUser.uid, userDoc.data());
        return;
      }

      await setDoc(userDocRef, buildUserData(signedInUser));
      Alert.alert(i18n.t('screens:register.successTitle'), i18n.t('screens:register.successMsg'));
      routeNewUserToOnboarding(signedInUser.uid);
    } catch (error) {
      Alert.alert(t('register.googleTitle', { defaultValue: 'Google Sign-In' }), error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('register.title')}</Text>

        <TextInput
          placeholder={t('register.emailPlaceholder')}
          style={styles.input}
          onChangeText={setEmail}
          value={email}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!incomingGoogleUser}
        />
        {!incomingGoogleUser && (
          <TextInput
            placeholder={t('register.passwordPlaceholder')}
            style={styles.input}
            secureTextEntry
            onChangeText={setPassword}
            value={password}
          />
        )}

        <Text style={styles.label}>{t('register.roleLabel')}</Text>
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleButton, role === 'patient' && styles.activeRole]}
            onPress={() => setRole('patient')}
          >
            <Text style={role === 'patient' ? styles.activeText : styles.roleText}>{t('register.rolePatient')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, role === 'doctor' && styles.activeRole]}
            onPress={() => setRole('doctor')}
          >
            <Text style={role === 'doctor' ? styles.activeText : styles.roleText}>{t('register.roleDoctor')}</Text>
          </TouchableOpacity>
        </View>

        {role === 'doctor' && (
          <View style={styles.doctorFieldsContainer}>
            <TextInput
              placeholder={t('register.specialtyPlaceholder', { defaultValue: 'Medical Specialty' })}
              style={styles.input}
              onChangeText={setSpecialty}
              value={specialty}
            />
            <TextInput
              placeholder={t('register.clinicPhonePlaceholder', { defaultValue: 'Clinic Phone Number' })}
              style={styles.input}
              onChangeText={setPhone}
              value={phone}
              keyboardType="phone-pad"
            />
          </View>
        )}

        {!incomingGoogleUser && (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('register.registerBtn')}</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.googleButton, (loading || (!request && !incomingGoogleUser)) && styles.buttonDisabled]}
          onPress={handleGoogleRegister}
          disabled={loading || (!request && !incomingGoogleUser)}
        >
          <Text style={styles.googleButtonText}>
            {incomingGoogleUser
              ? t('register.completeGoogleRegistration', { defaultValue: 'Complete Google Registration' })
              : t('register.continueWithGoogle', { defaultValue: 'Continue with Google' })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>{t('register.haveAccount')} <Text style={{ fontWeight: 'bold' }}>{t('register.loginLink')}</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#2ecc71' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 12, marginBottom: 15, fontSize: 16 },
  label: { fontSize: 16, marginBottom: 10, fontWeight: 'bold', color: '#333' },
  roleContainer: { flexDirection: 'row', marginBottom: 25, gap: 10 },
  roleButton: { flex: 1, padding: 12, borderWidth: 2, borderColor: '#2ecc71', borderRadius: 12, alignItems: 'center' },
  activeRole: { backgroundColor: '#2ecc71' },
  roleText: { color: '#2ecc71', fontWeight: 'bold' },
  activeText: { color: '#fff', fontWeight: 'bold' },
  button: { backgroundColor: '#2ecc71', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  googleButtonText: { color: '#111827', fontWeight: '700', fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  linkText: { textAlign: 'center', marginTop: 20, color: '#2ecc71', fontSize: 16 },
  doctorFieldsContainer: { width: '100%', marginTop: 10 },
});
