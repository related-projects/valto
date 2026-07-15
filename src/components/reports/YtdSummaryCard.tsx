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

interface YtdSummaryCardProps {
    totalIncome: number;
    totalExpenses: number;
    net: number;
    /** Savings rate as 0-1 decimal */
    savingsRate: number;
    year: number;
}

export const YtdSummaryCard: React.FC<YtdSummaryCardProps> = ({
    totalIncome,
    totalExpenses,
    net,
    savingsRate,
    year,
}) => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const { formatAmount } = useFormatting();

    const savingsRateDisplay = `${(savingsRate * 100).toFixed(1)}%`;
    const netColor = net >= 0 ? colors.success : colors.destructive;

    return (
        <View
            style={{
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                padding: spacing.md,
                ...shadows.card,
            }}
        >
            <Text
                style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.md,
                    fontWeight: typography.weights.semibold,
                    marginBottom: spacing.sm,
                }}
            >
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
                    color={savingsRate >= 0.2 ? colors.success : savingsRate >= 0 ? colors.warning : colors.destructive}
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
