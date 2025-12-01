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
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: typography.sizes.sm, marginBottom: 4 }}>
                        Total Balance
                    </Text>
                    <Text
                        style={{
                            color: colors.accentForeground,
                            fontSize: 32, // text-display approx
                            fontWeight: '600',
                            letterSpacing: -1,
                        }}
                    >
                        {formatAmount(totalBalance)}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={() => setHidden(!hidden)}
                    style={{
                        padding: 8,
                        borderRadius: radius.full,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                    }}
                >
                    <Ionicons
                        name={hidden ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.accentForeground}
                    />
                </TouchableOpacity>
            </View>

            <View style={[styles.statsRow, { borderTopColor: 'rgba(255,255,255,0.2)' }]}>
                <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                        <View style={[styles.iconBadge, { backgroundColor: 'rgba(74, 222, 128, 0.2)' }]}>
                            <Ionicons name="trending-up" size={12} color="#4ade80" />
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: typography.sizes.xs }}>Income</Text>
                    </View>
                    <Text style={{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }}>
                        {formatAmount(monthlyIncome)}
                    </Text>
                </View>

                <View style={styles.statItem}>
                    <View style={styles.statLabelRow}>
                        <View style={[styles.iconBadge, { backgroundColor: 'rgba(248, 113, 113, 0.2)' }]}>
                            <Ionicons name="trending-down" size={12} color="#f87171" />
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: typography.sizes.xs }}>Expenses</Text>
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
