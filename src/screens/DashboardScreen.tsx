import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCard } from '../components/dashboard/BalanceCard';
import { BudgetProgress } from '../components/dashboard/BudgetProgress';
import { QuickActions } from '../components/dashboard/QuickActions';
import { SpendingChart } from '../components/dashboard/SpendingChart';
import { WalletList } from '../components/dashboard/WalletList';
import { AddTransactionModal } from '../components/modals/AddTransactionModal';
import { TransactionList } from '../components/transactions/TransactionList';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { SectionHeader } from '../components/ui/SectionHeader';
import { mockBudget, mockSpendingData } from '../data/mockData';
import { useTransactions } from '../hooks/useTransactions';
import { useWallets } from '../hooks/useWallets';
import { useTheme } from '../theme/theme';

export const DashboardScreen = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<'expense' | 'income'>('expense');

    // Hooks for real data
    const { transactions, refreshTransactions } = useTransactions();
    const { wallets, getTotalBalance, refreshWallets } = useWallets();

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refreshTransactions(), refreshWallets()]);
        setRefreshing(false);
    }, [refreshTransactions, refreshWallets]);

    const totalBalance = getTotalBalance();
    const monthlyIncome = transactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    const monthlyExpense = transactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    const handleAddExpense = () => {
        setModalType('expense');
        setModalVisible(true);
    };

    const handleAddIncome = () => {
        setModalType('income');
        setModalVisible(true);
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
                    monthlyIncome={monthlyIncome}
                    monthlyExpense={monthlyExpense}
                />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <BudgetProgress spent={mockBudget.spent} budget={mockBudget.budget} />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <SpendingChart data={mockSpendingData} />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <QuickActions
                    onAddExpense={handleAddExpense}
                    onAddIncome={handleAddIncome}
                    onTransfer={() => { }}
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
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
