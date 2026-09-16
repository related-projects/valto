/**
 * useSettings Hook
 *
 * Provides all settings state and actions for the Settings screen.
 * Handles backup, restore, reset, theme, currency (with lock + reset),
 * language (with i18n sync), notifications (with permissions), and regional settings.
 * All destructive operations use double confirmation.
 */

import i18n from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, type AppStateStatus, Linking } from 'react-native';
import { dataEvents } from '../core/events/dataEvents';
import { createAndShareBackup, pickAndRestoreBackup, type RestoreOutcome, SnapshotRejectedError } from '../data/services/backupService';
import { getPermissionStatus, scheduleDailyReminder, setNotificationsEnabled } from '../data/services/notificationService';
import { resetAppData, resetFinancialDataForCurrencyReset } from '../data/services/resetService';
import {
    type AppSettings,
    type DateFormatPreference,
    type DecimalSeparator,
    type FirstDayOfWeek,
    loadSettings,
    selectAndLockCurrency,
    type ThemePreference,
    updateSetting,
} from '../data/services/settingsService';
import { type CurrencyDefinition, getCurrencyByCode } from '../domain/constants/currencies';
import { getLanguageByCode, type LanguageDefinition } from '../domain/constants/languages';
import { DEFAULT_NUMBER_FORMAT, NUMBER_FORMAT_PROFILES } from '../domain/constants/numberFormats';
import { useTheme } from '../theme/theme';
import { type NotificationPermissionStatus, shouldShowBlockedNotice } from '../utils/notificationPermission';

/** Minimal shape of the i18next `t` this file uses. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * What the user is told after a successful restore.
 *
 * The restore replaces the ledger and then runs the recurring engine once, so
 * there are three things it can have to say and they are one message, not a
 * queue of alerts:
 *  - the catch-up ran and there is nothing to report -> the plain confirmation;
 *  - it generated transactions, or left standing orders it could not run ->
 *    both counts, so a user whose rules stopped arriving knows why;
 *  - the catch-up itself failed -> the restore still succeeded, and the rules
 *    are retried on the next launch.
 *
 * Counts only. Rule ids and amounts stay out of an alert.
 */
function restoreSuccessMessage(t: Translate, outcome: RestoreOutcome): string {
    if (outcome.catchUpFailed) {
        return t('alerts.restoreSuccessRulesFailedMessage');
    }

    if (outcome.catchUpGenerated > 0 || outcome.rulesNotProcessed > 0) {
        return t('alerts.restoreSuccessWithRulesMessage', {
            generated: outcome.catchUpGenerated,
            unprocessed: outcome.rulesNotProcessed,
        });
    }

    return t('alerts.restoreSuccessMessage');
}

// ─── Interface ────────────────────────────────────────────────────────

