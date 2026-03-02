import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCard } from '../components/dashboard/BalanceCard';
import { BudgetProgress } from '../components/dashboard/BudgetProgress';
import { InsightBanner, InsightVariant } from '../components/dashboard/InsightBanner';
import { QuickActions } from '../components/dashboard/QuickActions';
import { SpendingBreakdown } from '../components/dashboard/SpendingBreakdown';
import { WalletList } from '../components/dashboard/WalletList';
import { AddBudgetModal } from '../components/modals/AddBudgetModal';
import { AddTransactionModal } from '../components/modals/AddTransactionModal';
import { TransferModal } from '../components/modals/TransferModal';
import { TransactionList } from '../components/transactions/TransactionList';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { SectionHeader } from '../components/ui/SectionHeader';
import { SavingsLevel } from '../domain/insights';
import { useBudgets } from '../hooks/useBudgets';
import { useDashboard } from '../hooks/useDashboard';
import { useFinancialInsights } from '../hooks/useFinancialInsights';
import { useTransactions } from '../hooks/useTransactions';
import { useWallets } from '../hooks/useWallets';
import { useTheme } from '../theme/theme';

/** Map savings-health level → visual variant */
const SAVINGS_VARIANT: Record<SavingsLevel, InsightVariant> = {
    deficit: 'destructive',
    weak: 'warning',
    acceptable: 'neutral',
    strong: 'success',
};

export const DashboardScreen = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<'expense' | 'income'>('expense');
    const [transferModalVisible, setTransferModalVisible] = useState(false);
    const [budgetModalVisible, setBudgetModalVisible] = useState(false);

    // Hooks for real data
    const { transactions, refreshTransactions } = useTransactions();
    const { wallets, getTotalBalance, refreshWallets } = useWallets();
    const {
        spendingByCategory,
        currentMonthIncome,
        currentMonthExpense,
        netBalance,
        incomeChange,
        expenseChange,
        netBalanceChange,
    } = useDashboard();
    const {
        budgetSummaries,
        totalBudgetLimit,
        totalBudgetSpent,
        hasBudgets,
        createBudget,
        refreshBudgets,
        budgetedCategoryIds,
    } = useBudgets();

    // Financial Insights
    const { savingsHealth, categoryRisk, budgetPace } = useFinancialInsights();

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refreshTransactions(), refreshWallets(), refreshBudgets()]);
        setRefreshing(false);
    }, [refreshTransactions, refreshWallets, refreshBudgets]);

    const totalBalance = getTotalBalance();

    const handleAddExpense = () => {
        setModalType('expense');
        setModalVisible(true);
    };

    const handleAddIncome = () => {
        setModalType('income');
        setModalVisible(true);
    };

    const handleTransfer = () => {
        setTransferModalVisible(true);
    };

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingBottom: spacing.tabBarOffset,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                    Good morning
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text
                        style={{
                            color: colors.foreground,
                            fontSize: typography.sizes['3xl'],
                            fontWeight: typography.weights.bold,
                        }}
                    >
                        Dashboard
                    </Text>
                    <Avatar label="V" size="sm" />
                </View>
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <BalanceCard
                    totalBalance={totalBalance}
                    monthlyIncome={currentMonthIncome}
                    monthlyExpense={currentMonthExpense}
                    netBalance={netBalance}
                    incomeChange={incomeChange}
                    expenseChange={expenseChange}
                    netBalanceChange={netBalanceChange}
                />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                <InsightBanner
                    message={savingsHealth.message}
                    variant={SAVINGS_VARIANT[savingsHealth.level]}
                    icon="pulse-outline"
                />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <BudgetProgress
                    budgetSummaries={budgetSummaries}
                    totalSpent={totalBudgetSpent}
                    totalLimit={totalBudgetLimit}
                    hasBudgets={hasBudgets}
                    onCreateBudget={() => setBudgetModalVisible(true)}
                />
            </View>

            {budgetPace && (
                <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                    <InsightBanner
                        message={budgetPace.message}
                        variant={budgetPace.overBudgetPace ? 'warning' : 'success'}
                        icon="speedometer-outline"
                    />
                </View>
            )}

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <SpendingBreakdown data={spendingByCategory} />
            </View>

            {categoryRisk.riskLevel !== 'low' && (
                <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                    <InsightBanner
                        message={`${categoryRisk.topCategory} accounts for ${categoryRisk.percentage.toFixed(0)}% of your spending.`}
                        variant={categoryRisk.riskLevel === 'high' ? 'destructive' : 'warning'}
                        icon="pie-chart-outline"
                    />
                </View>
            )}

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <QuickActions
                    onAddExpense={handleAddExpense}
                    onAddIncome={handleAddIncome}
                    onTransfer={handleTransfer}
                />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <WalletList wallets={wallets} />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <Card>
                    <SectionHeader title="Recent Transactions" />
                    <TransactionList transactions={transactions.slice(0, 5)} showDateHeaders={false} />
                </Card>
            </View>

            <AddTransactionModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                onSuccess={async () => {
                    await Promise.all([refreshTransactions(), refreshWallets()]);
                }}
            />

            <TransferModal
                visible={transferModalVisible}
                onClose={() => setTransferModalVisible(false)}
                onSuccess={async () => {
                    await Promise.all([refreshTransactions(), refreshWallets()]);
                }}
            />

            <AddBudgetModal
                visible={budgetModalVisible}
                onClose={() => setBudgetModalVisible(false)}
                onCreateBudget={async (dto) => {
                    await createBudget(dto);
                }}
                budgetedCategoryIds={budgetedCategoryIds}
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
