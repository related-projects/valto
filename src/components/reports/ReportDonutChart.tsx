/**
 * ReportDonutChart Component
 *
 * SVG donut chart showing expense distribution by category.
 * Composes the shared DonutChart primitive (ring + bounded center label +
 * clockwise draw-in); this component owns the data prep, legend and layout.
 *
 * - Center label is bounded to the inner circle with auto-shrinking text so it
 *   never crosses the ring at any value/locale.
 * - The ring draws in as a single continuous clockwise sweep on mount and on
 *   data change (reduce-motion aware). The center label fades in.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';
import { DonutChart } from '../charts/DonutChart';
import { Card } from '../ui/Card';

interface DonutDataItem {
    name: string;
    value: number;
    color: string;
    percentage: number;
}

interface ReportDonutChartProps {
    data: DonutDataItem[];
    totalExpense: number;
}

export const ReportDonutChart: React.FC<ReportDonutChartProps> = ({
    data,
    totalExpense,
}) => {
    const { t } = useTranslation();
    const { colors, typography, spacing } = useTheme();
    const { formatAmount } = useFormatting();

    // Donut chart parameters
    const size = 160;
    const strokeWidth = 28;

    // Handle empty state
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
                    {t('reports.expenseDistribution')}
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        {t('components.spendingBreakdown.noData')}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing.xs }}>
                        {t('components.spendingBreakdown.noDataHint')}
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
                {t('reports.expenseDistribution')}
            </Text>

            {/* Chart */}
            <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                <DonutChart
                    segments={data}
                    size={size}
                    strokeWidth={strokeWidth}
                    total={totalExpense}
                    centerLabel={
                        <>
                            <Text
                                numberOfLines={1}
                                style={{
                                    color: colors.mutedForeground,
                                    fontSize: typography.sizes.xs,
                                    fontWeight: typography.weights.medium,
                                    textAlign: 'center',
                                }}
                            >
                                {t('components.spendingBreakdown.total')}
                            </Text>
                            <Text
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.5}
                                ellipsizeMode="tail"
                                style={{
                                    color: colors.foreground,
                                    fontSize: typography.sizes.lg,
                                    fontWeight: typography.weights.bold,
                                    textAlign: 'center',
                                }}
                            >
                                {formatAmount(totalExpense)}
                            </Text>
                        </>
                    }
                />
            </View>

            {/* Legend */}
            <View style={styles.legend}>
                {data.map((item, index) => (
                    <View key={index} style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: item.color }]} />
                        <Text
                            style={{
                                color: colors.mutedForeground,
                                fontSize: typography.sizes.xs,
                                flex: 1,
                            }}
                            numberOfLines={1}
                        >
                            {item.name}
                        </Text>
                        <Text
                            style={{
                                color: colors.foreground,
                                fontSize: typography.sizes.xs,
                                fontWeight: typography.weights.semibold,
                            }}
                        >
                            {item.percentage.toFixed(0)}%
                        </Text>
                    </View>
                ))}
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    legend: {
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
});
