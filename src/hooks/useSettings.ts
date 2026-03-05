/**
 * useSettings Hook
 *
 * Provides all settings state and actions for the Settings screen.
 * Handles backup, restore, reset, theme, currency (with lock), language, and notifications.
 * All destructive operations use double confirmation.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { dataEvents } from '../core/events/dataEvents';
import { createAndShareBackup, pickAndRestoreBackup } from '../data/services/backupService';
import { setNotificationsEnabled } from '../data/services/notificationService';
import { resetAppData } from '../data/services/resetService';
import {
    type AppSettings,
    loadSettings,
    selectAndLockCurrency,
    type ThemePreference,
    updateSetting,
} from '../data/services/settingsService';
import { type CurrencyDefinition, getCurrencyByCode } from '../domain/constants/currencies';
import { getLanguageByCode, type LanguageDefinition } from '../domain/constants/languages';
import { useTheme } from '../theme/theme';

// ─── Interface ────────────────────────────────────────────────────────

export interface UseSettingsResult {
    /** Current app settings */
    settings: AppSettings;
    /** Current currency definition (symbol, code, name) */
    currency: CurrencyDefinition;
    /** Current language definition */
    language: LanguageDefinition;
    /** Whether currency is permanently locked */
    isCurrencyLocked: boolean;
    /** Create and share a backup file */
    createBackup: () => Promise<void>;
    /** Pick a file and restore from backup */
    restoreBackup: () => void;
    /** Reset all data with double confirmation */
    resetAllData: () => void;
    /** Change theme preference */
    changeTheme: () => void;
    /** Open currency picker (handled externally by modal) */
    handleCurrencySelect: (currency: CurrencyDefinition) => Promise<void>;
    /** Handle language selection */
    handleLanguageSelect: (language: LanguageDefinition) => Promise<void>;
    /** Toggle notifications */
    toggleNotifications: () => void;
    /** Whether any setting operation is in progress */
    loading: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────

export function useSettings(): UseSettingsResult {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<AppSettings>({
        theme: 'system',
        currency: 'USD',
        currencyLocked: false,
        notificationsEnabled: false,
        language: 'en',
    });
    const { setThemePreference } = useTheme();

    // Load persisted settings on mount
    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

    const currency = getCurrencyByCode(settings.currency);
    const language = getLanguageByCode(settings.language);

    // ── Backup ────────────────────────────────────────────────────────
    const createBackup = useCallback(async () => {
        try {
            setLoading(true);
            await createAndShareBackup();
        } catch (error) {
            Alert.alert('Backup Failed', 'Could not create backup. Please try again.');
            console.error('Backup error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Restore ───────────────────────────────────────────────────────
    const restoreBackup = useCallback(() => {
        Alert.alert(
            'Restore Data',
            'This will replace ALL your current data with the backup. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            'Are you absolutely sure?',
                            'All current wallets, transactions, categories, and budgets will be permanently replaced.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Restore Now',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            setLoading(true);
                                            const restored = await pickAndRestoreBackup();
                                            if (restored) {
                                                // Reload settings in case they were in the backup
                                                const newSettings = await loadSettings();
                                                setSettings(newSettings);
                                                setThemePreference(newSettings.theme);
                                                dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets', 'settings']);
                                                Alert.alert('Success', 'Your data has been restored successfully.');
                                            }
                                        } catch (error) {
                                            Alert.alert('Restore Failed', 'Could not restore from backup. The file may be invalid.');
                                            console.error('Restore error:', error);
                                        } finally {
                                            setLoading(false);
                                        }
                                    },
                                },
                            ],
                        );
                    },
                },
            ],
        );
    }, [setThemePreference]);

    // ── Reset ─────────────────────────────────────────────────────────
    const resetAllData = useCallback(() => {
        Alert.alert(
            'Reset All Data',
            'This will permanently delete ALL your wallets, transactions, categories, and budgets.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            'This is irreversible',
                            'All data will be deleted and the app will return to its initial state. This cannot be undone.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Delete Everything',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            setLoading(true);
                                            await resetAppData();
                                            const defaults = await loadSettings();
                                            setSettings(defaults);
                                            setThemePreference(defaults.theme);
                                            dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets', 'settings']);
                                            Alert.alert('Done', 'All data has been reset.');
                                        } catch (error) {
                                            Alert.alert('Reset Failed', 'Could not reset data. Please try again.');
                                            console.error('Reset error:', error);
                                        } finally {
                                            setLoading(false);
                                        }
                                    },
                                },
                            ],
                        );
                    },
                },
            ],
        );
    }, [setThemePreference]);

    // ── Theme ─────────────────────────────────────────────────────────
    const changeTheme = useCallback(() => {
        const options: ThemePreference[] = ['system', 'light', 'dark'];
        const THEME_LABELS: Record<string, string> = {
            system: 'System',
            light: 'Light',
            dark: 'Dark',
        };

        Alert.alert(
            'Choose Theme',
            undefined,
            [
                ...options.map(opt => ({
                    text: THEME_LABELS[opt] + (settings.theme === opt ? ' ✓' : ''),
                    onPress: async () => {
                        const updated = await updateSetting('theme', opt);
                        setSettings(updated);
                        setThemePreference(opt);
                    },
                })),
                { text: 'Cancel', style: 'cancel' },
            ],
        );
    }, [settings.theme, setThemePreference]);

    // ── Currency ──────────────────────────────────────────────────────
    const handleCurrencySelect = useCallback(async (selected: CurrencyDefinition) => {
        if (settings.currencyLocked) return;

        try {
            const updated = await selectAndLockCurrency(selected.code);
            setSettings(updated);
            dataEvents.emit('settings');
        } catch (error) {
            Alert.alert('Error', 'Could not update currency. Please try again.');
        }
    }, [settings.currencyLocked]);

    // ── Language ──────────────────────────────────────────────────────
    const handleLanguageSelect = useCallback(async (selected: LanguageDefinition) => {
        try {
            const updated = await updateSetting('language', selected.code);
            setSettings(updated);
            dataEvents.emit('settings');
        } catch (error) {
            Alert.alert('Error', 'Could not update language. Please try again.');
        }
    }, []);

    // ── Notifications ─────────────────────────────────────────────────
    const toggleNotifications = useCallback(async () => {
        const newValue = !settings.notificationsEnabled;
        await setNotificationsEnabled(newValue);
        setSettings(prev => ({ ...prev, notificationsEnabled: newValue }));
    }, [settings.notificationsEnabled]);

    return {
        settings,
        currency,
        language,
        isCurrencyLocked: settings.currencyLocked,
        createBackup,
        restoreBackup,
        resetAllData,
        changeTheme,
        handleCurrencySelect,
        handleLanguageSelect,
        toggleNotifications,
        loading,
    };
}
