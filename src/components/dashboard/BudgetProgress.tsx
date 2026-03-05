import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BudgetSummary } from '../../hooks/useBudgets';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface BudgetProgressProps {
    /** Enriched budget summaries with spending data */
    budgetSummaries?: BudgetSummary[];
    /** Total spent across all budgeted categories */
    totalSpent?: number;
    /** Total budget limit across all categories */
    totalLimit?: number;
    /** Whether there are any budgets */
    hasBudgets?: boolean;
    /** Callback when "Create a budget" is tapped */
    onCreateBudget?: () => void;
    /** Callback when a budget item's delete button is tapped */
    onDeleteBudget?: (budgetId: string) => void;
}

export const BudgetProgress: React.FC<BudgetProgressProps> = ({
    budgetSummaries = [],
    totalSpent = 0,
    totalLimit = 0,
    hasBudgets = false,
    onCreateBudget,
    onDeleteBudget,
}) => {
    const { t } = useTranslation();
    const { colors, typography, spacing, radius } = useTheme();
    const { formatAmount } = useFormatting();

    // Handle empty state
    if (!hasBudgets) {
        return (
            <Card>
                <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
                    {t('components.budgetProgress.title')}
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        {t('components.budgetProgress.noBudget')}
                    </Text>
                    <TouchableOpacity
                        style={{
                            marginTop: spacing.md,
                            paddingHorizontal: spacing.lg,
                            paddingVertical: spacing.sm,
                            backgroundColor: colors.accent,
                            borderRadius: radius.md,
                        }}
                        onPress={onCreateBudget}
                    >
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                            {t('components.budgetProgress.createBudget')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Card>
        );
    }

    // Overall percentage
    const overallPercentage = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;
    const overallRemaining = Math.max(0, totalLimit - totalSpent);
    const overallOverAmount = Math.max(0, totalSpent - totalLimit);
    const isOverallOverBudget = totalSpent > totalLimit;
    const isOverallNearLimit = overallPercentage >= 80 && !isOverallOverBudget;

    const getOverallStatusColor = () => {
        if (isOverallOverBudget) return colors.destructive;
        if (isOverallNearLimit) return colors.warning;
        return colors.success;
    };

    const getOverallStatusBg = () => {
        if (isOverallOverBudget) return colors.destructiveBackground;
        if (isOverallNearLimit) return colors.warningBackground;
        return colors.successBackground;
    };

    const getOverallStatusText = () => {
        if (isOverallOverBudget) return t('components.budgetProgress.overBudget');
        if (isOverallNearLimit) return t('components.budgetProgress.nearLimit');
        return t('components.budgetProgress.onTrack');
    };

    return (
        <Card>
            {/* Header with overall status */}
            <View style={styles.header}>
                <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.sizes.sm }}>
                    {t('components.budgetProgress.title')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View
                        style={{
                            backgroundColor: getOverallStatusBg(),
                            paddingHorizontal: spacing.sm,
                            paddingVertical: spacing.xxs,
                            borderRadius: radius.full,
                        }}
                    >
                        <Text
                            style={{
                                color: getOverallStatusColor(),
                                fontSize: typography.sizes.xs,
                                fontWeight: '500',
                            }}
                        >
                            {getOverallStatusText()}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onCreateBudget} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Overall summary */}
            <View style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm }}>
                    <Text style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.foreground }}>
                        {formatAmount(totalSpent)}
                    </Text>
                    <Text style={{ fontSize: typography.sizes.sm, color: colors.mutedForeground }}>
                        {t('components.budgetProgress.of', { amount: formatAmount(totalLimit) })}
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
                            backgroundColor: isOverallOverBudget ? colors.destructive : isOverallNearLimit ? colors.warning : colors.accent,
                            width: `${overallPercentage}%`,
                            borderRadius: radius.full,
                        }}
                    />
                </View>

                {overallOverAmount > 0 && (
                    <Text style={{ fontSize: typography.sizes.xs, color: colors.destructive, marginTop: spacing.xs }}>
                        {t('components.budgetProgress.overAmount', { amount: formatAmount(overallOverAmount) })}
                    </Text>
                )}
            </View>

            {/* Per-category breakdown */}
            {budgetSummaries.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                    {budgetSummaries.map((summary) => {
                        const barPercentage = Math.min(summary.percentageUsed, 100);
                        const barColor = summary.isOverBudget
                            ? colors.destructive
                            : summary.percentageUsed >= 80
                                ? colors.warning
                                : summary.categoryColor || colors.accent;

                        return (
                            <View key={summary.budget.id} style={{ marginBottom: spacing.md }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxs }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <View
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: 4,
                                                backgroundColor: summary.categoryColor,
                                                marginRight: spacing.xs,
                                            }}
                                        />
                                        <Text
                                            style={{
                                                color: colors.foreground,
                                                fontSize: typography.sizes.xs,
                                                fontWeight: '500',
                                                flex: 1,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {summary.categoryName}
                                        </Text>
                                    </View>
                                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                        {formatAmount(summary.spentAmount)} / {formatAmount(summary.budget.limitAmount)}
                                    </Text>
                                </View>

                                {/* Category progress bar */}
                                <View
                                    style={{
                                        height: 4,
                                        backgroundColor: colors.muted,
                                        borderRadius: radius.full,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <View
                                        style={{
                                            height: '100%',
                                            backgroundColor: barColor,
                                            width: `${barPercentage}%`,
                                            borderRadius: radius.full,
                                        }}
                                    />
                                </View>

                                {summary.isOverBudget && (
                                    <Text style={{ color: colors.destructive, fontSize: typography.sizes.xs - 1, marginTop: 2 }}>
                                        {t('components.budgetProgress.overCategory', { amount: formatAmount(summary.spentAmount - summary.budget.limitAmount) })}
                                    </Text>
                                )}
                            </View>
                        );
                    })}
                </View>
            )}
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
