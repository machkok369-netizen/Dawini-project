import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { routeAuthenticatedUser } from './authNavigation';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { language, setLanguage, isRTL } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleEmailLogin = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !password) {
      Alert.alert(t('login.errorEmptyFields'), t('login.errorEmptyFields'));
      return;
    }
    if (!emailRegex.test(email.trim())) {
      Alert.alert(t('login.errorInvalidEmail'), t('login.errorInvalidEmail'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('login.errorShortPassword'), t('login.errorShortPassword'));
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      const userData = userDoc.data();

      if (!userData) {
        Alert.alert(
          t('login.title'),
          t('login.errorUserNotFound', { defaultValue: 'User profile not found. Please register first.' })
        );
        return;
      }

      routeAuthenticatedUser(navigation, userCredential.user.uid, userData);
    } catch (error) {
      Alert.alert(t('login.title'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!googleConfigReady) {
      Alert.alert(
        t('login.googleTitle', { defaultValue: 'Google Sign-In' }),
        t('login.googleMissingConfig', { defaultValue: 'Google credentials are missing. Please configure Google client IDs.' })
      );
      return;
    }
    if (!request) {
      Alert.alert(
        t('login.googleTitle', { defaultValue: 'Google Sign-In' }),
        t('login.googleInitializing', { defaultValue: 'Google Sign-In is initializing, please try again.' })
      );
      return;
    }

    setLoading(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') {
        return;
      }

      const idToken = result.params?.id_token || result.authentication?.idToken;
      if (!idToken) {
        Alert.alert(
          t('login.googleTitle', { defaultValue: 'Google Sign-In' }),
          t('login.googleTokenMissing', { defaultValue: 'Google token was not returned. Please try again.' })
        );
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

      if (!userDoc.exists()) {
        navigation.replace('Register', {
          googleUser: {
            uid: userCredential.user.uid,
            email: userCredential.user.email || '',
          },
        });
        return;
      }

      routeAuthenticatedUser(navigation, userCredential.user.uid, userDoc.data());
    } catch (error) {
      Alert.alert(t('login.googleTitle', { defaultValue: 'Google Sign-In' }), error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.langPicker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>English</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, language === 'ar' && styles.langBtnActive]}
            onPress={() => setLanguage('ar')}
          >
            <Text style={[styles.langBtnText, language === 'ar' && styles.langBtnTextActive]}>عربي</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.logo}>{t('login.title')}</Text>
        <Text style={styles.tagline}>{t('login.subtitle')}</Text>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder={t('login.passwordPlaceholder')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleEmailLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.loginBtn')}</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.googleButton, (loading || !request) && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={loading || !request}
        >
          <Text style={styles.googleButtonText}>{t('login.continueWithGoogle', { defaultValue: 'Continue with Google' })}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.registerContainer} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>
            {t('login.noAccount')} <Text style={styles.registerLink}>{t('login.register')}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 42, fontWeight: '900', textAlign: 'center', marginBottom: 6, color: '#16a34a', letterSpacing: -1 },
  tagline: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginBottom: 40 },
  formContainer: { marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', padding: 15, borderRadius: 12, marginBottom: 14, fontSize: 16, backgroundColor: '#fafafa' },
  button: { backgroundColor: '#16a34a', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  googleButtonText: { color: '#111827', fontWeight: '700', fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  linkText: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 20 },
  registerContainer: { marginTop: 20 },
  registerLink: { fontWeight: '700', color: '#16a34a' },
  langPicker: {
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  langBtn: {
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  langBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  langBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  langBtnTextActive: {
    color: '#fff',
  },
});
