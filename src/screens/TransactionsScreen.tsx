import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionList } from '../components/transactions/TransactionList';
import { InputField } from '../components/ui/InputField';
import { mockTransactions } from '../data/mockData';
import { useTheme } from '../theme/theme';

type FilterType = 'all' | 'income' | 'expense';

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

    const FilterPill = ({ label, value }: { label: string; value: FilterType }) => {
        const isActive = activeFilter === value;
        return (
            <TouchableOpacity
                onPress={() => setActiveFilter(value)}
                style={{
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.full,
                    backgroundColor: isActive ? colors.primary : colors.secondary,
                    borderWidth: 1,
                    borderColor: isActive ? colors.primary : 'transparent',
                }}
            >
                <Text
                    style={{
                        color: isActive ? colors.primaryForeground : colors.mutedForeground,
                        fontWeight: '600',
                        fontSize: typography.sizes.sm,
                    }}
                >
                    {label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes['2xl'],
                        fontWeight: 'bold',
                        marginBottom: spacing.md,
                    }}
                >
                    Transactions
                </Text>
                <InputField
                    placeholder="Search transactions..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    leftIcon={<Ionicons name="search" size={20} color={colors.mutedForeground} />}
                />

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                    <FilterPill label="All" value="all" />
                    <FilterPill label="Income" value="income" />
                    <FilterPill label="Expense" value="expense" />
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing['3xl'] + 80 // Extra padding for tab bar + FAB
                }}
            >
                <View style={{ marginTop: spacing.sm }}>
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
