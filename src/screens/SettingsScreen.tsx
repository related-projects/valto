import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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

const THEME_LABELS: Record<string, string> = {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
};

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export const SettingsScreen = () => {
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
        loading,
    } = useSettings();
    const { isSecurityEnabled, securityConfig, biometrics, disableSecurity } = useSecurity();
    const [securitySetupVisible, setSecuritySetupVisible] = useState(false);
    const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
    const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

    // Security subtitle
    const securitySubtitle = isSecurityEnabled
        ? (securityConfig?.biometricsEnabled ? 'PIN + Biometrics' : 'PIN enabled')
        : 'Off';

    const handleSecurityPress = useCallback(() => {
        if (isSecurityEnabled) {
            Alert.alert(
                'Disable Security',
                'This will remove your PIN and biometric protection. Your data will be accessible without authentication.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Disable',
                        style: 'destructive',
                        onPress: () => disableSecurity(),
                    },
                ],
            );
        } else {
            setSecuritySetupVisible(true);
        }
    }, [isSecurityEnabled, disableSecurity]);

    const handleCurrencyPress = useCallback(() => {
        if (isCurrencyLocked) {
            Alert.alert('Currency Locked', 'Currency cannot be changed once selected.');
            return;
        }
        setCurrencyPickerVisible(true);
    }, [isCurrencyLocked]);

    const onCurrencySelected = useCallback(async (selected: any) => {
        await handleCurrencySelect(selected);
        setCurrencyPickerVisible(false);
    }, [handleCurrencySelect]);

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
                Settings
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
                        Processing…
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
                        Valto User
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                        Premium Account
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </View>

            {/* References */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="References" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Currency"
                        subtitle={isCurrencyLocked ? `${currency.symbol} ${currency.code} (locked)` : `${currency.symbol} ${currency.code}`}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cash-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron={!isCurrencyLocked}
                        onPress={handleCurrencyPress}
                    />
                    <ListItem
                        title="Language"
                        subtitle={language.nativeName}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="language-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => setLanguagePickerVisible(true)}
                    />
                    <ListItem
                        title="Theme"
                        subtitle={THEME_LABELS[settings.theme] ?? 'System'}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="color-palette-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={changeTheme}
                    />
                </View>
            </View>

            {/* App Settings */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="App Settings" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Categories"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="grid-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/categories')}
                    />
                    <ListItem
                        title="Notifications"
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
                        title="Security"
                        subtitle={securitySubtitle}
                        leftIcon={
                            <IconBadge icon={<Ionicons name="lock-closed-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={handleSecurityPress}
                    />
                </View>
            </View>

            {/* Data Management */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="Data Management" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Backup Data"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={createBackup}
                    />
                    <ListItem
                        title="Restore Data"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cloud-download-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={restoreBackup}
                    />
                    <ListItem
                        title="Reset All Data"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="trash-outline" size={20} color={colors.destructive} />} />
                        }
                        showChevron
                        onPress={resetAllData}
                    />
                </View>
            </View>

            {/* Support */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="Support" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Help & FAQ"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="help-circle-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => router.push('/help')}
                    />
                    <ListItem
                        title="About Valto"
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
                onClose={() => setCurrencyPickerVisible(false)}
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
