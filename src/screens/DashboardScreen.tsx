import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCard } from '../components/dashboard/BalanceCard';
import { BudgetProgress } from '../components/dashboard/BudgetProgress';
import { QuickActions } from '../components/dashboard/QuickActions';
import { SpendingChart } from '../components/dashboard/SpendingChart';
import { WalletList } from '../components/dashboard/WalletList';
import { TransactionList } from '../components/transactions/TransactionList';
import { Avatar } from '../components/ui/Avatar';
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
                    onAddExpense={() => { }}
                    onAddIncome={() => { }}
                    onTransfer={() => { }}
                />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <WalletList wallets={mockWallets} />
            </View>

            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
                <Card>
                    <SectionHeader title="Recent Transactions" />
                    <TransactionList transactions={mockTransactions.slice(0, 5)} showDateHeaders={false} />
                </Card>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
