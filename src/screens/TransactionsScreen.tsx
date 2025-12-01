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
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: isActive ? colors.accent : colors.background,
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
        <View style={[styles.container, { backgroundColor: colors.screenBackground, paddingTop: insets.top }]}>
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
                            marginLeft: 8,
                        }}
                    >
                        <Ionicons name="options-outline" size={20} color={colors.foreground} />
                    </TouchableOpacity>
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
