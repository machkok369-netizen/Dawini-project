import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

export default function RegisterScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient'); 
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

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
  if (role === 'doctor' && !specialty.trim()) {
    Alert.alert(i18n.t('screens:register.title'), i18n.t('screens:register.errorFillFields'));
    return;
  }

  setLoading(true);

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    const userData = {
      uid: user.uid,
      email: user.email,
      role: role,
      createdAt: new Date(),
      isVerified: role === 'patient' ? true : false,
      profileCompleted: false,
      patientProfileCompleted: false,
      termsAccepted: false,
    };

    await setDoc(doc(db, 'users', user.uid), userData);

    Alert.alert(i18n.t('screens:register.successTitle'), i18n.t('screens:register.successMsg'));

    if (role === 'patient') {
      navigation.replace('TermsAcceptance', {
        uid: user.uid,
        nextScreen: 'PatientOnboarding',
      });
    } else {
      navigation.replace('TermsAcceptance', {
        uid: user.uid,
        nextScreen: 'EditProfile',
        nextScreenParams: { isNewDoctor: true },
      });
    }
  } catch (error) {
    Alert.alert(i18n.t('screens:register.title'), error.message);
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
        />
        <TextInput 
          placeholder={t('register.passwordPlaceholder')}
          style={styles.input} 
          secureTextEntry 
          onChangeText={setPassword} 
          value={password} 
        />

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
          <View style={{ width: '100%', marginTop: 10 }}>
            <TextInput 
              placeholder="Medical Specialty" 
              style={styles.input} 
              onChangeText={setSpecialty} 
              value={specialty} 
            />
            <TextInput 
              placeholder="Clinic Phone Number" 
              style={styles.input} 
              onChangeText={setPhone} 
              value={phone} 
              keyboardType="phone-pad"
            />
          </View>
        )}

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('register.registerBtn')}</Text>}
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
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  linkText: { textAlign: 'center', marginTop: 20, color: '#2ecc71', fontSize: 16 },
});

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient'); 
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

const handleRegister = async () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !password) {
    Alert.alert('Error', 'Please fill email and password');
    return;
  }
  if (!emailRegex.test(email.trim())) {
    Alert.alert('Invalid Email', 'Please enter a valid email address');
    return;
  }
  if (password.length < 6) {
    Alert.alert('Weak Password', 'Password must be at least 6 characters');
    return;
  }
  if (role === 'doctor' && !specialty.trim()) {
    Alert.alert('Missing Info', 'Please enter your medical specialty');
    return;
  }

  setLoading(true);

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    const userData = {
      uid: user.uid,
      email: user.email,
      role: role,
      createdAt: new Date(),
      isVerified: role === 'patient' ? true : false,
      profileCompleted: false,
      patientProfileCompleted: false,
      termsAccepted: false,
    };

    await setDoc(doc(db, 'users', user.uid), userData);

    Alert.alert("✅ Account Created!", "Welcome to Dawini");

    if (role === 'patient') {
      navigation.replace('TermsAcceptance', {
        uid: user.uid,
        nextScreen: 'PatientOnboarding',
      });
    } else {
      navigation.replace('TermsAcceptance', {
        uid: user.uid,
        nextScreen: 'EditProfile',
        nextScreenParams: { isNewDoctor: true },
      });
    }
  } catch (error) {
    Alert.alert("Registration Failed", error.message);
  } finally {
    setLoading(false);
  }
};

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Join Dawini 🏥</Text>
        
        <TextInput 
          placeholder="Email Address" 
          style={styles.input} 
          onChangeText={setEmail} 
          value={email}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput 
          placeholder="Password" 
          style={styles.input} 
          secureTextEntry 
          onChangeText={setPassword} 
          value={password} 
        />

        <Text style={styles.label}>I am a:</Text>
        <View style={styles.roleContainer}>
          <TouchableOpacity 
            style={[styles.roleButton, role === 'patient' && styles.activeRole]} 
            onPress={() => setRole('patient')}
          >
            <Text style={role === 'patient' ? styles.activeText : styles.roleText}>Patient</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.roleButton, role === 'doctor' && styles.activeRole]} 
            onPress={() => setRole('doctor')}
          >
            <Text style={role === 'doctor' ? styles.activeText : styles.roleText}>Doctor</Text>
          </TouchableOpacity>
        </View>

        {role === 'doctor' && (
          <View style={{ width: '100%', marginTop: 10 }}>
            <TextInput 
              placeholder="Medical Specialty" 
              style={styles.input} 
              onChangeText={setSpecialty} 
              value={specialty} 
            />
            <TextInput 
              placeholder="Clinic Phone Number" 
              style={styles.input} 
              onChangeText={setPhone} 
              value={phone} 
              keyboardType="phone-pad"
            />
          </View>
        )}

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>Already have an account? Login</Text>
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
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  linkText: { textAlign: 'center', marginTop: 20, color: '#2ecc71', fontSize: 16 },
});