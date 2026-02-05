import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface BudgetProgressProps {
    spent?: number;
    budget?: number;
    currency?: string;
    isEmpty?: boolean;
}

export const BudgetProgress: React.FC<BudgetProgressProps> = ({
    spent = 0,
    budget = 0,
    currency = '$',
    isEmpty = false,
}) => {
    const { colors, typography, spacing, radius } = useTheme();

    // Handle empty state
    if (isEmpty || budget === 0) {
        return (
            <Card>
                <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
                    Monthly Budget
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        No budget set yet
                    </Text>
                    <TouchableOpacity
                        style={{
                            marginTop: spacing.md,
                            paddingHorizontal: spacing.lg,
                            paddingVertical: spacing.sm,
                            backgroundColor: colors.accent,
                            borderRadius: radius.md,
                        }}
                        onPress={() => { /* Navigation to be implemented */ }}
                    >
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                            Create a budget
                        </Text>
                    </TouchableOpacity>
                </View>
            </Card>
        );
    }

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
        if (isOverBudget) return colors.destructiveBackground;
        if (isNearLimit) return colors.warningBackground;
        return colors.successBackground;
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
                        paddingHorizontal: spacing.sm,
                        paddingVertical: spacing.xxs,
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

            <View style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm }}>
                    <Text style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.foreground }}>
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

