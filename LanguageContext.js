import React, { createContext, useContext, useState, useEffect } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from './i18n';

const LanguageContext = createContext();

const SUPPORTED = ['en', 'ar', 'fr'];

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('en');
  const isRTL = language === 'ar';

  useEffect(() => {
    AsyncStorage.getItem('appLanguage').then(saved => {
      if (saved && SUPPORTED.includes(saved)) {
        applyLanguage(saved, false);
      } else {
        // First launch: detect from device
        const deviceLang = Localization.getLocales?.()[0]?.languageCode ?? 'en';
        const initial = SUPPORTED.includes(deviceLang) ? deviceLang : 'en';
        applyLanguage(initial, true);
      }
    });
  }, []);

  const applyLanguage = (lang, persist = true) => {
    const rtl = lang === 'ar';
    I18nManager.forceRTL(rtl);
    i18n.changeLanguage(lang);
    setLanguageState(lang);
    if (persist) AsyncStorage.setItem('appLanguage', lang);
  };

  const setLanguage = (lang) => applyLanguage(lang);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
