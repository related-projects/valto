/**
 * YtdSummaryCard
 *
 * Displays Year-to-Date financial summary metrics.
 * Non-intrusive card that integrates into the Reports screen.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';
import { EMPTY_VALUE_PLACEHOLDER } from '../../utils/placeholders';

interface YtdSummaryCardProps {
    totalIncome: number;
    totalExpenses: number;
    net: number;
    /** Savings rate as 0-1 decimal. null when the year had no income. */
    savingsRate: number | null;
    year: number;
    /**
     * Whether the year holds any transaction at all. False renders an empty
     * state: with no rows behind them, four zeros would claim a measurement that
     * was never taken.
     */
    hasActivity: boolean;
}

export const YtdSummaryCard: React.FC<YtdSummaryCardProps> = ({
    totalIncome,
    totalExpenses,
    net,
    savingsRate,
    year,
    hasActivity,
}) => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const { formatAmount } = useFormatting();

    const savingsRateDisplay = savingsRate !== null
        ? `${(savingsRate * 100).toFixed(1)}%`
        : EMPTY_VALUE_PLACEHOLDER;
    const savingsRateColor = savingsRate === null
        ? colors.mutedForeground
        : savingsRate >= 0.2 ? colors.success : savingsRate >= 0 ? colors.warning : colors.destructive;
    const netColor = net >= 0 ? colors.success : colors.destructive;

    // This card keeps its own surface rather than the shared Card component, so the
    // empty state is nested inside that surface. The inner shape - title, then one
    // centred muted line at spacing.xl - is the same idiom CategoryBreakdownTable
    // and ReportDonutChart use on this screen.
    const cardStyle = {
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: spacing.md,
        ...shadows.card,
    };

    const titleStyle = {
        color: colors.foreground,
        fontSize: typography.sizes.md,
        fontWeight: typography.weights.semibold,
        marginBottom: spacing.sm,
    };

    if (!hasActivity) {
        return (
            <View style={cardStyle}>
                <Text style={titleStyle}>
                    {t('reports.ytdSummary.title', { year })}
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        {t('reports.ytdSummary.noActivity')}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={cardStyle}>
            <Text style={titleStyle}>
                {t('reports.ytdSummary.title', { year })}
            </Text>

            {/* Grid of metrics */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <MetricItem
                    label={t('reports.ytdSummary.income')}
                    value={formatAmount(totalIncome)}
                    color={colors.success}
                    typography={typography}
                    colors={colors}
                />
                <MetricItem
                    label={t('reports.ytdSummary.expenses')}
                    value={formatAmount(totalExpenses)}
                    color={colors.destructive}
                    typography={typography}
                    colors={colors}
                />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <MetricItem
                    label={t('reports.ytdSummary.net')}
                    value={formatAmount(Math.abs(net))}
                    prefix={net >= 0 ? '+' : '-'}
                    color={netColor}
                    typography={typography}
                    colors={colors}
                />
                <MetricItem
                    label={t('reports.ytdSummary.savingsRate')}
                    value={savingsRateDisplay}
                    color={savingsRateColor}
                    typography={typography}
                    colors={colors}
                />
            </View>
        </View>
    );
};

// ─── Internal Metric Item ─────────────────────────────────────────────

interface MetricItemProps {
    label: string;
    value: string;
    prefix?: string;
    color: string;
    typography: any;
    colors: any;
}

const MetricItem: React.FC<MetricItemProps> = ({ label, value, prefix, color, typography, colors }) => (
    <View style={{ flex: 1, alignItems: 'flex-start', paddingVertical: 4 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
            {label}
        </Text>
        <Text style={{ color, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>
            {prefix}{value}
        </Text>
    </View>
);
