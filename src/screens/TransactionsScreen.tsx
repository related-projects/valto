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
                    borderRadius: 999,
                    backgroundColor: isActive ? colors.accent : colors.background,
                    borderWidth: 1,
                    borderColor: isActive ? colors.accent : colors.border,
                }}
            >
                <Text
                    style={{
                        color: isActive ? '#FFFFFF' : colors.foreground,
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
        <View style={[styles.container, { backgroundColor: colors.screenBackground, paddingTop: insets.top }]}>
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
                    variant="pill"
                    leftIcon={<Ionicons name="search" size={20} color={colors.mutedForeground} />}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                        <FilterPill label="All" value="all" />
                        <FilterPill label="Income" value="income" />
                        <FilterPill label="Expense" value="expense" />
                    </ScrollView>
                    <TouchableOpacity
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: colors.background,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: spacing.sm,
                        }}
                    >
                        <Ionicons name="options-outline" size={20} color={colors.accent} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing['3xl'] + 80 // Extra padding for tab bar + FAB
                }}
            >
                <View style={{
                    marginTop: spacing.sm,
                    backgroundColor: colors.card,
                    borderRadius: radius.xl,
                    overflow: 'hidden',
                    ...useTheme().shadows.soft
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
