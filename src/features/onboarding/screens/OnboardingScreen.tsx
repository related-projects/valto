/**
 * OnboardingScreen
 *
 * Multi-step first-launch onboarding:
 *   Step 0 — Welcome
 *   Step 1 — Currency Selection
 *   Step 2 — First Wallet Creation
 *   Step 3 — All Set (completion)
 *
 * Uses useOnboarding hook for state management.
 * All text is fully localized via i18n.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPORTED_CURRENCIES, type CurrencyDefinition } from '../../../domain/constants/currencies';
import { WalletType } from '../../../domain/entities';
import { useFormatting } from '../../../hooks/useFormatting';
import { useTheme } from '../../../theme/theme';
import { getButtonA11y } from '../../../utils/accessibility';
import { useOnboarding } from '../hooks/useOnboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const WALLET_TYPES = [
    { label: 'Cash', value: WalletType.CASH, icon: 'wallet-outline' as keyof typeof Ionicons.glyphMap },
    { label: 'Bank', value: WalletType.BANK, icon: 'card-outline' as keyof typeof Ionicons.glyphMap },
    { label: 'Mobile', value: WalletType.MOBILE, icon: 'phone-portrait-outline' as keyof typeof Ionicons.glyphMap },
    { label: 'Savings', value: WalletType.SAVINGS, icon: 'cash-outline' as keyof typeof Ionicons.glyphMap },
];

interface OnboardingScreenProps {
    onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const { parseAmount, normalizeAmount, decimals } = useFormatting();
    const {
        step,
        next,
        back,
        selectCurrency,
        createWallet,
        complete,
        loading,
        error,
    } = useOnboarding();

    // Currency search
    const [currencySearch, setCurrencySearch] = useState('');
    const filteredCurrencies = useMemo(() => {
        const q = currencySearch.toLowerCase();
        if (!q) return SUPPORTED_CURRENCIES;
        return SUPPORTED_CURRENCIES.filter(
            c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
        );
    }, [currencySearch]);

    // Wallet form
    const [walletName, setWalletName] = useState('');
    const [walletType, setWalletType] = useState<WalletType>(WalletType.CASH);
    const [initialBalance, setInitialBalance] = useState('');

    const handleCurrencySelect = async (currency: CurrencyDefinition) => {
        await selectCurrency(currency);
    };

    const handleCreateWallet = async () => {
        const name = walletName.trim() || t('onboarding.walletNamePlaceholder');
        const balance = parseAmount(initialBalance) ?? 0;
        const balanceCents = normalizeAmount(balance);
        await createWallet(name, walletType, balanceCents);
    };

    const handleComplete = async () => {
        await complete();
        onComplete();
    };

    // ─── Step Renderers ───────────────────────────────────────────────

    const renderWelcome = () => (
        <View style={styles.stepContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                <Ionicons name="wallet" size={56} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground, fontSize: typography.sizes['3xl'] }]}>
                {t('onboarding.welcomeTitle')}
            </Text>
            <Text style={[styles.description, { color: colors.mutedForeground, fontSize: typography.sizes.md }]}>
                {t('onboarding.welcomeDescription')}
            </Text>
            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
                onPress={next}
                testID="onboarding_get_started"
                {...getButtonA11y(t('common.getStarted'))}
            >
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    {t('common.getStarted')}
                </Text>
                <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
        </View>
    );

    const renderCurrencySelection = () => (
        <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
                <TouchableOpacity
                    onPress={back}
                    style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}
                    {...getButtonA11y(t('common.back'))}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: typography.sizes.md, marginLeft: 4 }}>
                        {t('common.back')}
                    </Text>
                </TouchableOpacity>
                <Text style={[styles.stepTitle, { color: colors.foreground, fontSize: typography.sizes['2xl'] }]}>
                    {t('onboarding.selectCurrencyTitle')}
                </Text>
                <Text style={[styles.stepDescription, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                    {t('onboarding.selectCurrencyDescription')}
                </Text>
            </View>

            {/* Search */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.card,
                borderRadius: radius.md,
                marginHorizontal: spacing.lg,
                paddingHorizontal: spacing.sm,
                marginBottom: spacing.md,
                ...shadows.card,
            }}>
                <Ionicons name="search" size={18} color={colors.mutedForeground} />
                <TextInput
                    style={{
                        flex: 1,
                        color: colors.foreground,
                        fontSize: typography.sizes.sm,
                        paddingVertical: 12,
                        marginLeft: spacing.xs,
                    }}
                    placeholder={t('currencyPicker.searchPlaceholder')}
                    placeholderTextColor={colors.mutedForeground}
                    value={currencySearch}
                    onChangeText={setCurrencySearch}
                    testID="currency_search_input"
                />
            </View>

            {/* Currency List */}
            <FlatList
                data={filteredCurrencies}
                keyExtractor={item => item.code}
                contentContainerStyle={{ paddingHorizontal: spacing.lg }}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        onPress={() => handleCurrencySelect(item)}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: colors.card,
                            borderRadius: radius.md,
                            padding: spacing.md,
                            marginBottom: spacing.xs,
                            ...shadows.card,
                        }}
                        disabled={loading}
                        testID={`currency_item_${item.code}`}
                        {...getButtonA11y(`${item.name} (${item.code})`)}
                    >
                        <Text style={{ fontSize: 24, marginRight: spacing.md }}>{item.symbol}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                                {item.code}
                            </Text>
                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                                {item.name}
                            </Text>
                        </View>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.md }}>
                            {item.symbol}
                        </Text>
                    </TouchableOpacity>
                )}
            />
        </View>
    );

    const renderWalletCreation = () => (
        <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
            {/* Header */}
            <TouchableOpacity
                onPress={back}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}
                {...getButtonA11y(t('common.back'))}
            >
                <Ionicons name="arrow-back" size={22} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: typography.sizes.md, marginLeft: 4 }}>
                    {t('common.back')}
                </Text>
            </TouchableOpacity>
            <Text style={[styles.stepTitle, { color: colors.foreground, fontSize: typography.sizes['2xl'] }]}>
                {t('onboarding.createWalletTitle')}
            </Text>
            <Text style={[styles.stepDescription, { color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.lg }]}>
                {t('onboarding.createWalletDescription')}
            </Text>

            {/* Wallet Name */}
            <Text style={[styles.inputLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                {t('onboarding.walletName')}
            </Text>
            <TextInput
                style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    color: colors.foreground,
                    fontSize: typography.sizes.md,
                    padding: spacing.md,
                    marginBottom: spacing.md,
                    ...shadows.card,
                }}
                placeholder={t('onboarding.walletNamePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={walletName}
                onChangeText={setWalletName}
                testID="onboarding_wallet_name"
            />

            {/* Wallet Type */}
            <Text style={[styles.inputLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                {t('onboarding.walletType')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                {WALLET_TYPES.map(wt => (
                    <TouchableOpacity
                        key={wt.value}
                        onPress={() => setWalletType(wt.value)}
                        style={{
                            flex: 1,
                            alignItems: 'center',
                            paddingVertical: spacing.sm,
                            backgroundColor: walletType === wt.value ? colors.primary : colors.card,
                            borderRadius: radius.md,
                            ...shadows.card,
                        }}
                        {...getButtonA11y(wt.label)}
                    >
                        <Ionicons
                            name={wt.icon}
                            size={22}
                            color={walletType === wt.value ? colors.primaryForeground : colors.mutedForeground}
                        />
                        <Text style={{
                            fontSize: typography.sizes.xs,
                            color: walletType === wt.value ? colors.primaryForeground : colors.mutedForeground,
                            marginTop: 4,
                            fontWeight: '600',
                        }}>
                            {wt.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Initial Balance */}
            <Text style={[styles.inputLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                {t('onboarding.initialBalance')}
            </Text>
            <TextInput
                style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    color: colors.foreground,
                    fontSize: typography.sizes.md,
                    padding: spacing.md,
                    marginBottom: spacing.xl,
                    ...shadows.card,
                }}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                value={initialBalance}
                onChangeText={setInitialBalance}
                keyboardType={decimals === 0 ? "number-pad" : "decimal-pad"}
                testID="onboarding_wallet_balance"
            />

            {/* Error */}
            {error && (
                <Text style={{ color: colors.destructive ?? '#ef4444', fontSize: typography.sizes.sm, marginBottom: spacing.md, textAlign: 'center' }}>
                    {error}
                </Text>
            )}

            {/* Create Button */}
            <TouchableOpacity
                style={[styles.primaryButton, {
                    backgroundColor: colors.primary,
                    borderRadius: radius.lg,
                    opacity: loading ? 0.6 : 1,
                }]}
                onPress={handleCreateWallet}
                disabled={loading}
                testID="onboarding_next_button"
                {...getButtonA11y(t('common.next'))}
            >
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    {t('common.next')}
                </Text>
                <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
        </View>
    );

    const renderCompletion = () => (
        <View style={styles.stepContainer}>
            <View style={[styles.iconCircle, { backgroundColor: '#22c55e22' }]}>
                <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
            </View>
            <Text style={[styles.title, { color: colors.foreground, fontSize: typography.sizes['3xl'] }]}>
                {t('onboarding.allSet')}
            </Text>
            <Text style={[styles.description, { color: colors.mutedForeground, fontSize: typography.sizes.md }]}>
                {t('onboarding.allSetDescription')}
            </Text>
            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
                onPress={handleComplete}
                disabled={loading}
                testID="onboarding_complete_button"
                {...getButtonA11y(t('onboarding.goToDashboard'))}
            >
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    {t('onboarding.goToDashboard')}
                </Text>
            </TouchableOpacity>
        </View>
    );

    // ─── Step Progress Dots ───────────────────────────────────────────

    const renderDots = () => (
        <View style={styles.dotsContainer}>
            {[0, 1, 2, 3].map(i => (
                <View
                    key={i}
                    style={[
                        styles.dot,
                        {
                            backgroundColor: i === step ? colors.primary : colors.muted,
                            width: i === step ? 24 : 8,
                        },
                    ]}
                />
            ))}
        </View>
    );

    // ─── Main Render ──────────────────────────────────────────────────

    return (
        <View style={[styles.container, {
            backgroundColor: colors.background,
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
        }]}>
            {renderDots()}
            <View style={{ flex: 1 }}>
                {step === 0 && renderWelcome()}
                {step === 1 && renderCurrencySelection()}
                {step === 2 && renderWalletCreation()}
                {step === 3 && renderCompletion()}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    stepContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
    },
    title: {
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 12,
    },
    description: {
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 40,
    },
    stepTitle: {
        fontWeight: '700',
        marginBottom: 8,
    },
    stepDescription: {
        lineHeight: 20,
    },
    inputLabel: {
        fontWeight: '600',
        marginBottom: 8,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 32,
        alignSelf: 'center',
        minWidth: SCREEN_WIDTH * 0.6,
    },
    primaryButtonText: {
        fontSize: 18,
        fontWeight: '700',
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginBottom: 24,
    },
    dot: {
        height: 8,
        borderRadius: 4,
    },
});
