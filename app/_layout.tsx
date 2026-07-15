import { SecurityGate } from "@/src/components/security/SecurityGate";
import { container, getUseCaseDeps } from "@/src/core/di/container";
import { ErrorBoundary } from "@/src/core/error/ErrorBoundary";
import { dataEvents } from "@/src/core/events/dataEvents";
import { SecurityProvider } from "@/src/core/security/SecurityContext";
import { runMigrations } from "@/src/data/migrations";
import { initializeSeedData } from "@/src/data/seed";
import { processRecurringRules } from "@/src/data/services/RecurringTransactionEngine";
import { loadSettings } from "@/src/data/services/settingsService";
import { resetCorruptedStore } from "@/src/data/services/storeRecoveryService";
import { assertStoreReadable } from "@/src/data/storage/sql/database";
import { verifyFinancialIntegrity } from "@/src/domain/useCases";
import { OnboardingScreen } from "@/src/features/onboarding/screens/OnboardingScreen";
import { StoreRecoveryScreen } from "@/src/screens/StoreRecoveryScreen";
import { ThemeProvider, useThemeContext } from "@/src/theme/ThemeContext";
import { useTheme } from "@/src/theme/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "@react-navigation/native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { TouchableOpacity } from "react-native";
import "react-native-get-random-values";
import "react-native-reanimated";

import i18n from "@/src/localization/i18n";
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn:
    process.env.EXPO_PUBLIC_SENTRY_DSN ||
    "https://placeholder@sentry.io/placeholder",
  debug: false,
});

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootNavigator() {
  const { isDark } = useThemeContext();
  const { colors } = useTheme();

  // True gate: while locked, SecurityGate renders the lock screen INSTEAD of the
  // navigator, so the authenticated screens never mount and their data hooks
  // never read financial data. (Bootstrap/migrations ran earlier in RootLayout,
  // outside the gate.)
  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <SecurityGate>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="transaction/[id]"
            options={{
              title: "Transaction Details",
              presentation: "modal",
              headerBackTitle: "",
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={{ padding: 8, marginLeft: -8 }}
                >
                  <Ionicons name="close" size={24} color={colors.foreground} />
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen name="about" options={{ headerShown: false }} />
          <Stack.Screen name="categories" options={{ headerShown: false }} />
          <Stack.Screen name="export" options={{ headerShown: false }} />
          <Stack.Screen name="help" options={{ headerShown: false }} />
          <Stack.Screen
            name="recurring-rules"
            options={{ headerShown: false }}
          />
        </Stack>
        <StatusBar style="auto" />
      </SecurityGate>
    </NavThemeProvider>
  );
}

function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  // Boot-failure gate: when the store is unreadable (DB init / migration error,
  // or the health-check read throws) we render StoreRecoveryScreen INSTEAD of
  // the authenticated tree, so the corrupted store is never queried by the data
  // hooks (which would retry into out-of-memory). XOR with the normal tree, same
  // discipline as SecurityGate.
  const [bootError, setBootError] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const bootstrap = useCallback(async () => {
    setIsReady(false);
    setBootError(false);
    try {
      await runMigrations();
      await initializeSeedData();

      // Fast health check: a corrupted/undecryptable SQLCipher file can pass
      // `PRAGMA cipher_version` and let init + migrations succeed, only failing
      // later as repeated read errors inside the data hooks. One trivial read
      // against a core table surfaces that here, BEFORE the data hooks mount.
      await assertStoreReadable();

      // Process recurring transaction rules (idempotent)
      await processRecurringRules({
        recurringRepo: container.recurringTransactionRepository,
        transactionRepo: container.transactionRepository,
        walletRepo: container.walletRepository,
        eventBus: dataEvents,
        runInTransaction: getUseCaseDeps().runInTransaction,
      });

      // Sync i18n with persisted language preference
      const settings = await loadSettings();
      if (settings.language && settings.language !== i18n.language) {
        await i18n.changeLanguage(settings.language);
      }

      // Check if onboarding is needed
      setNeedsOnboarding(!settings.onboardingCompleted);

      // Dev-only, non-blocking, non-fatal balance-integrity assertion.
      // Dead-stripped from release builds. Reconciles every wallet's stored
      // balance against its ledger via the authoritative domain use case.
      if (__DEV__) {
        try {
          const ok = await verifyFinancialIntegrity(getUseCaseDeps());
          if (!ok) {
            const msg =
              "[integrity] Wallet balance drift detected at boot — stored balances do not reconcile with their transaction ledgers.";
            console.warn(msg);
            Sentry.captureMessage(msg, "warning");
          }
        } catch (integrityErr) {
          console.warn(
            "[integrity] Boot integrity check failed to run:",
            integrityErr,
          );
        }
      }
    } catch (error) {
      console.error("Failed to initialize app:", error);
      if (!__DEV__) {
        Sentry.captureException(error);
      }
      setBootError(true);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const handleOnboardingComplete = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  const handleReset = useCallback(async () => {
    setRecovering(true);
    try {
      // Filesystem-level wipe (the store may be unopenable), then re-run the
      // normal init path to rebuild a fresh encrypted DB.
      await resetCorruptedStore();
      await bootstrap();
    } catch (error) {
      console.error("Store reset failed:", error);
      if (!__DEV__) {
        Sentry.captureException(error);
      }
      setBootError(true);
    } finally {
      setRecovering(false);
    }
  }, [bootstrap]);

  if (!isReady) {
    return null;
  }

  if (bootError) {
    return (
      <ErrorBoundary>
        <ThemeProvider>
          <StoreRecoveryScreen
            busy={recovering}
            onRetry={bootstrap}
            onReset={handleReset}
          />
        </ThemeProvider>
      </ErrorBoundary>
    );
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

export { RootLayout };

export default Sentry.wrap(RootLayout);
