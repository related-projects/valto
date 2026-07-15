/**
 * ReportsScreen
 *
 * Monthly Reports screen with donut chart, financial summary,
 * and category breakdown table. Uses useReports for all data.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryBreakdownTable } from '../components/reports/CategoryBreakdownTable';
import { FinancialSummary } from '../components/reports/FinancialSummary';
import { MonthNavigator } from '../components/reports/MonthNavigator';
import { ReportDonutChart } from '../components/reports/ReportDonutChart';
import { YtdSummaryCard } from '../components/reports/YtdSummaryCard';
import { Avatar } from '../components/ui/Avatar';
import { useReports } from '../hooks/useReports';
import { useTheme } from '../theme/theme';

export const ReportsScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();

    const {
        monthLabel,
        goToPreviousMonth,
        goToNextMonth,
        totalIncome,
        totalExpense,
        netBalance,
        savingsRate,
        categoryBreakdown,
        hasExpenseData,
        ytdSummary,
        ytdYear,
    } = useReports();

    // Transform breakdown for the donut chart
    const donutData = categoryBreakdown.map(item => ({
        name: item.categoryName,
        value: item.amount,
        color: item.categoryColor,
        percentage: item.percentage,
    }));

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingBottom: spacing.tabBarOffset,
            }}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                    {t('reports.subtitle')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text
                        style={{
                            color: colors.foreground,
                            fontSize: typography.sizes['3xl'],
                            fontWeight: typography.weights.bold,
                        }}
                    >
                        {t('reports.title')}
                    </Text>
                    <Avatar label="V" size="sm" />
                </View>
            </View>

            {/* Month Navigator */}
            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <MonthNavigator
                    monthLabel={monthLabel}
                    onPrevious={goToPreviousMonth}
                    onNext={goToNextMonth}
                />
            </View>

            {/* Financial Summary */}
            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <FinancialSummary
                    totalIncome={totalIncome}
                    totalExpense={totalExpense}
                    netBalance={netBalance}
                    savingsRate={savingsRate}
                />
            </View>

            {/* Donut Chart */}
            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <ReportDonutChart
                    data={donutData}
                    totalExpense={totalExpense}
                />
            </View>

            {/* Category Breakdown Table */}
            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <CategoryBreakdownTable data={categoryBreakdown} />
            </View>

            {/* Year-to-Date Summary */}
            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <YtdSummaryCard
                    totalIncome={ytdSummary.totalIncome}
                    totalExpenses={ytdSummary.totalExpenses}
                    net={ytdSummary.net}
                    savingsRate={ytdSummary.savingsRate}
                    year={ytdYear}
                />
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
