import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Switch, Modal,
} from 'react-native';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import {
  EmailAuthProvider, reauthenticateWithCredential,
  updatePassword, signOut,
} from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import { useTheme } from './ThemeContext';
import { Feather } from '@expo/vector-icons';

export default function PatientProfileScreen({ navigation }) {
  const { t, i18n } = useTranslation('screens');
  const { isRTL, setLanguage, language } = useLanguage();
  const { colors, isDark, themeMode, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [relativeName, setRelativeName] = useState('');
  const [relativeRelation, setRelativeRelation] = useState('');
  const [relativeAge, setRelativeAge] = useState('');

  // Password change modal
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  // Suggestion / contact
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const isGoogleUser = auth.currentUser?.providerData?.[0]?.providerId === 'google.com';

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (snap.exists()) {
          const d = snap.data();
          setFullName(d.fullName || '');
          setAge(d.age ? String(d.age) : '');
          setPhone(d.phone || '');
          setPhoneVisible(d.phoneVisible ?? false);
          setRelativeName(d.relativeProfile?.name || '');
          setRelativeRelation(d.relativeProfile?.relation || '');
          setRelativeAge(d.relativeProfile?.age ? String(d.relativeProfile.age) : '');
        }
      } catch {
        Alert.alert(t('patientProfile.loadErrorTitle'), t('patientProfile.loadErrorMsg'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveProfile = async () => {
    const parsedAge = parseInt(age, 10);
    if (!fullName.trim()) {
      Alert.alert(t('patientProfile.missingNameTitle'), t('patientProfile.missingNameMsg')); return;
    }
    if (!age.trim() || isNaN(parsedAge) || parsedAge < 1) {
      Alert.alert(t('patientProfile.invalidAgeTitle'), t('patientProfile.invalidAgeMsg')); return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        fullName: fullName.trim(),
        age: parsedAge,
        phone: phone.trim(),
        phoneVisible,
        relativeProfile: {
          name: relativeName.trim(),
          relation: relativeRelation.trim(),
          age: relativeAge.trim() ? parseInt(relativeAge, 10) : null,
        },
        profileUpdatedAt: new Date(),
      });
      Alert.alert(t('patientProfile.savedTitle'), t('patientProfile.savedMsg'));
    } catch {
      Alert.alert('Erreur', t('patientProfile.saveErrorMsg'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !newPwdConfirm) {
      Alert.alert('', t('patientProfile.pwdFillAll')); return;
    }
    if (newPwd !== newPwdConfirm) {
      Alert.alert('', t('patientProfile.pwdNoMatch')); return;
    }
    if (newPwd.length < 6) {
      Alert.alert('', t('patientProfile.pwdTooShort')); return;
    }
    setPwdLoading(true);
    try {
      const user = auth.currentUser;
      const cred = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPwd);
      Alert.alert('', t('patientProfile.pwdSuccess'));
      setPwdModalVisible(false);
      setCurrentPwd(''); setNewPwd(''); setNewPwdConfirm('');
    } catch (e) {
      Alert.alert('', e.code === 'auth/wrong-password'
        ? t('patientProfile.pwdWrong')
        : t('patientProfile.pwdError'));
    } finally {
      setPwdLoading(false);
    }
  };

  const handleSuggestion = async () => {
    if (!suggestionText.trim()) {
      Alert.alert('', t('patientMap.missingSuggestion')); return;
    }
    setSuggestionLoading(true);
    try {
      await addDoc(collection(db, 'suggestions'), {
        uid: auth.currentUser.uid,
        text: suggestionText.trim(),
        createdAt: new Date(),
      });
      Alert.alert('', t('patientMap.suggestionThanks'));
      setSuggestionText('');
    } catch {
      Alert.alert('', t('patientMap.suggestionError'));
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(t('patientProfile.logoutTitle'), t('patientProfile.logoutConfirm'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('patientProfile.logoutBtn'), style: 'destructive',
        onPress: async () => {
          await signOut(auth);
          await AsyncStorage.removeItem('userRole');
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const C = colors;

  // ─────────────── Section header helper ──────────────────────────────────────
  const SectionHeader = ({ icon, label }) => (
    <View style={[styles.sectionHeader, { borderBottomColor: C.borderLight }]}>
      <Feather name={icon} size={14} color={C.primary} style={{ marginRight: 6 }} />
      <Text style={[styles.sectionTitle, { color: C.primary }]}>{label}</Text>
    </View>
  );

  const Card = ({ children, style }) => (
    <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, style]}>
      {children}
    </View>
  );

  const RowInput = ({ label, value, onChangeText, keyboardType, placeholder, multiline }) => (
    <View style={styles.rowInput}>
      <Text style={[styles.inputLabel, { color: C.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: C.inputBackground, borderColor: C.border, color: C.text }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={C.placeholder}
        multiline={multiline}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <Text style={[styles.headerTitle, { color: C.text }]}>{t('patientProfile.settingsTitle')}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { direction: isRTL ? 'rtl' : 'ltr' }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PROFILE ── */}
        <SectionHeader icon="user" label={t('patientProfile.sectionProfile')} />
        <Card>
          <RowInput label={t('patientProfile.nameLabel')} value={fullName} onChangeText={setFullName} placeholder="Ahmed Ben Ali" />
          <RowInput label={t('patientProfile.ageLabel')} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="25" />
          <View style={styles.rowInput}>
            <Text style={[styles.inputLabel, { color: C.textSecondary }]}>{t('patientProfile.phoneLabel')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBackground, borderColor: C.border, color: C.text }]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="05XX XXX XXX"
              placeholderTextColor={C.placeholder}
            />
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: C.textSecondary }]}>{t('patientProfile.phoneVisibleLabel')}</Text>
              <Switch
                value={phoneVisible}
                onValueChange={setPhoneVisible}
                trackColor={{ false: C.border, true: C.primaryMid }}
                thumbColor={phoneVisible ? C.primary : C.textTertiary}
              />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: C.primary }]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>{t('patientProfile.saveBtn')}</Text>}
          </TouchableOpacity>
        </Card>

        {/* ── RELATIVE ── */}
        <SectionHeader icon="users" label={t('patientProfile.relativeSection')} />
        <Card>
          <RowInput label={t('patientProfile.relativeNameLabel')} value={relativeName} onChangeText={setRelativeName} placeholder="Fatima Ben Ali" />
          <RowInput label={t('patientProfile.relativeRelationLabel')} value={relativeRelation} onChangeText={setRelativeRelation} placeholder="Mère, Père, Enfant..." />
          <RowInput label={t('patientProfile.relativeAgeLabel')} value={relativeAge} onChangeText={setRelativeAge} keyboardType="number-pad" placeholder="60" />
        </Card>

        {/* ── PRÉFÉRENCES ── */}
        <SectionHeader icon="sliders" label={t('patientProfile.sectionPreferences')} />
        <Card>
          {/* Language */}
          <Text style={[styles.inputLabel, { color: C.textSecondary, marginBottom: 8 }]}>{t('patientProfile.languageLabel')}</Text>
          <View style={styles.langRow}>
            {[{ code: 'en', label: 'English' }, { code: 'fr', label: 'Français' }, { code: 'ar', label: 'العربية' }].map(l => (
              <TouchableOpacity
                key={l.code}
                style={[styles.langChip, { borderColor: C.border, backgroundColor: language === l.code ? C.primary : C.inputBackground }]}
                onPress={() => setLanguage(l.code)}
              >
                <Text style={[styles.langChipText, { color: language === l.code ? '#fff' : C.text }]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Dark mode */}
          <View style={[styles.toggleRow, { borderTopColor: C.borderLight }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleTitle, { color: C.text }]}>{t('patientProfile.darkModeLabel')}</Text>
              <Text style={[styles.toggleSub, { color: C.textTertiary }]}>
                {themeMode === 'system' ? t('patientProfile.themeAuto') : isDark ? t('patientProfile.themeDark') : t('patientProfile.themeLight')}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={v => setTheme(v ? 'dark' : 'light')}
              trackColor={{ false: C.border, true: C.primaryMid }}
              thumbColor={isDark ? C.primary : C.textTertiary}
            />
          </View>
        </Card>

        {/* ── SÉCURITÉ ── */}
        {!isGoogleUser && (
          <>
            <SectionHeader icon="lock" label={t('patientProfile.sectionSecurity')} />
            <Card>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setPwdModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name="key" size={16} color={C.primary} />
                </View>
                <Text style={[styles.actionLabel, { color: C.text }]}>{t('patientProfile.changePasswordBtn')}</Text>
                <Feather name="chevron-right" size={18} color={C.textTertiary} />
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* ── SUGGESTION & CONTACT ── */}
        <SectionHeader icon="message-circle" label={t('patientProfile.sectionOther')} />
        <Card>
          <Text style={[styles.inputLabel, { color: C.textSecondary, marginBottom: 8 }]}>{t('patientMap.suggestionTitle')}</Text>
          <TextInput
            style={[styles.textarea, { backgroundColor: C.inputBackground, borderColor: C.border, color: C.text }]}
            value={suggestionText}
            onChangeText={setSuggestionText}
            placeholder={t('patientMap.suggestionPlaceholder')}
            placeholderTextColor={C.placeholder}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: C.primary }]}
            onPress={handleSuggestion}
            disabled={suggestionLoading}
          >
            {suggestionLoading
              ? <ActivityIndicator color={C.primary} size="small" />
              : <Text style={[styles.outlineBtnText, { color: C.primary }]}>{t('patientMap.sendSuggestion')}</Text>}
          </TouchableOpacity>

          {/* Contact / Report bug */}
          <View style={[styles.contactRow, { borderTopColor: C.borderLight }]}>
            <Feather name="mail" size={16} color={C.textSecondary} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.contactTitle, { color: C.text }]}>{t('patientProfile.contactTitle')}</Text>
              <Text style={[styles.contactSub, { color: C.textTertiary }]}>{t('patientProfile.contactComingSoon')}</Text>
            </View>
          </View>
        </Card>

        {/* ── DÉCONNEXION ── */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: C.dangerLight, borderColor: C.danger }]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={18} color={C.danger} style={{ marginRight: 8 }} />
          <Text style={[styles.logoutText, { color: C.danger }]}>{t('patientProfile.logoutBtn')}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Password change modal ── */}
      <Modal
        visible={pwdModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPwdModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.card }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: C.text }]}>{t('patientProfile.changePasswordBtn')}</Text>

            <TextInput
              style={[styles.input, { backgroundColor: C.inputBackground, borderColor: C.border, color: C.text, marginBottom: 10 }]}
              placeholder={t('patientProfile.currentPasswordPlaceholder')}
              placeholderTextColor={C.placeholder}
              secureTextEntry
              value={currentPwd}
              onChangeText={setCurrentPwd}
            />
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBackground, borderColor: C.border, color: C.text, marginBottom: 10 }]}
              placeholder={t('patientProfile.newPasswordPlaceholder')}
              placeholderTextColor={C.placeholder}
              secureTextEntry
              value={newPwd}
              onChangeText={setNewPwd}
            />
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBackground, borderColor: C.border, color: C.text, marginBottom: 16 }]}
              placeholder={t('patientProfile.confirmPasswordPlaceholder')}
              placeholderTextColor={C.placeholder}
              secureTextEntry
              value={newPwdConfirm}
              onChangeText={setNewPwdConfirm}
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: C.primary, marginBottom: 10 }]}
              onPress={handleChangePassword}
              disabled={pwdLoading}
            >
              {pwdLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>{t('patientProfile.updatePasswordBtn')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPwdModalVisible(false)}>
              <Text style={[styles.cancelText, { color: C.textSecondary }]}>{t('common:cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  content: { padding: 16, paddingBottom: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 8, marginTop: 22, marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  card: {
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
    marginBottom: 4,
  },
  rowInput: { marginBottom: 10 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 5 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 13,
    paddingVertical: 11, fontSize: 15,
  },
  textarea: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 13,
    paddingVertical: 11, fontSize: 15, minHeight: 80,
    textAlignVertical: 'top', marginBottom: 10,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  switchLabel: { fontSize: 13, fontWeight: '500' },
  saveBtn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  langChip: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1.5, alignItems: 'center',
  },
  langChipText: { fontSize: 13, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 14, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggleTitle: { fontSize: 15, fontWeight: '600' },
  toggleSub: { fontSize: 12, marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 12 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  outlineBtn: {
    borderWidth: 1.5, borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', marginBottom: 4,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700' },
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  contactTitle: { fontSize: 14, fontWeight: '600' },
  contactSub: { fontSize: 12, marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 24, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
  },
  logoutText: { fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 18 },
  cancelText: { textAlign: 'center', fontSize: 15, fontWeight: '500', paddingVertical: 8 },
});
