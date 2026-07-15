/**
 * SpendingBreakdown Component
 *
 * Displays a donut chart with category legend showing spending distribution.
 * Replaces the previous progress-bar style with a visual donut chart.
 * All data is received as props — no business logic here.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';
import { DonutChart } from '../charts/DonutChart';
import { Card } from '../ui/Card';

interface SpendingBreakdownProps {
    data: { name: string; value: number; color: string; percentage: number }[];
}

export const SpendingBreakdown: React.FC<SpendingBreakdownProps> = ({ data }) => {
    const { t } = useTranslation();
    const { colors, typography, spacing } = useTheme();
    const { formatAmount, formatAmountCompact } = useFormatting();

    // Handle empty state
    if (data.length === 0) {
        return (
            <Card>
                <Text style={{ color: colors.foreground, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
                    {t('components.spendingBreakdown.title')}
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

    const total = data.reduce((sum, item) => sum + item.value, 0);

    // Donut chart parameters
    const size = 130;
    const strokeWidth = 26;

    return (
        <Card>
            <Text style={{ color: colors.foreground, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing.lg }}>
                {t('components.spendingBreakdown.title')}
            </Text>

            <View style={styles.chartRow}>
                {/* Donut Chart */}
                <DonutChart
                    segments={data}
                    size={size}
                    strokeWidth={strokeWidth}
                    centerLabel={
                        <>
                            <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, fontWeight: typography.weights.medium, textAlign: 'center' }}>
                                {t('components.spendingBreakdown.total')}
                            </Text>
                            <Text
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.5}
                                ellipsizeMode="tail"
                                style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' }}
                            >
                                {formatAmountCompact(total)}
                            </Text>
                        </>
                    }
                />

                {/* Legend */}
                <View style={styles.legend}>
                    {data.map((item, index) => (
                        <View key={index} style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: item.color }]} />
                            <Text
                                style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, flex: 1 }}
                                numberOfLines={1}
                            >
                                {item.name}
                            </Text>
                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold }}>
                                {formatAmount(item.value)}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    chartRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    legend: {
        flex: 1,
        gap: 10,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});
