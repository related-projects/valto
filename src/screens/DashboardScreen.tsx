import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCard } from '../components/dashboard/BalanceCard';
import { BudgetProgress } from '../components/dashboard/BudgetProgress';
import { QuickActions } from '../components/dashboard/QuickActions';
import { SpendingChart } from '../components/dashboard/SpendingChart';
import { WalletList } from '../components/dashboard/WalletList';
import { TransactionList } from '../components/transactions/TransactionList';
import { Card } from '../components/ui/Card';
import { SectionHeader } from '../components/ui/SectionHeader';
import {
    mockBudget,
    mockSpendingData,
    mockTransactions,
    mockWallets,
} from '../data/mockData';
import { useTheme } from '../theme/theme';

export const DashboardScreen = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setTimeout(() => {
            setRefreshing(false);
        }, 2000);
    }, []);

    const totalBalance = mockWallets.reduce((sum, w) => sum + w.balance, 0);
    const monthlyIncome = mockTransactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    const monthlyExpense = mockTransactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingBottom: 100,
            }}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                    Good morning
                </Text>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes['2xl'],
                        fontWeight: 'bold',
                    }}
                >
                    Dashboard
                </Text>
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
                    onAddExpense={() => { }}
                    onAddIncome={() => { }}
                    onTransfer={() => { }}
                />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <WalletList wallets={mockWallets} />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                    <Card padding="none" style={{ overflow: 'hidden' }}>
                        <SectionHeader
                            title="Recent Transactions"
                            action="View All"
                            onActionPress={() => { }}
                            style={{
                                backgroundColor: '#f7f8f7',
                                paddingHorizontal: 20,
                                paddingVertical: 16,
                                marginBottom: 0,
                            }}
                        />
                        <TransactionList transactions={mockTransactions.slice(0, 5)} showDateHeaders={true} />
                    </Card>
                </View>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
