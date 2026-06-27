import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet,
  Dimensions, Modal, TouchableWithoutFeedback,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { useTheme } from './ThemeContext';
import { useTranslation } from 'react-i18next';

const PATIENT_TABS = [
  { route: 'PatientMap',         icon: 'pill',             iconLib: 'mci', labelKey: 'tabHome',         hasPopup: false },
  { route: 'AppointmentHistory', icon: 'calendar-clock',   iconLib: 'mci', labelKey: 'tabAppointments', hasPopup: false },
  { route: 'Notifications',      icon: 'bell',             iconLib: 'f',   labelKey: 'tabAlerts',       hasPopup: false },
  { route: null,                 icon: 'user',             iconLib: 'f',   labelKey: 'tabAccount',      hasPopup: true  },
];

const DOCTOR_TABS = [
  { route: 'DoctorDashboard',    icon: 'grid',             iconLib: 'f',   labelKey: 'tabDashboard',    hasPopup: false },
  { route: 'AppointmentHistory', icon: 'calendar-clock',   iconLib: 'mci', labelKey: 'tabPatients',     hasPopup: false },
  { route: 'Notifications',      icon: 'bell',             iconLib: 'f',   labelKey: 'tabAlerts',       hasPopup: false },
  { route: null,                 icon: 'user',             iconLib: 'f',   labelKey: 'tabAccount',      hasPopup: true  },
];

const TAB_LABELS = {
  tabHome:         { en: 'Accueil',      fr: 'Accueil',      ar: 'الرئيسية' },
  tabAppointments: { en: 'Rendez-vous',  fr: 'Rendez-vous',  ar: 'المواعيد' },
  tabAlerts:       { en: 'Alertes',      fr: 'Alertes',      ar: 'التنبيهات' },
  tabAccount:      { en: 'Compte',       fr: 'Compte',        ar: 'الحساب' },
  tabDashboard:    { en: 'Tableau',      fr: 'Tableau',       ar: 'لوحة التحكم' },
  tabPatients:     { en: 'Patients',     fr: 'Patients',      ar: 'المرضى' },
};

