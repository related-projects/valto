import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';

interface BalanceCardProps {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
    currency?: string;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    currency = '$',
}) => {
    const { colors, typography, spacing, radius, shadows } = useTheme();
    const [hidden, setHidden] = useState(false);

    const formatAmount = (amount: number) => {
        if (hidden) return '••••••';
        return `${currency}${amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    };

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.accent,
                    borderRadius: radius.xl,
                    padding: spacing.lg, // p-6 = 24px = lg
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
                        {formatAmount(totalBalance)}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={() => setHidden(!hidden)}
                    style={{
                        padding: spacing.sm,
                        borderRadius: radius.full,
                        backgroundColor: colors.accentForeground,
                        opacity: 0.1,
                    }}
                >
                    <Ionicons
                        name={hidden ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.accentForeground}
                    />
                </TouchableOpacity>
            </View>


            <View style={[styles.statsRow, { borderTopColor: colors.accentForeground, opacity: 0.2 }]}>
                <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                        <View style={[styles.iconBadge, { backgroundColor: colors.successBackground, opacity: 0.2 }]}>
                            <Ionicons name="trending-up" size={12} color={colors.successText} />
                        </View>
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>Income</Text>
                    </View>
                    <Text style={{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }}>
                        {formatAmount(monthlyIncome)}
                    </Text>
                </View>

                <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                        <View style={[styles.iconBadge, { backgroundColor: colors.destructiveBackground, opacity: 0.2 }]}>
                            <Ionicons name="trending-down" size={12} color={colors.destructiveText} />
                        </View>
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }}>Expenses</Text>
                    </View>
                    <Text style={{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }}>
                        {formatAmount(monthlyExpense)}
                    </Text>
                </View>
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
