import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeContext';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Animated, Easing,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AntDesign } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';

WebBrowser.maybeCompleteAuthSession();

// Animated SVG path — standard approach
const AnimatedPath = Animated.createAnimatedComponent(Path);

const DASH_LEN = 1050;
const OVAL_PATH =
  'M 322 26 C 440 65, 368 112, 200 115 C 75 115, 16 95, 16 60 C 16 25, 98 8, 200 8 C 302 8, 344 46, 344 46';

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { language, setLanguage, isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  // Animation values
  const strokeProgress  = useRef(new Animated.Value(0)).current;
  const titleOpacity    = useRef(new Animated.Value(0)).current;
  const titleY          = useRef(new Animated.Value(18)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  const strokeDashoffset = strokeProgress.interpolate({
    inputRange:  [0, 1],
    outputRange: [DASH_LEN, 0],
  });

  useEffect(() => {
    // 1. Draw oval
    Animated.timing(strokeProgress, {
      toValue: 1, duration: 1800, delay: 150,
      easing: Easing.bezier(0.43, 0.13, 0.23, 0.96),
      useNativeDriver: false,
    }).start();

    // 2. Title fade+slide
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 700, delay: 520, useNativeDriver: true }),
      Animated.timing(titleY,       { toValue: 0, duration: 700, delay: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // 3. Subtitle
    Animated.timing(subtitleOpacity, { toValue: 1, duration: 600, delay: 1100, useNativeDriver: true }).start();
  }, []);

  const googleConfigReady = useMemo(
    () => Boolean(
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    ),
    []
  );

  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const handleEmailLogin = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !password) { Alert.alert(t('login.title'), t('login.errorEmptyFields')); return; }
    if (!emailRegex.test(email.trim())) { Alert.alert(t('login.title'), t('login.errorInvalidEmail')); return; }
    if (password.length < 6) { Alert.alert(t('login.title'), t('login.errorShortPassword')); return; }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const userDoc  = await getDoc(doc(db, 'users', userCredential.user.uid));
      const userData = userDoc.data();
      if (!userData) { Alert.alert(t('login.title'), t('login.errorUserNotFound', { defaultValue: 'User profile not found.' })); return; }

      if (userData.role === 'doctor') {
        if (userData.status === 'suspended') { Alert.alert(t('login.title'), t('login.doctorSuspended')); return; }
        if (!userData.isVerified && userData.profileCompleted) { Alert.alert(t('login.title'), t('login.doctorNotVerified')); return; }
      }

      let nextScreen, nextScreenParams;
      if (userData.role === 'doctor') {
        nextScreen = userData.profileCompleted ? 'DoctorDashboard' : 'EditProfile';
        if (!userData.profileCompleted) nextScreenParams = { isNewDoctor: true };
      } else {
        nextScreen = userData.patientProfileCompleted ? 'PatientMap' : 'PatientOnboarding';
      }

      await AsyncStorage.setItem('userRole', userData.role);

      if (!userData.termsAccepted) {
        navigation.replace('TermsAcceptance', { uid: userCredential.user.uid, nextScreen, nextScreenParams });
        return;
      }
      navigation.replace(nextScreen, nextScreenParams || {});
    } catch (error) {
      Alert.alert(t('login.title'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!googleConfigReady) { Alert.alert(t('login.googleTitle', { defaultValue: 'Google Sign-In' }), t('login.googleMissingConfig', { defaultValue: 'Google credentials are missing.' })); return; }
    if (!request)           { Alert.alert(t('login.googleTitle', { defaultValue: 'Google Sign-In' }), t('login.googleInitializing', { defaultValue: 'Initializing, please retry.' })); return; }

    setLoading(true);
    try {
      const result  = await promptAsync();
      if (result.type !== 'success') return;

      const idToken = result.params?.id_token || result.authentication?.idToken;
      if (!idToken) { Alert.alert(t('login.googleTitle', { defaultValue: 'Google Sign-In' }), t('login.googleTokenMissing', { defaultValue: 'Token missing, retry.' })); return; }

      const credential   = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

      if (!userDoc.exists()) {
        navigation.replace('Register', { googleUser: { uid: userCredential.user.uid, email: userCredential.user.email || '' } });
        return;
      }

      const userData = userDoc.data();
      if (userData.role === 'doctor') {
        if (userData.status === 'suspended') { Alert.alert(t('login.googleTitle', { defaultValue: 'Google Sign-In' }), t('login.doctorSuspended')); return; }
        if (!userData.isVerified && userData.profileCompleted) { Alert.alert(t('login.googleTitle', { defaultValue: 'Google Sign-In' }), t('login.doctorNotVerified')); return; }
      }

      let nextScreen, nextScreenParams;
      if (userData.role === 'doctor') {
        nextScreen = userData.profileCompleted ? 'DoctorDashboard' : 'EditProfile';
        if (!userData.profileCompleted) nextScreenParams = { isNewDoctor: true };
      } else {
        nextScreen = userData.patientProfileCompleted ? 'PatientMap' : 'PatientOnboarding';
      }

      await AsyncStorage.setItem('userRole', userData.role);

      if (!userData.termsAccepted) {
        navigation.replace('TermsAcceptance', { uid: userCredential.user.uid, nextScreen, nextScreenParams });
        return;
      }
      navigation.replace(nextScreen, nextScreenParams || {});
    } catch (error) {
      Alert.alert(t('login.googleTitle', { defaultValue: 'Google Sign-In' }), error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── Animated title ── */}
        <View style={styles.logoContainer}>
          {/* Oval SVG absolutely behind the text */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 400 120">
              <AnimatedPath
                d={OVAL_PATH}
                fill="none"
                stroke={colors.primary}
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={DASH_LEN}
                strokeDashoffset={strokeDashoffset}
              />
            </Svg>
          </View>

          <Animated.Text
            style={[styles.logo, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}
          >
            {t('login.title')}
          </Animated.Text>
        </View>

        <Animated.Text style={[styles.tagline, { opacity: subtitleOpacity }]}>
          {t('login.subtitle')}
        </Animated.Text>

        {/* ── Form ── */}
        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder={t('login.emailPlaceholder')}
            placeholderTextColor={colors.placeholder}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor={colors.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleEmailLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{t('login.loginBtn')}</Text>}
          </TouchableOpacity>
        </View>

        {/* ── Google ── */}
        <TouchableOpacity
          style={[styles.googleButton, (loading || !request) && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={loading || !request}
        >
          <AntDesign name="google" size={18} color="#DB4437" style={{ marginRight: 10 }} />
          <Text style={styles.googleButtonText}>
            {t('login.continueWithGoogle', { defaultValue: 'Continue with Google' })}
          </Text>
        </TouchableOpacity>

        {/* ── Language picker ── */}
        <View style={[styles.langPicker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {[
            { code: 'en', label: 'English' },
            { code: 'ar', label: 'عربي' },
            { code: 'fr', label: 'Français' },
          ].map(l => (
            <TouchableOpacity
              key={l.code}
              style={[styles.langBtn, language === l.code && styles.langBtnActive]}
              onPress={() => setLanguage(l.code)}
            >
              <Text style={[styles.langBtnText, language === l.code && styles.langBtnTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Register link ── */}
        <TouchableOpacity style={styles.registerContainer} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>
            {t('login.noAccount')}{' '}
            <Text style={styles.registerLink}>{t('login.register')}</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c) => StyleSheet.create({
  container:     { flex: 1, backgroundColor: c.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  // Animated logo section
  logoContainer: {
    width: '100%',
    height: 118,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  logo:    { fontSize: 46, fontWeight: '900', textAlign: 'center', color: c.primary, letterSpacing: -1 },
  tagline: { fontSize: 14, color: c.textTertiary, textAlign: 'center', marginBottom: 32 },

  // Form
  formContainer: { marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: c.border, padding: 15, borderRadius: 12,
    marginBottom: 14, fontSize: 16, backgroundColor: c.inputBackground, color: c.text,
  },
  button:         { backgroundColor: c.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  buttonText:     { color: '#fff', fontWeight: '700', fontSize: 17 },
  buttonDisabled: { opacity: 0.7 },

  // Google
  googleButton: {
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    padding: 16, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  googleButtonText: { color: c.text, fontWeight: '700', fontSize: 16 },

  // Language
  langPicker: { justifyContent: 'center', gap: 8, marginBottom: 4 },
  langBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center',
  },
  langBtnActive:     { backgroundColor: c.primary, borderColor: c.primary },
  langBtnText:       { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
  langBtnTextActive: { color: '#fff' },

  // Register
  registerContainer: { marginTop: 16 },
  registerLink: { fontWeight: '700', color: c.primary },
  linkText:     { textAlign: 'center', color: c.textSecondary, fontSize: 15 },
});
