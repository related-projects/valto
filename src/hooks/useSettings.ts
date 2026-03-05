/**
 * useSettings Hook
 *
 * Provides all settings state and actions for the Settings screen.
 * Handles backup, restore, reset, theme, currency (with lock + reset),
 * language (with i18n sync), notifications (with permissions), and regional settings.
 * All destructive operations use double confirmation.
 */

import i18n from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { dataEvents } from '../core/events/dataEvents';
import { createAndShareBackup, pickAndRestoreBackup } from '../data/services/backupService';
import { setNotificationsEnabled } from '../data/services/notificationService';
import { resetAppData } from '../data/services/resetService';
import {
    type AppSettings,
    type DateFormatPreference,
    type DecimalSeparator,
    type FirstDayOfWeek,
    loadSettings,
    selectAndLockCurrency,
    type ThemePreference,
    unlockAndResetCurrency,
    updateSetting,
} from '../data/services/settingsService';
import { type CurrencyDefinition, getCurrencyByCode } from '../domain/constants/currencies';
import { getLanguageByCode, type LanguageDefinition } from '../domain/constants/languages';
import { useTheme } from '../theme/theme';

// ─── Interface ────────────────────────────────────────────────────────

export interface UseSettingsResult {
    settings: AppSettings;
    currency: CurrencyDefinition;
    language: LanguageDefinition;
    isCurrencyLocked: boolean;
    createBackup: () => Promise<void>;
    restoreBackup: () => void;
    resetAllData: () => void;
    changeTheme: () => void;
    handleCurrencySelect: (currency: CurrencyDefinition) => Promise<void>;
    handleLanguageSelect: (language: LanguageDefinition) => Promise<void>;
    toggleNotifications: () => void;
    resetCurrency: () => void;
    changeDateFormat: () => void;
    changeFirstDayOfWeek: () => void;
    changeDecimalSeparator: () => void;
    loading: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────

export function useSettings(): UseSettingsResult {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [isResettingCurrency, setIsResettingCurrency] = useState(false);
    const [settings, setSettings] = useState<AppSettings>({
        theme: 'system',
        currency: 'USD',
        currencyLocked: false,
        notificationsEnabled: false,
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        firstDayOfWeek: 'monday',
        decimalSeparator: 'dot',
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
            Alert.alert(t('alerts.backupFailed'), t('alerts.backupFailedMessage'));
            console.error('Backup error:', error);
        } finally {
            setLoading(false);
        }
    }, [t]);

