import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface BalanceCardProps {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
    totalBalance,
    monthlyIncome,
    monthlyExpense,
}) => {
    const { colors, typography, spacing } = useTheme();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    };

    return (
        <Card variant="elevated" padding="lg" style={{ backgroundColor: colors.foreground }}>
            <View>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                    Total Balance
                </Text>
                <Text
                    style={{
                        color: colors.background,
                        fontSize: typography.sizes['3xl'],
                        fontWeight: '700',
                        marginTop: spacing.xs,
                    }}
                >
                    {formatCurrency(totalBalance)}
                </Text>
            </View>

            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                        <Ionicons name="arrow-down" size={16} color={colors.success} />
                    </View>
                    <View>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                            Income
                        </Text>
                        <Text
                            style={{
                                color: colors.background,
                                fontSize: typography.sizes.md,
                                fontWeight: '600',
                            }}
                        >
                            {formatCurrency(monthlyIncome)}
                        </Text>
                    </View>
                </View>

                <View style={styles.statItem}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                        <Ionicons name="arrow-up" size={16} color={colors.destructive} />
                    </View>
                    <View>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                            Expense
                        </Text>
                        <Text
                            style={{
                                color: colors.background,
                                fontSize: typography.sizes.md,
                                fontWeight: '600',
                            }}
                        >
                            {formatCurrency(monthlyExpense)}
                        </Text>
                    </View>
                </View>
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 24,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
