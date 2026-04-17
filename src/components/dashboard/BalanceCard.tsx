import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';

interface BalanceCardProps {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
    netBalance?: number;
    incomeChange?: number | null;
    expenseChange?: number | null;
    netBalanceChange?: number | null;
    /** When true, eye toggle requires authentication before revealing */
    securityEnabled?: boolean;
    /** Called when user taps eye with security on. Return true to reveal. */
    onRequestAuth?: () => Promise<boolean>;
}

/** Opacity values for 3D surface layers, tuned per theme */
const SURFACE_OPACITY = {
    light: {
        gradientTop: 0.08,
        gradientBottom: 0.06,
        innerGlow: 0.12,
        highlightTop: 'rgba(255, 255, 255, 0.18)',
        highlightLeft: 'rgba(255, 255, 255, 0.08)',
        highlightRight: 'rgba(0, 0, 0, 0.05)',
        highlightBottom: 'rgba(0, 0, 0, 0.10)',
    },
    dark: {
        gradientTop: 0.06,
        gradientBottom: 0.08,
        innerGlow: 0.08,
        highlightTop: 'rgba(255, 255, 255, 0.12)',
        highlightLeft: 'rgba(255, 255, 255, 0.05)',
        highlightRight: 'rgba(0, 0, 0, 0.08)',
        highlightBottom: 'rgba(0, 0, 0, 0.14)',
    },
} as const;

