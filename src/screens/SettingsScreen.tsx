import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SecuritySetupModal } from '../components/security/SecuritySetupModal';
import { CurrencyPickerModal } from '../components/settings/CurrencyPickerModal';
import { LanguagePickerModal } from '../components/settings/LanguagePickerModal';
import { MonthStartDayPickerModal } from '../components/settings/MonthStartDayPickerModal';
import { OptionPickerModal, type PickerOption } from '../components/settings/OptionPickerModal';
import { fabTopOffset } from '../components/navigation/tabBarMetrics';
import { IconBadge } from '../components/ui/IconBadge';
import { ListItem } from '../components/ui/ListItem';
import { SectionHeader } from '../components/ui/SectionHeader';
import { useSecurity } from '../core/security/SecurityContext';
import type { DateFormatPreference, ThemePreference } from '../data/services/settingsService';
import { toPeriodStartDay } from '../domain/period';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../theme/theme';
import { getButtonA11y } from '../utils/accessibility';

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * The same source the About screen reads, so the two rows cannot disagree: the
 * running binary, through expo-application. `null` where the platform reports
 * nothing, in which case the row simply carries no subtitle.
 */
const APP_VERSION = Application.nativeApplicationVersion;

/** The themes the theme picker offers, in order (REGISTRE C43). */
const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

