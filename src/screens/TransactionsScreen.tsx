import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionList } from '../components/transactions/TransactionList';
import { FilterPill } from '../components/ui/FilterPill';
import { InputField } from '../components/ui/InputField';
import { StatCard } from '../components/ui/StatCard';
import { useTransactions } from '../hooks/useTransactions';
import { useTheme } from '../theme/theme';

type FilterType = 'all' | 'income' | 'expense' | 'transfer';

export const TransactionsScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    // Get real transactions with pagination support
    const { transactions, loadNextPage, loadingMore } = useTransactions();

    const filteredTransactions = useMemo(() => {
        return transactions.filter((t) => {
            // Search by note field instead of title (since our domain model uses note)
            const matchesSearch = (t.note || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFilter = activeFilter === 'all' || t.type === activeFilter;
            return matchesSearch && matchesFilter;
        });
    }, [transactions, searchQuery, activeFilter]);

    const { totalIncome, totalExpenses } = useMemo(() => {
        const income = filteredTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
        const expenses = filteredTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        return { totalIncome: income, totalExpenses: expenses };
    }, [filteredTransactions]);



    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                    <Text
                        style={{
                            color: colors.foreground,
                            fontSize: typography.sizes['3xl'],
                            fontWeight: typography.weights.bold,
                            letterSpacing: -0.5,
                        }}
                    >
                        {t('transactions.title')}
                    </Text>
                    <TouchableOpacity
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: spacing.lg,
                            backgroundColor: colors.card,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Ionicons name="options-outline" size={20} color={colors.foreground} />
                    </TouchableOpacity>
                </View>
                <InputField
                    placeholder={t('transactions.searchPlaceholder')}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    variant="pill"
                    leftIcon={<Ionicons name="search" size={20} color={colors.mutedForeground} />}
                    style={{ fontSize: typography.sizes.sm }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.sm }}>
                        <FilterPill label={t('transactions.filterAll')} isActive={activeFilter === 'all'} onPress={() => setActiveFilter('all')} />
                        <FilterPill label={t('transactions.filterIncome')} isActive={activeFilter === 'income'} onPress={() => setActiveFilter('income')} />
                        <FilterPill label={t('transactions.filterExpense')} isActive={activeFilter === 'expense'} onPress={() => setActiveFilter('expense')} />
                        <FilterPill label={t('transactions.filterTransfer')} isActive={activeFilter === 'transfer'} onPress={() => setActiveFilter('transfer')} />
                    </ScrollView>
                </View>

                {/* Income and Expenses Summary Cards */}
                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                    <StatCard label={t('transactions.income')} amount={totalIncome} variant="success" />
                    <StatCard label={t('transactions.expenses')} amount={totalExpenses} variant="destructive" />
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: spacing.lg,
                    paddingBottom: spacing.tabBarOffset,
                }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{
                    marginTop: spacing.sm,
                    backgroundColor: colors.card,
                    borderRadius: radius.xl,
                    overflow: 'hidden',
                    ...shadows.card,
                }}>
                    <TransactionList
                        transactions={filteredTransactions}
                        showDateHeaders={true}
                        onEndReached={loadNextPage}
                        loadingMore={loadingMore}
                    />
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
