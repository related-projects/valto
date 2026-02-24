import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { formatAmount as formatAmountUtil } from '../../utils/formatAmount';

interface BalanceCardProps {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
    netBalance?: number;
    incomeChange?: number | null;
    expenseChange?: number | null;
    netBalanceChange?: number | null;
    currency?: string;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    netBalance,
    incomeChange,
    expenseChange,
    netBalanceChange,
    currency = '$',
}) => {
    const { colors, typography, spacing, radius, shadows } = useTheme();
    const [hidden, setHidden] = useState(false);

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
        return formatAmountUtil(amount, currency);
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

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.accent,
                    borderRadius: radius.xl,
                    padding: spacing.lg,
                    ...shadows.card,
                },
            ]}
        >
            <View style={styles.header}>
                <View>
                    <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs, opacity: 0.8 }}>
                        Total Balance
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
                    onPress={() => setHidden(!hidden)}
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
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>Income</Text>
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
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>Expenses</Text>
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
                            <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>Net</Text>
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

const styles = StyleSheet.create({
    container: {
        width: '100%',
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
