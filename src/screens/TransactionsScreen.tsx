import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionList } from '../components/transactions/TransactionList';
import { FilterPill } from '../components/ui/FilterPill';
import { InputField } from '../components/ui/InputField';
import { StatCard } from '../components/ui/StatCard';
import { mockTransactions } from '../data/mockData';
import { useTheme } from '../theme/theme';

type FilterType = 'all' | 'income' | 'expense' | 'transfer';

export const TransactionsScreen = () => {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    const filteredTransactions = useMemo(() => {
        return mockTransactions.filter((t) => {
            const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.category.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFilter = activeFilter === 'all' || t.type === activeFilter;
            return matchesSearch && matchesFilter;
        });
    }, [searchQuery, activeFilter]);

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
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes['3xl'],
                        fontWeight: typography.weights.bold,
                        marginBottom: spacing.lg,
                        letterSpacing: -0.5,
                    }}
                >
                    Transactions
                </Text>
                <InputField
                    placeholder="Search transactions..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    variant="pill"
                    leftIcon={<Ionicons name="search" size={20} color={colors.mutedForeground} />}
                    style={{ fontSize: typography.sizes.sm }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.sm }}>
                        <FilterPill label="All" isActive={activeFilter === 'all'} onPress={() => setActiveFilter('all')} />
                        <FilterPill label="Income" isActive={activeFilter === 'income'} onPress={() => setActiveFilter('income')} />
                        <FilterPill label="Expense" isActive={activeFilter === 'expense'} onPress={() => setActiveFilter('expense')} />
                        <FilterPill label="Transfer" isActive={activeFilter === 'transfer'} onPress={() => setActiveFilter('transfer')} />
                    </ScrollView>
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
                            marginLeft: spacing.sm,
                        }}
                    >
                        <Ionicons name="options-outline" size={20} color={colors.foreground} />
                    </TouchableOpacity>
                </View>

                {/* Income and Expenses Summary Cards */}
                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                    <StatCard label="Income" amount={totalIncome} variant="success" />
                    <StatCard label="Expenses" amount={totalExpenses} variant="destructive" />
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: spacing.lg,
                    paddingBottom: spacing.tabBarOffset,
                }}
            >
                <View style={{
                    marginTop: spacing.sm,
                    backgroundColor: colors.card,
                    borderRadius: radius.xl,
                    overflow: 'hidden',
                    ...shadows.soft,
                }}>
                    <TransactionList transactions={filteredTransactions} showDateHeaders={true} />
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
