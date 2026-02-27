/**
 * FinancialSummary Component
 *
 * Displays monthly financial overview: income, expense, net balance, and savings rate.
 * Handles zero-income safely by showing "—" for savings rate.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { formatAmount } from '../../utils/formatAmount';
import { Card } from '../ui/Card';

interface FinancialSummaryProps {
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
    /** null when income is zero */
    savingsRate: number | null;
    currency?: string;
}

export const FinancialSummary: React.FC<FinancialSummaryProps> = ({
    totalIncome,
    totalExpense,
    netBalance,
    savingsRate,
    currency = '$',
}) => {
    const { colors, typography, spacing, radius } = useTheme();

    const rows: {
        label: string;
        value: string;
        color: string;
        icon: keyof typeof Ionicons.glyphMap;
        bgColor: string;
    }[] = [
            {
                label: 'Total Income',
                value: formatAmount(totalIncome, currency),
                color: colors.successText,
                icon: 'arrow-down-circle-outline',
                bgColor: colors.successBackground,
            },
            {
                label: 'Total Expense',
                value: formatAmount(totalExpense, currency),
                color: colors.destructiveText,
                icon: 'arrow-up-circle-outline',
                bgColor: colors.destructiveBackground,
            },
            {
                label: 'Net Balance',
                value: formatAmount(netBalance, currency),
                color: netBalance >= 0 ? colors.successText : colors.destructiveText,
                icon: 'wallet-outline',
                bgColor: netBalance >= 0 ? colors.successBackground : colors.destructiveBackground,
            },
            {
                label: 'Savings Rate',
                value: savingsRate !== null ? `${savingsRate.toFixed(1)}%` : '—',
                color: savingsRate !== null && savingsRate > 0 ? colors.successText : colors.mutedForeground,
                icon: 'trending-up-outline',
                bgColor: savingsRate !== null && savingsRate > 0 ? colors.successBackground : colors.muted,
            },
        ];

    return (
        <Card>
            <Text
                style={{
                    color: colors.foreground,
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing.lg,
                }}
            >
                Financial Summary
            </Text>

            <View style={{ gap: spacing.md }}>
                {rows.map((row, index) => (
                    <View key={index} style={styles.row}>
                        <View style={styles.rowLeft}>
                            <View
                                style={[
                                    styles.iconContainer,
                                    {
                                        backgroundColor: row.bgColor,
                                        borderRadius: radius.sm,
                                    },
                                ]}
                            >
                                <Ionicons name={row.icon} size={18} color={row.color} />
                            </View>
                            <Text
                                style={{
                                    color: colors.mutedForeground,
                                    fontSize: typography.sizes.sm,
                                    fontWeight: typography.weights.medium,
                                }}
                            >
                                {row.label}
                            </Text>
                        </View>
                        <Text
                            style={{
                                color: row.color,
                                fontSize: typography.sizes.md,
                                fontWeight: typography.weights.semibold,
                            }}
                        >
                            {row.value}
                        </Text>
                    </View>
                ))}
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