/** The date formats the date-format picker offers, in order (REGISTRE C43). */
const DATE_FORMAT_OPTIONS: DateFormatPreference[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

/** settings.themeSystem / themeLight / themeDark. */
const themeLabelKey = (theme: ThemePreference): string =>
    `settings.theme${theme.charAt(0).toUpperCase() + theme.slice(1)}`;

export const SettingsScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const {
        settings,
        currency,
        language,
        isCurrencyLocked,
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
        changeMonthStartDay,
        changeDecimalSeparator,
        loading,
    } = useSettings();
    const { isSecurityEnabled, securityConfig, biometrics, disableSecurity } = useSecurity();
    const [securitySetupVisible, setSecuritySetupVisible] = useState(false);
    const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
    const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
    const [monthStartPickerVisible, setMonthStartPickerVisible] = useState(false);
    // Theme and date format were Alerts of three options plus Cancel; Android
    // draws at most three Alert buttons, so Cancel was lost (REGISTRE C43).
    const [themePickerVisible, setThemePickerVisible] = useState(false);
    const [dateFormatPickerVisible, setDateFormatPickerVisible] = useState(false);

    // Security subtitle
    const securitySubtitle = isSecurityEnabled
        ? (securityConfig?.biometricsEnabled ? t('settings.securityPinBiometrics') : t('settings.securityPin'))
        : t('settings.securityOff');

    // Theme label
    const themeLabel = t(themeLabelKey(settings.theme));

    const themeOptions: PickerOption<ThemePreference>[] = THEME_OPTIONS.map((theme) => ({
        value: theme,
        label: t(themeLabelKey(theme)),
        testID: `theme_picker_option_${theme}`,
    }));

    const dateFormatOptions: PickerOption<DateFormatPreference>[] = DATE_FORMAT_OPTIONS.map((format) => ({
        value: format,
        label: format,
        testID: `date_format_picker_option_${format.replace(/\W/g, '_').toLowerCase()}`,
    }));

    const handleSecurityPress = useCallback(() => {
        if (isSecurityEnabled) {
            Alert.alert(
                t('alerts.disableSecurity'),
                t('alerts.disableSecurityMessage'),
                [
                    { text: t('alerts.cancel'), style: 'cancel' },
                    {
                        text: t('alerts.disable'),
                        style: 'destructive',
                        onPress: () => disableSecurity(),
                    },
                ],
            );
        } else {
            setSecuritySetupVisible(true);
        }
    }, [isSecurityEnabled, disableSecurity, t]);

    const handleCurrencyPress = useCallback(() => {
        if (isCurrencyLocked) {
            Alert.alert(t('alerts.currencyLocked'), t('alerts.currencyLockedMessage'));
            return;
        }
        setCurrencyPickerVisible(true);
    }, [isCurrencyLocked, t]);

    const onCurrencySelected = useCallback(async (selected: any) => {
        await handleCurrencySelect(selected);
        setCurrencyPickerVisible(false);
    }, [handleCurrencySelect]);

    // Date format display label
    const dateFormatLabel = settings.dateFormat;
    const decimalLabel = t(`settings.${settings.decimalSeparator}`);
    // REGISTRE C20: the day the user's month starts on, 1 when none is stored.
    const monthStartDay = toPeriodStartDay(settings.monthStartDay);

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingTop: insets.top + spacing.md,
                // Room for the tab bar and the "+" button drawn over the list's
                // end, at this device's bottom inset: the last row (About) must
                // end above the "+" (REGISTRE C47).
                paddingBottom: fabTopOffset(insets.bottom),
                paddingHorizontal: spacing.md,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* Screen Title */}
            <Text style={[styles.title, { color: colors.foreground, fontSize: typography.sizes['2xl'] }]}>
                {t('settings.title')}
            </Text>

            {/* Loading Indicator */}
            {loading && (
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: spacing.md,
                    padding: spacing.sm,
                    backgroundColor: colors.accent,
                    borderRadius: radius.md,
                }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginLeft: spacing.sm }}>
                        {t('settings.processing')}
                    </Text>
                </View>
            )}

            {/* References */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title={t('settings.sections.references')} />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title={t('settings.currency')}
                        subtitle={isCurrencyLocked
                            ? t('settings.currencyLocked', { symbol: currency.symbol, code: currency.code })
                            : t('settings.currencyUnlocked', { symbol: currency.symbol, code: currency.code })}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cash-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron={!isCurrencyLocked}
                        onPress={handleCurrencyPress}
                        testID="settings_currency_item"
                    />
                    <ListItem
                        title={t('settings.language')}
                        subtitle={language.nativeName}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="language-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => setLanguagePickerVisible(true)}
                        accessibilityLabel={t('a11y.selectLanguage')}
                        testID="settings_language_item"
                    />
                    <ListItem
                        title={t('settings.theme')}
                        subtitle={themeLabel}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="color-palette-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => setThemePickerVisible(true)}
                        testID="settings_theme_item"
                    />
                </View>
            </View>

            {/* App Settings */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title={t('settings.sections.appSettings')} />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title={t('settings.categories')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="grid-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/categories')}
                    />
                    <ListItem
                        title={t('settings.notifications')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="notifications-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron={false}
                        rightIcon={
                            <Switch
                                value={settings.notificationsEnabled}
                                onValueChange={toggleNotifications}
                                trackColor={{ false: colors.muted, true: colors.primary }}
                                testID="settings_notifications_switch"
                            />
                        }
                    />
                    {/* Shown only when the OS holds an explicit denial. Never for
                        'undetermined' - never asked is a normal state, not a fault. */}
                    {notificationsBlockedNotice && (
                        <View
                            testID="settings_notifications_blocked_notice"
                            style={{
                                backgroundColor: colors.warningBackground,
                                borderRadius: radius.md,
                                paddingHorizontal: spacing.md,
                                paddingVertical: spacing.sm,
                                marginBottom: spacing.sm,
                            }}
                        >
                            <Text style={{
                                color: colors.warningText,
                                fontSize: typography.sizes.xs,
                                lineHeight: 18,
                            }}>
                                {t('settings.notificationsBlockedNotice')}
                            </Text>
                            <TouchableOpacity
                                onPress={openNotificationSettings}
                                style={{ marginTop: spacing.xs }}
                                testID="settings_notifications_blocked_action"
                                {...getButtonA11y(t('settings.notificationsBlockedAction'))}
                            >
                                <Text style={{
                                    color: colors.warningText,
                                    fontSize: typography.sizes.xs,
                                    fontWeight: '600',
                                }}>
                                    {t('settings.notificationsBlockedAction')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <ListItem
                        title={t('settings.security')}
                        subtitle={securitySubtitle}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="lock-closed-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={handleSecurityPress}
                        testID="settings_security_item"
                    />
                    <ListItem
                        title={t('recurring.title')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="repeat-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/recurring-rules')}
                        testID="settings_recurring_item"
                    />
                </View>
            </View>

            {/* Regional */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title={t('settings.sections.regional')} />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title={t('settings.dateFormat')}
                        subtitle={dateFormatLabel}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="calendar-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => setDateFormatPickerVisible(true)}
                        testID="settings_date_format_item"
                    />
                    <ListItem
                        title={t('settings.decimalSeparator')}
                        subtitle={decimalLabel}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="code-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={changeDecimalSeparator}
                    />
                </View>
            </View>

            {/* Budget */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title={t('settings.sections.budget')} />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title={t('settings.monthStartDay')}
                        subtitle={t('settings.monthStartDayValue', { day: monthStartDay })}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="calendar-number-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => setMonthStartPickerVisible(true)}
                        testID="settings_month_start_item"
                    />
                    <Text
                        testID="settings_month_start_helper"
                        style={{
                            color: colors.mutedForeground,
                            fontSize: typography.sizes.xs,
                            lineHeight: 18,
                            paddingBottom: spacing.sm,
                        }}
                    >
                        {t('settings.monthStartDayHelper')}
                    </Text>
                    {/* 29-31 start on the last day of a shorter month. */}
                    {monthStartDay >= 29 && (
                        <Text
                            testID="settings_month_start_short_months_note"
                            style={{
                                color: colors.mutedForeground,
                                fontSize: typography.sizes.xs,
                                lineHeight: 18,
                                paddingBottom: spacing.sm,
                            }}
                        >
                            {t('settings.monthStartDayShortMonths')}
                        </Text>
                    )}
                </View>
            </View>

            {/* Data Management */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title={t('settings.sections.dataManagement')} />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title={t('export.title')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="download-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/export')}
                        testID="settings_export_item"
                    />
                    <ListItem
                        title={t('settings.backupData')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={createBackup}
                        testID="settings_backup_item"
                    />
                    <ListItem
                        title={t('settings.restoreData')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cloud-download-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={restoreBackup}
                        testID="settings_restore_item"
                    />
                    {isCurrencyLocked && (
                        <ListItem
                            title={t('settings.resetCurrency')}
                            leftIcon={
                                <IconBadge icon={<Ionicons name="swap-horizontal-outline" size={20} color={colors.warning ?? colors.primary} />} />
                            }
                            showChevron
                            onPress={resetCurrency}
                        />
                    )}
                    <ListItem
                        title={t('settings.resetAllData')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="trash-outline" size={20} color={colors.destructive} />} />
                        }
                        showChevron
                        onPress={resetAllData}
                        testID="settings_reset_item"
                    />
                </View>
            </View>

            {/* Support */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title={t('settings.sections.support')} />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title={t('settings.helpFaq')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="help-circle-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/help')}
                    />
                    <ListItem
                        title={t('settings.aboutValto')}
                        subtitle={APP_VERSION === null ? undefined : `v${APP_VERSION}`}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="information-circle-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/about')}
                    />
                </View>
            </View>

            {/* Modals */}
            <SecuritySetupModal
                visible={securitySetupVisible}
                onClose={() => setSecuritySetupVisible(false)}
            />
            <CurrencyPickerModal
                visible={currencyPickerVisible}
                onClose={() => {
                    setCurrencyPickerVisible(false);
                    // Dismissing the picker without choosing abandons an armed reset.
                    cancelCurrencyReset();
                }}
                onSelect={onCurrencySelected}
                selectedCode={settings.currency}
                locked={isCurrencyLocked}
            />
            <LanguagePickerModal
                visible={languagePickerVisible}
                onClose={() => setLanguagePickerVisible(false)}
                onSelect={handleLanguageSelect}
                selectedCode={settings.language}
            />
            <MonthStartDayPickerModal
                visible={monthStartPickerVisible}
                onClose={() => setMonthStartPickerVisible(false)}
                onSelect={changeMonthStartDay}
                selectedDay={monthStartDay}
            />
            <OptionPickerModal
                visible={themePickerVisible}
                title={t('alerts.chooseTheme')}
                options={themeOptions}
                selectedValue={settings.theme}
                onSelect={changeTheme}
                onClose={() => setThemePickerVisible(false)}
                closeLabel={t('alerts.cancel')}
                closeTestID="theme_picker_close"
            />
            <OptionPickerModal
                visible={dateFormatPickerVisible}
                title={t('settings.dateFormat')}
                options={dateFormatOptions}
                selectedValue={settings.dateFormat}
                onSelect={changeDateFormat}
                onClose={() => setDateFormatPickerVisible(false)}
                closeLabel={t('alerts.cancel')}
                closeTestID="date_format_picker_close"
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 16,
    },
});
