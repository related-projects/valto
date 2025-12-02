import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionList } from '../components/transactions/TransactionList';
import { InputField } from '../components/ui/InputField';
import { mockTransactions } from '../data/mockData';
import { useTheme } from '../theme/theme';

type FilterType = 'all' | 'income' | 'expense' | 'transfer';

export const TransactionsScreen = () => {
    const { colors, spacing, typography, radius } = useTheme();
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

    const FilterPill = ({ label, value }: { label: string; value: FilterType }) => {
        const isActive = activeFilter === value;
        return (
            <TouchableOpacity
                onPress={() => setActiveFilter(value)}
                style={{
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: isActive ? colors.accent : colors.card,
                    borderWidth: 1,
                    borderColor: isActive ? colors.accent : colors.border,
                    marginRight: 8,
                }}
            >
                <Text
                    style={{
                        color: isActive ? '#FFFFFF' : colors.foreground,
                        fontWeight: isActive ? '600' : '400',
                        fontSize: 14,
                    }}
                >
                    {label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: 28,
                        fontWeight: '700',
                        marginBottom: 20,
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
                    style={{ fontSize: 15 }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
                        <FilterPill label="All" value="all" />
                        <FilterPill label="Income" value="income" />
                        <FilterPill label="Expense" value="expense" />
                        <FilterPill label="Transfer" value="transfer" />
                    </ScrollView>
                    <TouchableOpacity
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: colors.card,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: 8,
                        }}
                    >
                        <Ionicons name="options-outline" size={20} color={colors.foreground} />
                    </TouchableOpacity>
                </View>

                {/* Income and Expenses Summary Cards */}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    {/* Income Card */}
                    <View style={{
                        flex: 1,
                        backgroundColor: '#E8F5E9',
                        borderRadius: 16,
                        padding: 16,
                    }}>
                        <Text style={{ color: '#2E7D32', fontSize: 14, marginBottom: 4 }}>
                            Income
                        </Text>
                        <Text style={{ color: '#2E7D32', fontSize: 20, fontWeight: '700' }}>
                            ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </Text>
                    </View>

                    {/* Expenses Card */}
                    <View style={{
                        flex: 1,
                        backgroundColor: '#FFEBEE',
                        borderRadius: 16,
                        padding: 16,
                    }}>
                        <Text style={{ color: '#C62828', fontSize: 14, marginBottom: 4 }}>
                            Expenses
                        </Text>
                        <Text style={{ color: '#C62828', fontSize: 20, fontWeight: '700' }}>
                            ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </Text>
                    </View>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingBottom: 100 // Extra padding for tab bar + FAB
                }}
            >
                <View style={{
                    marginTop: 8,
                    backgroundColor: colors.card,
                    borderRadius: 24,
                    overflow: 'hidden',
                    shadowColor: "#000",
                    shadowOffset: {
                        width: 0,
                        height: 2,
                    },
                    shadowOpacity: 0.05,
                    shadowRadius: 8,
                    elevation: 2,
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