export interface UseSettingsResult {
    settings: AppSettings;
    currency: CurrencyDefinition;
    language: LanguageDefinition;
    isCurrencyLocked: boolean;
    isResettingCurrency: boolean;
    createBackup: () => Promise<void>;
    restoreBackup: () => void;
    resetAllData: () => void;
    changeTheme: () => void;
    handleCurrencySelect: (currency: CurrencyDefinition) => Promise<void>;
    handleLanguageSelect: (language: LanguageDefinition) => Promise<void>;
    toggleNotifications: () => void;
    /** Derived, never persisted: show the "blocked in device settings" notice. */
    notificationsBlockedNotice: boolean;
    openNotificationSettings: () => void;
    resetCurrency: () => void;
    cancelCurrencyReset: () => void;
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
        decimalSeparator: DEFAULT_NUMBER_FORMAT,
        onboardingCompleted: false,
    });
    // Derived state only, never persisted: the OS permission status exists here
    // solely to drive the "blocked" notice under the toggle. Starts at
    // 'undetermined' so a fresh mount shows no notice until the real value lands.
    const [notificationPermission, setNotificationPermission] =
        useState<NotificationPermissionStatus>('undetermined');
    // Tracks the previous AppState so the listener below fires only on the
    // transition into 'active', not on every event.
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const { setThemePreference } = useTheme();

    // Load persisted settings on mount
    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

    // READ ONLY - reading the status can never raise a system dialog, so this is
    // safe to run on mount and after every toggle.
    const refreshNotificationPermission = useCallback(async () => {
        try {
            setNotificationPermission(await getPermissionStatus());
        } catch (error) {
            console.warn('[notifications] Permission status read failed:', error);
        }
    }, []);

    useEffect(() => {
        refreshNotificationPermission();
    }, [refreshNotificationPermission]);

    // Re-read on foreground return. openNotificationSettings backgrounds the app
    // without unmounting this screen, so a user who grants the permission in the
    // system settings comes back to a mount read that never re-runs - the notice
    // would keep saying "blocked" and the action we offered would look broken.
    //
    // Only on the transition INTO 'active' from a non-active state: AppState also
    // fires for 'inactive' and 'background', and re-reading on those is pointless
    // work. READ ONLY, so a return from the background can never raise a dialog.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            const previousState = appStateRef.current;
            appStateRef.current = nextState;

            if (previousState !== 'active' && nextState === 'active') {
                refreshNotificationPermission();
            }
        });

        return () => subscription.remove();
    }, [refreshNotificationPermission]);

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
                                                // The restored language is applied here for the same
                                                // reason the theme is: the blob was written verbatim,
                                                // and nothing else re-reads it until the next cold
                                                // boot. Leaving it meant a restore that visibly
                                                // changed the theme left the app talking in the
                                                // previous language until the process restarted.
                                                if (newSettings.language && newSettings.language !== i18n.language) {
                                                    await i18n.changeLanguage(newSettings.language);
                                                }
                                                // 'recurringRules' belongs here: a v2 file replaces
                                                // the whole rules table, and the catch-up the restore
                                                // just ran moved the watermarks it touched.
                                                dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets', 'recurringRules', 'settings']);
                                                // The restore ran the recurring engine once it had
                                                // committed. Counts only - a standing order that did
                                                // not execute is something the user has to be told
                                                // about, and it used to be told to nobody.
                                                Alert.alert(
                                                    t('alerts.restoreSuccess'),
                                                    restoreSuccessMessage(t, restored),
                                                );
                                            }
                                        } catch (error) {
                                            // A refused backup gets its own copy: "the file may be
                                            // invalid" does not tell a user whose backup predates
                                            // the currency field what is actually wrong with it.
                                            // Both currency reasons share this message - the reasons
                                            // differ for diagnostics, the user's situation does not.
                                            const currencyRefusal =
                                                error instanceof SnapshotRejectedError &&
                                                (error.reason === 'missingCurrency' || error.reason === 'unknownCurrency');
                                            const message = currencyRefusal
                                                ? t('alerts.restoreMissingCurrencyMessage')
                                                : t('alerts.restoreFailedMessage');
                                            Alert.alert(t('alerts.restoreFailed'), message);
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
                            // Distinct keys from the currency reset below, which
                            // still shares alerts.resetIrreversible and
                            // alerts.deleteEverything. This dialog deletes data
                            // and keeps the settings, so it says so; the currency
                            // reset makes a different promise.
                            t('alerts.deleteDataIrreversible'),
                            t('alerts.resetIrreversibleMessage'),
                            [
                                { text: t('alerts.cancel'), style: 'cancel' },
                                {
                                    text: t('alerts.deleteDataConfirm'),
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
        if (isResettingCurrency) {
            // Picking the current currency changes nothing - cancel the reset, wipe nothing.
            if (selected.code === settings.currency) {
                setIsResettingCurrency(false);
                setSettings(prev => ({ ...prev, currencyLocked: true }));
                return;
            }

            // Final irreversible confirmation before erasing all financial data.
            Alert.alert(
                t('alerts.resetIrreversible'),
                t('alerts.resetCurrencyIrreversibleMessage', { code: selected.code }),
                [
                    {
                        text: t('alerts.cancel'),
                        style: 'cancel',
                        onPress: () => {
                            setIsResettingCurrency(false);
                            setSettings(prev => ({ ...prev, currencyLocked: true }));
                        },
                    },
                    {
                        text: t('alerts.deleteEverything'),
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                setLoading(true);
                                const updated = await resetFinancialDataForCurrencyReset(selected.code);
                                setSettings(updated);
                                setIsResettingCurrency(false);
                                Alert.alert(
                                    t('alerts.resetCurrencySuccess'),
                                    t('alerts.resetCurrencySuccessMessage', { code: selected.code }),
                                );
                            } catch (error) {
                                console.error('Currency reset error:', error);
                                setIsResettingCurrency(false);
                                setSettings(prev => ({ ...prev, currencyLocked: true }));
                                Alert.alert(t('alerts.error'), t('alerts.resetCurrencyFailed'));
                            } finally {
                                setLoading(false);
                            }
                        },
                    },
                ],
            );
            return;
        }

        // First-time selection (currency not yet locked).
        if (selected.code === settings.currency && settings.currencyLocked) return;
        try {
            if (settings.currencyLocked) return;
            const updated = await selectAndLockCurrency(selected.code);
            setSettings(updated);
            dataEvents.emit('settings');
        } catch (error) {
            console.error('Currency update error:', error);
            Alert.alert(t('alerts.error'), t('alerts.errorCurrency'));
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
                        // Arm the reset so the next currency pick routes through the
                        // destructive wipe path; unlock locally to reveal the picker.
                        setIsResettingCurrency(true);
                        setSettings(prev => ({ ...prev, currencyLocked: false }));
                    },
                },
            ],
        );
    }, [settings.currencyLocked, t]);

    // Abandon an armed currency reset (e.g. the user dismissed the picker). Re-locks
    // the currency and touches no data. No-op when not currently resetting.
    const cancelCurrencyReset = useCallback(() => {
        if (!isResettingCurrency) return;
        setIsResettingCurrency(false);
        setSettings(prev => ({ ...prev, currencyLocked: true }));
    }, [isResettingCurrency]);

    // ── Language ──────────────────────────────────────────────────────
    const handleLanguageSelect = useCallback(async (selected: LanguageDefinition) => {
        try {
            const updated = await updateSetting('language', selected.code);
            setSettings(updated);
            // Sync i18n immediately
            await i18n.changeLanguage(selected.code);

            // Refresh the pending reminder so its copy follows the new language -
            // a reminder written in a language the user just told us they do not
            // read defeats its own purpose. No-op when notifications are off, and
            // idempotent when they are on. Its own catch: a scheduling failure is
            // not a language failure and must not claim to be one.
            try {
                await scheduleDailyReminder();
            } catch (reminderError) {
                console.warn('[notifications] Reminder reschedule after language change failed:', reminderError);
            }

            dataEvents.emit('settings');
        } catch (error) {
            Alert.alert(t('alerts.error'), t('alerts.errorLanguage'));
        }
    }, [t]);

    // ── Notifications ─────────────────────────────────────────────────
    const toggleNotifications = useCallback(async () => {
        const newValue = !settings.notificationsEnabled;
        const result = await setNotificationsEnabled(newValue);

        // Enabling may have just moved the OS status from 'undetermined' to
        // 'granted' or 'denied', and the notice below the toggle derives from it.
        await refreshNotificationPermission();

        if (result.permissionDenied) {
            Alert.alert(t('alerts.notificationsDenied'), t('alerts.notificationsDeniedMessage'));
            return;
        }

        setSettings(prev => ({ ...prev, notificationsEnabled: result.enabled }));
    }, [settings.notificationsEnabled, refreshNotificationPermission, t]);

    // Once the OS holds a denial there is no in-app way to clear it - only the user
    // can, in the system settings for this app.
    const openNotificationSettings = useCallback(() => {
        Linking.openSettings().catch(error => {
            console.warn('[notifications] Could not open the system settings:', error);
        });
    }, []);

    const notificationsBlockedNotice = shouldShowBlockedNotice(
        settings.notificationsEnabled,
        notificationPermission,
    );

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
        const options: DecimalSeparator[] = NUMBER_FORMAT_PROFILES;

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
        isResettingCurrency,
        createBackup,
        restoreBackup,
        resetAllData,
        changeTheme,
        handleCurrencySelect,
        handleLanguageSelect,
        toggleNotifications,
        notificationsBlockedNotice,
        openNotificationSettings,
        resetCurrency,
        cancelCurrencyReset,
        changeDateFormat,
        changeFirstDayOfWeek,
        changeDecimalSeparator,
        loading,
    };
}
