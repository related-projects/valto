import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SecuritySetupModal } from '../components/security/SecuritySetupModal';
import { CurrencyPickerModal } from '../components/settings/CurrencyPickerModal';
import { LanguagePickerModal } from '../components/settings/LanguagePickerModal';
import { Avatar } from '../components/ui/Avatar';
import { IconBadge } from '../components/ui/IconBadge';
import { ListItem } from '../components/ui/ListItem';
import { SectionHeader } from '../components/ui/SectionHeader';
import { useSecurity } from '../core/security/SecurityContext';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../theme/theme';

// ─── Helpers ──────────────────────────────────────────────────────────

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

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
        resetCurrency,
        cancelCurrencyReset,
        changeDateFormat,
        changeFirstDayOfWeek,
        changeDecimalSeparator,
        loading,
    } = useSettings();
    const { isSecurityEnabled, securityConfig, biometrics, disableSecurity } = useSecurity();
    const [securitySetupVisible, setSecuritySetupVisible] = useState(false);
    const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
    const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

    // Security subtitle
    const securitySubtitle = isSecurityEnabled
        ? (securityConfig?.biometricsEnabled ? t('settings.securityPinBiometrics') : t('settings.securityPin'))
        : t('settings.securityOff');

    // Theme label
    const themeLabel = t(`settings.theme${settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}`);

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
    const firstDayLabel = t(`settings.${settings.firstDayOfWeek}`);
    const decimalLabel = t(`settings.${settings.decimalSeparator}`);

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingTop: insets.top + spacing.md,
                paddingBottom: spacing.tabBarOffset,
                paddingHorizontal: spacing.md,
            }}
            showsVerticalScrollIndicator={false}
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

            {/* User Info Card */}
            <View style={{
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                padding: spacing.md,
                marginBottom: spacing.lg,
                ...shadows.card,
                flexDirection: 'row',
                alignItems: 'center',
            }}>
                <Avatar label="V" size="md" />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {t('settings.userName')}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                        {t('settings.premiumAccount')}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </View>

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
                        testID="settings_language_item"
                    />
                    <ListItem
                        title={t('settings.theme')}
                        subtitle={themeLabel}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="color-palette-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={changeTheme}
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
                            />
                        }
                    />
                    <ListItem
                        title={t('settings.security')}
                        subtitle={securitySubtitle}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="lock-closed-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={handleSecurityPress}
                    />
                    <ListItem
                        title={t('recurring.title')}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="repeat-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/recurring-rules')}
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
                        onPress={changeDateFormat}
                    />
                    <ListItem
                        title={t('settings.firstDayOfWeek')}
                        subtitle={firstDayLabel}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="today-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={changeFirstDayOfWeek}
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
                        subtitle={`v${APP_VERSION}`}
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