const BalanceCardInner: React.FC<BalanceCardProps> = ({
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    netBalance,
    incomeChange,
    expenseChange,
    netBalanceChange,
    securityEnabled = false,
    onRequestAuth,
}) => {
    const { t } = useTranslation();
    const { colors, typography, spacing, radius, shadows, isDark } = useTheme();
    const { formatAmount } = useFormatting();
    const [hidden, setHidden] = useState(false);
    const authInProgress = useRef(false);

    const handleEyePress = useCallback(async () => {
        // If currently visible, always allow hiding
        if (!hidden) {
            setHidden(true);
            return;
        }

        // If hidden and security enabled, require auth
        if (securityEnabled && onRequestAuth) {
            if (authInProgress.current) return; // Prevent rapid taps
            authInProgress.current = true;
            try {
                const authenticated = await onRequestAuth();
                if (authenticated) {
                    setHidden(false);
                }
            } finally {
                authInProgress.current = false;
            }
        } else {
            setHidden(false);
        }
    }, [hidden, securityEnabled, onRequestAuth]);

    // Helper to convert hex color to rgba with opacity
    const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    // Use centralized formatting utility; respect hidden balance mode
    const displayAmount = (amount: number) => {
        if (hidden) return '••••••';
        return formatAmount(amount);
    };

    const renderChangeBadge = (change?: number | null, isExpense?: boolean) => {
        if (change === undefined || change === null) return null;

        // For expenses, an increase is bad (red), decrease is good (green)
        // For income/net, an increase is good (green), decrease is bad (red)
        const isPositiveChange = change >= 0;
        const isGood = isExpense ? !isPositiveChange : isPositiveChange;

        const bgColor = isGood ? colors.successBackground : colors.destructiveBackground;
        const textColor = isGood ? colors.successText : colors.destructiveText;
        const iconName = isPositiveChange ? 'arrow-up' : 'arrow-down';

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bgColor, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, marginTop: 4, alignSelf: 'flex-start' }}>
                <Ionicons name={iconName} size={10} color={textColor} />
                <Text style={{ color: textColor, fontSize: typography.sizes.xs - 2, fontWeight: '600', marginLeft: 2 }}>{Math.abs(change).toFixed(1)}%</Text>
            </View>
        );
    };

    // Select theme-appropriate surface opacities
    const surface = isDark ? SURFACE_OPACITY.dark : SURFACE_OPACITY.light;

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.accent,
                    borderRadius: radius.xl,
                    padding: spacing.lg,
                    ...shadows.elevated3d,
                    // Platform-specific depth boost
                    ...Platform.select({
                        android: { elevation: 12 },
                        ios: {},
                    }),
                },
            ]}
        >
            {/* Layer 1: Gradient simulation — top lighter overlay */}
            <View
                style={[
                    styles.gradientTop,
                    {
                        borderTopLeftRadius: radius.xl,
                        borderTopRightRadius: radius.xl,
                        backgroundColor: hexToRgba('#FFFFFF', surface.gradientTop),
                    },
                ]}
                pointerEvents="none"
            />

            {/* Layer 2: Gradient simulation — bottom darker overlay */}
            <View
                style={[
                    styles.gradientBottom,
                    {
                        borderBottomLeftRadius: radius.xl,
                        borderBottomRightRadius: radius.xl,
                        backgroundColor: hexToRgba('#000000', surface.gradientBottom),
                    },
                ]}
                pointerEvents="none"
            />

            {/* Layer 3: Surface highlight — inner glow at top edge */}
            <View
                style={[
                    styles.innerGlow,
                    {
                        borderTopLeftRadius: radius.xl,
                        borderTopRightRadius: radius.xl,
                        backgroundColor: hexToRgba('#FFFFFF', surface.innerGlow),
                    },
                ]}
                pointerEvents="none"
            />

            {/* Layer 4: Border highlight — beveled edge illusion */}
            <View
                style={[
                    styles.highlightEdge,
                    {
                        borderRadius: radius.xl,
                        borderTopColor: surface.highlightTop,
                        borderLeftColor: surface.highlightLeft,
                        borderRightColor: surface.highlightRight,
                        borderBottomColor: surface.highlightBottom,
                    },
                ]}
                pointerEvents="none"
            />

            {/* Content */}
            <View style={styles.header}>
                <View>
                    <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs, opacity: 0.8 }}>
                        {t('components.balanceCard.totalBalance')}
                    </Text>
                    <Text
                        style={{
                            color: colors.accentForeground,
                            fontSize: typography.sizes['4xl'],
                            fontWeight: typography.weights.semibold,
                            letterSpacing: -1,
                        }}
                    >
                        {displayAmount(totalBalance)}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={handleEyePress}
                    style={{
                        padding: spacing.sm,
                        borderRadius: radius.full,
                        position: 'relative',
                    }}
                >
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: colors.accentForeground,
                            opacity: 0.1,
                            borderRadius: radius.full,
                        }}
                    />
                    <Ionicons
                        name={hidden ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.accentForeground}
                    />
                </TouchableOpacity>
            </View>

            <View style={[styles.statsRow, { borderTopColor: hexToRgba(colors.accentForeground, 0.2) }]}>
                <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                        <View style={[styles.iconBadge, { backgroundColor: colors.successBackground }]}>
                            <Ionicons name="trending-up" size={12} color={colors.successText} />
                        </View>
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>{t('components.balanceCard.income')}</Text>
                    </View>
                    <Text style={{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }}>
                        {displayAmount(monthlyIncome)}
                    </Text>
                    {renderChangeBadge(incomeChange, false)}
                </View>

                <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                        <View style={[styles.iconBadge, { backgroundColor: colors.destructiveBackground }]}>
                            <Ionicons name="trending-down" size={12} color={colors.destructiveText} />
                        </View>
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>{t('components.balanceCard.expenses')}</Text>
                    </View>
                    <Text style={{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }}>
                        {displayAmount(monthlyExpense)}
                    </Text>
                    {renderChangeBadge(expenseChange, true)}
                </View>

                {netBalance !== undefined && (
                    <View style={styles.statItem}>
                        <View style={styles.statLabelRow}>
                            <View style={[styles.iconBadge, { backgroundColor: colors.accentForeground, opacity: 0.2 }]}>
                                <Ionicons name="swap-vertical" size={12} color={colors.accent} />
                            </View>
                            <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>{t('components.balanceCard.net')}</Text>
                        </View>
                        <Text style={{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }}>
                            {displayAmount(netBalance)}
                        </Text>
                        {renderChangeBadge(netBalanceChange, false)}
                    </View>
                )}
            </View>
        </View>
    );
};

/** Memoized BalanceCard — prevents re-renders from parent style changes */
export const BalanceCard = React.memo(BalanceCardInner);

const styles = StyleSheet.create({
    container: {
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
    },
    /** Top 55% — lighter overlay simulating light hitting surface */
    gradientTop: {
        ...StyleSheet.absoluteFillObject,
        bottom: '45%',
    },
    /** Bottom 45% — darker overlay simulating shadow underneath */
    gradientBottom: {
        ...StyleSheet.absoluteFillObject,
        top: '55%',
    },
    /** Inner glow — narrow strip at very top for specular highlight */
    innerGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
    },
    highlightEdge: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        paddingTop: 16,
        borderTopWidth: 1,
        gap: 16,
    },
    statItem: {
        flex: 1,
    },
    statLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    iconBadge: {
        padding: 4,
        borderRadius: 999,
    },
});
