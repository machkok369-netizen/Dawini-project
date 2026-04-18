import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

export default function PatientProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [relativeName, setRelativeName] = useState('');
  const [relativeRelation, setRelativeRelation] = useState('');
  const [relativeAge, setRelativeAge] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setFullName(data.fullName || '');
          setAge(data.age ? String(data.age) : '');
          setRelativeName(data.relativeProfile?.name || '');
          setRelativeRelation(data.relativeProfile?.relation || '');
          setRelativeAge(data.relativeProfile?.age ? String(data.relativeProfile.age) : '');
        }
      } catch (e) {
        Alert.alert('Error', 'Could not load profile');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const saveProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert('Missing Info', 'Name is required');
      return;
    }
    if (!age.trim() || Number(age) < 1) {
      Alert.alert('Invalid Age', 'Please enter a valid age');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        fullName: fullName.trim(),
        age: parseInt(age, 10),
        relativeProfile: {
          name: relativeName.trim(),
          relation: relativeRelation.trim(),
          age: relativeAge.trim() ? parseInt(relativeAge, 10) : null,
        },
        profileUpdatedAt: new Date(),
      });
      Alert.alert('Saved', 'Patient profile updated');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Patient Profile</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />

      <Text style={styles.label}>Age</Text>
      <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" />

      <Text style={styles.section}>Relative Booking (optional)</Text>
      <Text style={styles.label}>Relative Name</Text>
      <TextInput style={styles.input} value={relativeName} onChangeText={setRelativeName} />

      <Text style={styles.label}>Relationship</Text>
      <TextInput style={styles.input} value={relativeRelation} onChangeText={setRelativeRelation} />

      <Text style={styles.label}>Relative Age</Text>
      <TextInput style={styles.input} value={relativeAge} onChangeText={setRelativeAge} keyboardType="number-pad" />

      <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Profile</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 20 },
  section: { fontSize: 16, fontWeight: '700', color: '#16a34a', marginTop: 10, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
