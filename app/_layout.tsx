import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-get-random-values';
import 'react-native-reanimated';

import { AuthGate } from '@/src/components/security/AuthGate';
import { SecurityProvider } from '@/src/core/security/SecurityContext';
import { initializeSeedData } from '@/src/data/seed';
import { ThemeProvider, useThemeContext } from '@/src/theme/ThemeContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { isDark } = useThemeContext();

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
      <AuthGate />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  // Initialize seed data on app start
  useEffect(() => {
    initializeSeedData()
      .then((result) => {
        console.log('Seed data initialized:', result);
        setIsReady(true);
      })
      .catch((error) => {
        console.error('Failed to initialize seed data:', error);
        setIsReady(true);
      });
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <ThemeProvider>
      <SecurityProvider>
        <RootNavigator />
      </SecurityProvider>
    </ThemeProvider>
  );
}
