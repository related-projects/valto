import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface BudgetProgressProps {
    spent: number;
    budget: number;
    currency?: string;
}

export const BudgetProgress: React.FC<BudgetProgressProps> = ({
    spent,
    budget,
    currency = '$',
}) => {
    const { colors, typography, spacing, radius } = useTheme();
    const percentage = Math.min((spent / budget) * 100, 100);
    const remaining = budget - spent;
    const isOverBudget = spent > budget;
    const isNearLimit = percentage >= 80 && !isOverBudget;

    const getStatusColor = () => {
        if (isOverBudget) return colors.destructive;
        if (isNearLimit) return colors.warning;
        return colors.success;
    };

    const getStatusBg = () => {
        if (isOverBudget) return 'rgba(248, 113, 113, 0.1)';
        if (isNearLimit) return 'rgba(242, 169, 34, 0.1)';
        return 'rgba(74, 222, 128, 0.1)';
    };

    const getStatusText = () => {
        if (isOverBudget) return 'Over budget';
        if (isNearLimit) return 'Near limit';
        return 'On track';
    };

    return (
        <Card>
            <View style={styles.header}>
                <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.sizes.sm }}>
                    Monthly Budget
                </Text>
                <View
                    style={{
                        backgroundColor: getStatusBg(),
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: radius.full,
                    }}
                >
                    <Text
                        style={{
                            color: getStatusColor(),
                            fontSize: typography.sizes.xs,
                            fontWeight: '500',
                        }}
                    >
                        {getStatusText()}
                    </Text>
                </View>
            </View>

            <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: colors.foreground }}>
                        {currency}{spent.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: typography.sizes.sm, color: colors.mutedForeground }}>
                        of {currency}{budget.toLocaleString()}
                    </Text>
                </View>

                <View
                    style={{
                        height: 8,
                        backgroundColor: colors.muted,
                        borderRadius: radius.full,
                        overflow: 'hidden',
                    }}
                >
                    <View
                        style={{
                            height: '100%',
                            backgroundColor: isOverBudget ? colors.destructive : isNearLimit ? colors.warning : colors.accent,
                            width: `${percentage}%`,
                            borderRadius: radius.full,
                        }}
                    />
                </View>
            </View>

            <Text style={{ fontSize: typography.sizes.xs, color: colors.mutedForeground }}>
                {isOverBudget ? (
                    <Text style={{ color: colors.destructive }}>
                        {currency}{Math.abs(remaining).toLocaleString()} over budget
                    </Text>
                ) : (
                    <Text>
                        {currency}{remaining.toLocaleString()} remaining this month
                    </Text>
                )}
            </Text>
        </Card>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
});
