/**
 * CategoryBreakdownTable Component
 *
 * Sorted list of expense categories with amounts, percentages,
 * and budget awareness (usage indicator + overspend highlight).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface CategoryBreakdownItem {
    categoryName: string;
    categoryColor: string;
    amount: number;
    percentage: number;
    budgetLimit?: number;
    isOverBudget: boolean;
}

interface CategoryBreakdownTableProps {
    data: CategoryBreakdownItem[];
}

export const CategoryBreakdownTable: React.FC<CategoryBreakdownTableProps> = ({
    data,
}) => {
    const { t } = useTranslation();
    const { colors, typography, spacing, radius } = useTheme();
    const { formatAmount } = useFormatting();

    if (data.length === 0) {
        return (
            <Card>
                <Text
                    style={{
                        color: colors.foreground,
                        fontWeight: typography.weights.semibold,
                        fontSize: typography.sizes.sm,
                        marginBottom: spacing.md,
                    }}
                >
                    {t('reports.categoryBreakdown')}
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        {t('components.spendingBreakdown.noData')}
                    </Text>
                </View>
            </Card>
        );
    }

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
                {t('reports.categoryBreakdown')}
            </Text>

            <View style={{ gap: spacing.md }}>
                {data.map((item, index) => {
                    const budgetUsage = item.budgetLimit
                        ? Math.min((item.amount / item.budgetLimit) * 100, 100)
                        : null;

                    return (
                        <View key={index}>
                            {/* Row: color dot + name + amount + percentage */}
                            <View style={styles.row}>
                                <View style={styles.rowLeft}>
                                    <View
                                        style={[
                                            styles.dot,
                                            { backgroundColor: item.categoryColor },
                                        ]}
                                    />
                                    <Text
                                        style={{
                                            color: colors.foreground,
                                            fontSize: typography.sizes.sm,
                                            fontWeight: typography.weights.medium,
                                            flex: 1,
                                        }}
                                        numberOfLines={1}
                                    >
                                        {item.categoryName}
                                    </Text>
                                </View>
                                <View style={styles.rowRight}>
                                    <Text
                                        style={{
                                            color: colors.mutedForeground,
                                            fontSize: typography.sizes.xs,
                                        }}
                                    >
                                        {item.percentage.toFixed(0)}%
                                    </Text>
                                    <Text
                                        style={{
                                            color: colors.foreground,
                                            fontSize: typography.sizes.sm,
                                            fontWeight: typography.weights.semibold,
                                            minWidth: 80,
                                            textAlign: 'right',
                                        }}
                                    >
                                        {formatAmount(item.amount)}
                                    </Text>
                                </View>
                            </View>

                            {/* Budget progress bar (only if category has a budget) */}
                            {item.budgetLimit !== undefined && (
                                <View style={{ marginTop: spacing.xs }}>
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
                                                backgroundColor: item.isOverBudget
                                                    ? colors.destructive
                                                    : budgetUsage! > 80
                                                        ? colors.warning
                                                        : item.categoryColor,
                                                width: `${budgetUsage ?? 0}%`,
                                                borderRadius: radius.full,
                                            }}
                                        />
                                    </View>
                                    <View style={styles.budgetLabel}>
                                        <Text
                                            style={{
                                                color: item.isOverBudget
                                                    ? colors.destructiveText
                                                    : colors.mutedForeground,
                                                fontSize: typography.sizes.xs,
                                                fontWeight: item.isOverBudget
                                                    ? typography.weights.semibold
                                                    : typography.weights.regular,
                                            }}
                                        >
                                            {item.isOverBudget
                                                ? t('reports.overBudget')
                                                : t('reports.ofBudget', { spent: formatAmount(item.amount), limit: formatAmount(item.budgetLimit) })}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    );
                })}
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
        flex: 1,
        gap: 10,
    },
    rowRight: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    budgetLabel: {
        marginTop: 2,
    },
});