export default function BottomTabBar({ navigation, currentRoute }) {
  const { colors, isDark } = useTheme();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [userRole, setUserRole] = useState('patient');
  const [popupVisible, setPopupVisible] = useState(false);
  const [containerH, setContainerH] = useState(90);

  const popupOpacity = useRef(new Animated.Value(0)).current;
  const popupTranslateY = useRef(new Animated.Value(12)).current;
  const popupScale = useRef(new Animated.Value(0.92)).current;

  const scales = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(1))
  ).current;

  const lang = i18n.language?.startsWith('ar') ? 'ar' : i18n.language?.startsWith('fr') ? 'fr' : 'en';

  useEffect(() => {
    AsyncStorage.getItem('userRole').then(r => { if (r) setUserRole(r); });
  }, [currentRoute]);

  const tabs = userRole === 'doctor' ? DOCTOR_TABS : PATIENT_TABS;

  const activeIndex = (() => {
    const idx = tabs.findIndex(t => t.route === currentRoute);
    return idx >= 0 ? idx : 0;
  })();

  const openPopup = () => {
    setPopupVisible(true);
    Animated.parallel([
      Animated.spring(popupScale, { toValue: 1, damping: 16, stiffness: 260, mass: 0.7, useNativeDriver: true }),
      Animated.spring(popupTranslateY, { toValue: 0, damping: 16, stiffness: 260, mass: 0.7, useNativeDriver: true }),
      Animated.timing(popupOpacity, { toValue: 1, duration: 190, useNativeDriver: true }),
    ]).start();
  };

  const closePopup = (cb) => {
    Animated.parallel([
      Animated.timing(popupScale, { toValue: 0.92, duration: 160, useNativeDriver: true }),
      Animated.timing(popupTranslateY, { toValue: 12, duration: 160, useNativeDriver: true }),
      Animated.timing(popupOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setPopupVisible(false);
      popupScale.setValue(0.92);
      popupTranslateY.setValue(12);
      if (cb) cb();
    });
  };

  const bounceTab = useCallback((index, cb) => {
    Animated.sequence([
      Animated.spring(scales[index], { toValue: 0.80, useNativeDriver: true, speed: 50, bounciness: 0 }),
      Animated.spring(scales[index], { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 220 }),
    ]).start(cb);
  }, [scales]);

  const handleTabPress = useCallback((tab, index) => {
    if (tab.hasPopup) {
      bounceTab(index);
      if (popupVisible) { closePopup(); } else { openPopup(); }
    } else {
      if (popupVisible) closePopup();
      // Navigate immediately for an instant switch; bounce runs in parallel.
      navigation.navigate(tab.route);
      bounceTab(index);
    }
  }, [popupVisible, navigation, bounceTab]);

  const handleLogout = () => {
    closePopup(async () => {
      try {
        await signOut(auth);
        await AsyncStorage.removeItem('userRole');
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      } catch (e) { console.log('logout error', e); }
    });
  };

  const handleProfile = () => {
    closePopup(() => {
      navigation.navigate(userRole === 'doctor' ? 'EditProfile' : 'PatientProfile');
    });
  };

  const bottomPad = Math.max(insets.bottom, 6);

  return (
    <View
      pointerEvents="box-none"
      style={styles.absoluteWrap}
      onLayout={e => setContainerH(e.nativeEvent.layout.height)}
    >
      {/* ── Popup overlay + card (via Modal for proper z-index) ── */}
      <Modal
        visible={popupVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closePopup()}
      >
        <View style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={() => closePopup()}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>

          <Animated.View
            style={[
              styles.popup,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.shadow,
                bottom: containerH + 8,
                opacity: popupOpacity,
                transform: [
                  { translateY: popupTranslateY },
                  { scale: popupScale },
                ],
              },
            ]}
          >
            {/* Profile & Settings */}
            <TouchableOpacity style={styles.popupRow} onPress={handleProfile} activeOpacity={0.7}>
              <View style={[styles.popupIconWrap, { backgroundColor: colors.primaryLight }]}>
                <Feather name="user" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.popupLabel, { color: colors.text }]}>
                {lang === 'ar' ? 'الملف الشخصي والإعدادات' : lang === 'fr' ? 'Profil & Paramètres' : 'Profile & Settings'}
              </Text>
              <Feather name="chevron-right" size={15} color={colors.textTertiary} />
            </TouchableOpacity>

            <View style={[styles.popupSep, { backgroundColor: colors.borderLight }]} />

            {/* Logout */}
            <TouchableOpacity style={styles.popupRow} onPress={handleLogout} activeOpacity={0.7}>
              <View style={[styles.popupIconWrap, { backgroundColor: colors.dangerLight }]}>
                <Feather name="log-out" size={16} color={colors.danger} />
              </View>
              <Text style={[styles.popupLabel, { color: colors.danger }]}>
                {lang === 'ar' ? 'تسجيل الخروج' : lang === 'fr' ? 'Déconnexion' : 'Sign Out'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Floating pill ── */}
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.tabBar,
            borderColor: colors.tabBarBorder,
            marginHorizontal: 18,
            marginBottom: bottomPad + 10,
            shadowColor: colors.shadow,
          },
        ]}
      >
        {tabs.map((tab, index) => {
          const isActive = index === activeIndex || (tab.hasPopup && popupVisible);
          const label = TAB_LABELS[tab.labelKey]?.[lang] ?? tab.labelKey;
          return (
            <TouchableOpacity
              key={tab.labelKey}
              style={styles.tab}
              onPress={() => handleTabPress(tab, index)}
              activeOpacity={1}
            >
              <Animated.View
                style={[styles.tabInner, { transform: [{ scale: scales[index] }] }]}
              >
                {/* Active pill bg */}
                {isActive && (
                  <View style={[styles.activePill, { backgroundColor: colors.primaryLight }]} />
                )}
                {tab.iconLib === 'mci' ? (
                  <MaterialCommunityIcons
                    name={tab.icon}
                    size={22}
                    color={isActive ? colors.primary : colors.inactiveTab}
                  />
                ) : (
                  <Feather
                    name={tab.icon}
                    size={20}
                    color={isActive ? colors.primary : colors.inactiveTab}
                  />
                )}
                <Text
                  style={[
                    styles.label,
                    {
                      color: isActive ? colors.primary : colors.inactiveTab,
                      fontWeight: isActive ? '700' : '400',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  pill: {
    flexDirection: 'row',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 18,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
    minWidth: 64,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.1,
    marginTop: 3,
  },
  popup: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 6,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 24,
  },
  popupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  popupIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  popupSep: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
});
