import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import 'react-native-get-random-values';
import 'react-native-reanimated';

import i18n from '@/src/localization/i18n';
import * as Sentry from '@sentry/react-native';
import { analyticsService } from '@/src/data/services/AnalyticsService';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://placeholder@sentry.io/placeholder',
  debug: false,
});

import { AuthGate } from '@/src/components/security/AuthGate';
import { ErrorBoundary } from '@/src/core/error/ErrorBoundary';
import { SecurityProvider } from '@/src/core/security/SecurityContext';
import { runMigrations } from '@/src/data/migrations';
import { initializeSeedData } from '@/src/data/seed';
import { loadSettings } from '@/src/data/services/settingsService';
import { processRecurringRules } from '@/src/data/services/RecurringTransactionEngine';
import { container } from '@/src/core/di/container';
import { dataEvents } from '@/src/core/events/dataEvents';
import { ThemeProvider, useThemeContext } from '@/src/theme/ThemeContext';
import { useTheme } from '@/src/theme/theme';
import { OnboardingScreen } from '@/src/features/onboarding/screens/OnboardingScreen';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { isDark } = useThemeContext();
  const { colors } = useTheme();

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="transaction/[id]"
          options={{
            title: 'Transaction Details',
            presentation: 'modal',
            headerBackTitle: '',
            headerLeft: () => (
              <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, marginLeft: -8 }}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            ),
          }}
        />
        <Stack.Screen name="about" options={{ headerShown: false }} />
        <Stack.Screen name="categories" options={{ headerShown: false }} />
        <Stack.Screen name="export" options={{ headerShown: false }} />
        <Stack.Screen name="help" options={{ headerShown: false }} />
        <Stack.Screen name="recurring-rules" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
      <AuthGate />
    </NavThemeProvider>
  );
}

function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        await runMigrations();
        await initializeSeedData();
        analyticsService.init(); // Init after migrations safe check

        // Process recurring transaction rules (idempotent)
        await processRecurringRules({
          recurringRepo: container.recurringTransactionRepository,
          transactionRepo: container.transactionRepository,
          walletRepo: container.walletRepository,
          eventBus: dataEvents,
        });

        // Sync i18n with persisted language preference
        const settings = await loadSettings();
        if (settings.language && settings.language !== i18n.language) {
          await i18n.changeLanguage(settings.language);
        }

        // Check if onboarding is needed
        if (!settings.onboardingCompleted) {
          setNeedsOnboarding(true);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsReady(true);
      }
    }
    bootstrap();
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SecurityProvider>
          {needsOnboarding ? (
            <OnboardingScreen onComplete={handleOnboardingComplete} />
          ) : (
            <RootNavigator />
          )}
        </SecurityProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
