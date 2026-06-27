import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Warm cream / sage-green palette (adapted from design system)
export const lightColors = {
  background:      '#FAF7EF',
  surface:         '#F4F0E6',
  surfaceElevated: '#FDFAF4',
  primary:         '#4F8461',
  primaryLight:    '#D4EBDA',
  primaryMid:      '#7FB38A',
  text:            '#3B2D24',
  textSecondary:   '#7A6E67',
  textTertiary:    '#A09890',
  border:          '#DDD0BD',
  borderLight:     '#EAE4D8',
  card:            '#FDFAF4',
  tabBar:          'rgba(253,250,244,0.97)',
  tabBarBorder:    'rgba(59,45,36,0.07)',
  activeTab:       '#4F8461',
  inactiveTab:     '#A09890',
  danger:          '#C04040',
  dangerLight:     '#F5E0E0',
  warning:         '#C08020',
  success:         '#4F8461',
  accent:          '#F5D4C8',
  muted:           '#EAE4D8',
  inputBackground: '#F4F0E6',
  placeholder:     '#A09890',
  shadow:          '#3B2D24',
  overlay:         'rgba(59,45,36,0.45)',
  statusOnline:    '#4F8461',
  statusBusy:      '#C08020',
  statusAway:      '#C04040',
  statusVacation:  '#2563eb',
};

export const darkColors = {
  background:      '#161B26',
  surface:         '#1C2230',
  surfaceElevated: '#222A3A',
  primary:         '#3D9174',
  primaryLight:    '#1B3B31',
  primaryMid:      '#2D6B57',
  text:            '#EDE7DB',
  textSecondary:   '#A8B3BE',
  textTertiary:    '#6E7A89',
  border:          '#2F3A4E',
  borderLight:     '#222A3A',
  card:            '#1C2230',
  tabBar:          'rgba(22,27,38,0.97)',
  tabBarBorder:    'rgba(237,231,219,0.06)',
  activeTab:       '#3D9174',
  inactiveTab:     '#6E7A89',
  danger:          '#B83232',
  dangerLight:     '#3A1515',
  warning:         '#D97706',
  success:         '#3D9174',
  accent:          '#1D3B3A',
  muted:           '#222A3A',
  inputBackground: '#1C2230',
  placeholder:     '#6E7A89',
  shadow:          '#000000',
  overlay:         'rgba(0,0,0,0.62)',
  statusOnline:    '#3D9174',
  statusBusy:      '#D97706',
  statusAway:      '#B83232',
  statusVacation:  '#3b82f6',
};

const ThemeContext = createContext({
  colors: lightColors,
  isDark: false,
  themeMode: 'system',
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem('themeMode').then(saved => {
      if (saved) setThemeModeState(saved);
    });
  }, []);

  const isDark =
    themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  const colors = isDark ? darkColors : lightColors;

  const setTheme = async (mode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem('themeMode', mode);
  };

  return (
    <ThemeContext.Provider value={{ colors, isDark, themeMode, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