    // ── Restore ───────────────────────────────────────────────────────
    const restoreBackup = useCallback(() => {
        Alert.alert(
            t('alerts.restoreData'),
            t('alerts.restoreDataMessage'),
            [
                { text: t('alerts.cancel'), style: 'cancel' },
                {
                    text: t('alerts.continue'),
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            t('alerts.restoreConfirm'),
                            t('alerts.restoreConfirmMessage'),
                            [
                                { text: t('alerts.cancel'), style: 'cancel' },
                                {
                                    text: t('alerts.restoreNow'),
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            setLoading(true);
                                            const restored = await pickAndRestoreBackup();
                                            if (restored) {
                                                const newSettings = await loadSettings();
                                                setSettings(newSettings);
                                                setThemePreference(newSettings.theme);
                                                dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets', 'settings']);
                                                Alert.alert(t('alerts.restoreSuccess'), t('alerts.restoreSuccessMessage'));
                                            }
                                        } catch (error) {
                                            Alert.alert(t('alerts.restoreFailed'), t('alerts.restoreFailedMessage'));
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
    }, [setThemePreference, t]);

    // ── Reset ─────────────────────────────────────────────────────────
    const resetAllData = useCallback(() => {
        Alert.alert(
            t('alerts.resetAllData'),
            t('alerts.resetAllDataMessage'),
            [
                { text: t('alerts.cancel'), style: 'cancel' },
                {
                    text: t('alerts.continue'),
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            t('alerts.resetIrreversible'),
                            t('alerts.resetIrreversibleMessage'),
                            [
                                { text: t('alerts.cancel'), style: 'cancel' },
                                {
                                    text: t('alerts.deleteEverything'),
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            setLoading(true);
                                            await resetAppData();
                                            const defaults = await loadSettings();
                                            setSettings(defaults);
                                            setThemePreference(defaults.theme);
                                            dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets', 'settings']);
                                            Alert.alert(t('alerts.resetDone'), t('alerts.resetDoneMessage'));
                                        } catch (error) {
                                            Alert.alert(t('alerts.resetFailed'), t('alerts.resetFailedMessage'));
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
    }, [setThemePreference, t]);

    // ── Theme ─────────────────────────────────────────────────────────
    const changeTheme = useCallback(() => {
        const options: ThemePreference[] = ['system', 'light', 'dark'];

        Alert.alert(
            t('alerts.chooseTheme'),
            undefined,
            [
                ...options.map(opt => ({
                    text: t(`settings.theme${opt.charAt(0).toUpperCase() + opt.slice(1)}`) + (settings.theme === opt ? ' ✓' : ''),
                    onPress: async () => {
                        const updated = await updateSetting('theme', opt);
                        setSettings(updated);
                        setThemePreference(opt);
                    },
                })),
                { text: t('alerts.cancel'), style: 'cancel' },
            ],
        );
    }, [settings.theme, setThemePreference, t]);

    // ── Currency ──────────────────────────────────────────────────────
    const handleCurrencySelect = useCallback(async (selected: CurrencyDefinition) => {
        // Same-currency guard — skip no-op
        if (selected.code === settings.currency && settings.currencyLocked) {
            setIsResettingCurrency(false);
            return;
        }

        try {
            let updated: AppSettings;

            if (isResettingCurrency) {
                // Use unlockAndResetCurrency to bypass the lock check
                updated = await unlockAndResetCurrency(selected.code);
                setIsResettingCurrency(false);
            } else {
                if (settings.currencyLocked) return;
                updated = await selectAndLockCurrency(selected.code);
            }

            setSettings(updated);
            dataEvents.emit('settings');
        } catch (error) {
            console.error('Currency update error:', error);
            Alert.alert(t('alerts.error'), t('alerts.errorCurrency'));
            setIsResettingCurrency(false);
        }
    }, [settings.currencyLocked, settings.currency, isResettingCurrency, t]);

    // ── Currency Reset ────────────────────────────────────────────────
    const resetCurrency = useCallback(() => {
        if (!settings.currencyLocked) return;

        Alert.alert(
            t('alerts.resetCurrency'),
            t('alerts.resetCurrencyMessage'),
            [
                { text: t('alerts.cancel'), style: 'cancel' },
                {
                    text: t('alerts.continue'),
                    style: 'destructive',
                    onPress: () => {
                        // Mark as resetting so handleCurrencySelect uses unlockAndResetCurrency
                        setIsResettingCurrency(true);
                        // Temporarily show picker by unlocking in local state only
                        setSettings(prev => ({ ...prev, currencyLocked: false }));
                    },
                },
            ],
        );
    }, [settings.currencyLocked, t]);

    // ── Language ──────────────────────────────────────────────────────
    const handleLanguageSelect = useCallback(async (selected: LanguageDefinition) => {
        try {
            const updated = await updateSetting('language', selected.code);
            setSettings(updated);
            // Sync i18n immediately
            await i18n.changeLanguage(selected.code);
            dataEvents.emit('settings');
        } catch (error) {
            Alert.alert(t('alerts.error'), t('alerts.errorLanguage'));
        }
    }, [t]);

    // ── Notifications ─────────────────────────────────────────────────
    const toggleNotifications = useCallback(async () => {
        const newValue = !settings.notificationsEnabled;
        const result = await setNotificationsEnabled(newValue);

        if (result.permissionDenied) {
            Alert.alert(t('alerts.notificationsDenied'), t('alerts.notificationsDeniedMessage'));
            return;
        }

        setSettings(prev => ({ ...prev, notificationsEnabled: result.enabled }));
    }, [settings.notificationsEnabled, t]);

    // ── Date Format ───────────────────────────────────────────────────
    const changeDateFormat = useCallback(() => {
        const options: DateFormatPreference[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

        Alert.alert(
            t('settings.dateFormat'),
            undefined,
            [
                ...options.map(opt => ({
                    text: opt + (settings.dateFormat === opt ? ' ✓' : ''),
                    onPress: async () => {
                        const updated = await updateSetting('dateFormat', opt);
                        setSettings(updated);
                        dataEvents.emit('settings');
                    },
                })),
                { text: t('alerts.cancel'), style: 'cancel' },
            ],
        );
    }, [settings.dateFormat, t]);

    // ── First Day of Week ─────────────────────────────────────────────
    const changeFirstDayOfWeek = useCallback(() => {
        const options: FirstDayOfWeek[] = ['monday', 'sunday'];

        Alert.alert(
            t('settings.firstDayOfWeek'),
            undefined,
            [
                ...options.map(opt => ({
                    text: t(`settings.${opt}`) + (settings.firstDayOfWeek === opt ? ' ✓' : ''),
                    onPress: async () => {
                        const updated = await updateSetting('firstDayOfWeek', opt);
                        setSettings(updated);
                        dataEvents.emit('settings');
                    },
                })),
                { text: t('alerts.cancel'), style: 'cancel' },
            ],
        );
    }, [settings.firstDayOfWeek, t]);

    // ── Decimal Separator ─────────────────────────────────────────────
    const changeDecimalSeparator = useCallback(() => {
        const options: DecimalSeparator[] = ['dot', 'comma'];

        Alert.alert(
            t('settings.decimalSeparator'),
            undefined,
            [
                ...options.map(opt => ({
                    text: t(`settings.${opt}`) + (settings.decimalSeparator === opt ? ' ✓' : ''),
                    onPress: async () => {
                        const updated = await updateSetting('decimalSeparator', opt);
                        setSettings(updated);
                        dataEvents.emit('settings');
                    },
                })),
                { text: t('alerts.cancel'), style: 'cancel' },
            ],
        );
    }, [settings.decimalSeparator, t]);

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
        resetCurrency,
        changeDateFormat,
        changeFirstDayOfWeek,
        changeDecimalSeparator,
        loading,
    };
}
