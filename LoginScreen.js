import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export default function LoginScreen({ navigation }) {
  const [mode, setMode] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      const userData = userDoc.data();

      if (!userData) { 
        Alert.alert('Error', 'User data not found'); 
        return; 
      }

      if (userData.role === 'doctor') {
        if (!userData.profileCompleted) {
          navigation.replace('EditProfile', { isNewDoctor: true });
        } else {
          navigation.replace('DoctorDashboard');
        }
      } else {
        // ✅ PATIENT FLOW
        if (!userData.patientProfileCompleted) {
          navigation.replace('PatientOnboarding'); // ← Check onboarding
        } else {
          navigation.replace('PatientMap');
        }
      }
    } catch (error) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.logo}>Dawini</Text>
        <Text style={styles.tagline}>Your health, connected.</Text>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, mode === 'email' && styles.activeToggle]}
            onPress={() => setMode('email')}
          >
            <Text style={[styles.toggleText, mode === 'email' && styles.activeText]}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, mode === 'phone' && styles.activeToggle]}
            onPress={() => setMode('phone')}
          >
            <Text style={[styles.toggleText, mode === 'phone' && styles.activeText]}>Phone</Text>
          </TouchableOpacity>
        </View>

        {mode === 'email' && (
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleEmailLogin}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
            </TouchableOpacity>
          </View>
        )}

        {mode === 'phone' && (
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="+213 5XX XXX XXX"
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              style={styles.button}
              onPress={() => Alert.alert('Coming Soon', 'Phone login will be added later.')}
            >
              <Text style={styles.buttonText}>Send OTP</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.registerContainer} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.registerLink}>Register</Text>
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
  toggleContainer: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 28 },
  toggleButton: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  activeToggle: { backgroundColor: '#16a34a' },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  activeText: { color: '#fff' },
  formContainer: { marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', padding: 15, borderRadius: 12, marginBottom: 14, fontSize: 16, backgroundColor: '#fafafa' },
  button: { backgroundColor: '#16a34a', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  linkText: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 20 },
  registerContainer: { marginTop: 20 },
  registerLink: { fontWeight: '700', color: '#16a34a' },
});