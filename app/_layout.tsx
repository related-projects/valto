import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-get-random-values';
import 'react-native-reanimated';

import i18n from '@/src/localization/i18n';

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

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { isDark } = useThemeContext();

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
      <AuthGate />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        await runMigrations();
        const result = await initializeSeedData();
        console.log('Seed data initialized:', result);

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
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsReady(true);
      }
    }
    bootstrap();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SecurityProvider>
          <RootNavigator />
        </SecurityProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
