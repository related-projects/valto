import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionFilterModal } from '../components/modals/TransactionFilterModal';
import { TransactionList } from '../components/transactions/TransactionList';
import { FilterPill } from '../components/ui/FilterPill';
import { InputField } from '../components/ui/InputField';
import { StatCard } from '../components/ui/StatCard';
import { TransactionType } from '../domain/entities';
import { TransactionFilters } from '../domain/filters/filterTransactions';
import { useTransactions } from '../hooks/useTransactions';
import { useTheme } from '../theme/theme';

type FilterType = 'all' | 'income' | 'expense' | 'transfer';

export const TransactionsScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [filterModalVisible, setFilterModalVisible] = useState(false);

    // Get real transactions with pagination and filtering support
    const {
        filteredTransactions: hookFilteredTransactions,
        filters,
        setFilters,
        resetFilters,
        loadNextPage,
        loadingMore,
    } = useTransactions();

    /**
     * Compute the active filter count for the badge.
     * Counts each non-empty filter dimension as 1.
     */
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.types && filters.types.length > 0) count++;
        if (filters.categoryIds && filters.categoryIds.length > 0) count++;
        if (filters.walletIds && filters.walletIds.length > 0) count++;
        if (filters.startDate || filters.endDate) count++;
        if (filters.minAmount !== undefined || filters.maxAmount !== undefined) count++;
        return count;
    }, [filters]);

    /**
     * Apply quick-type pills + search on top of the hook-level filtered results.
     * The hook handles the modal filters; this layer adds the quick-access filters.
     */
    const displayedTransactions = useMemo(() => {
        return hookFilteredTransactions.filter((t) => {
            // Search by note field
            const matchesSearch = (t.note || '').toLowerCase().includes(searchQuery.toLowerCase());
            // Quick type pill filter (composable with modal filters)
            const matchesFilter = activeFilter === 'all' || t.type === activeFilter;
            return matchesSearch && matchesFilter;
        });
    }, [hookFilteredTransactions, searchQuery, activeFilter]);

    const { totalIncome, totalExpenses } = useMemo(() => {
        const income = displayedTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
        const expenses = displayedTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        return { totalIncome: income, totalExpenses: expenses };
    }, [displayedTransactions]);

    /**
     * Handle applying filters from the modal.
     * If the modal includes type filters, sync the quick pill to 'all'
     * to avoid conflicting double-filters.
     */
    const handleApplyFilters = (newFilters: TransactionFilters) => {
        setFilters(newFilters);
        // If the modal has type-level filters, reset the quick pill
        if (newFilters.types && newFilters.types.length > 0) {
            setActiveFilter('all');
        }
    };

    /**
     * Handle resetting all filters including the quick pill.
     */
    const handleResetFilters = () => {
        resetFilters();
        setActiveFilter('all');
        setSearchQuery('');
    };

    /**
     * Handle quick-type pill changes.
     * If user picks a specific type here and the modal also has types, clear modal types.
     */
    const handleQuickFilter = (type: FilterType) => {
        setActiveFilter(type);
        // If switching to a specific type via pills, clear the modal type filter to avoid conflicts
        if (type !== 'all' && filters.types && filters.types.length > 0) {
            setFilters({ ...filters, types: undefined });
        }
    };

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
                            backgroundColor: activeFilterCount > 0 ? colors.accent : colors.card,
                            borderWidth: 1,
                            borderColor: activeFilterCount > 0 ? colors.accent : colors.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onPress={() => setFilterModalVisible(true)}
                        testID="filter_icon_button"
                    >
                        <Ionicons
                            name="options-outline"
                            size={20}
                            color={activeFilterCount > 0 ? colors.accentForeground : colors.foreground}
                        />
                        {activeFilterCount > 0 && (
                            <View
                                style={{
                                    position: 'absolute',
                                    top: -4,
                                    right: -4,
                                    backgroundColor: colors.destructive,
                                    borderRadius: 10,
                                    minWidth: 18,
                                    height: 18,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingHorizontal: 4,
                                }}
                            >
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                                    {activeFilterCount}
                                </Text>
                            </View>
                        )}
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
                        <FilterPill label={t('transactions.filterAll')} isActive={activeFilter === 'all'} onPress={() => handleQuickFilter('all')} />
                        <FilterPill label={t('transactions.filterIncome')} isActive={activeFilter === 'income'} onPress={() => handleQuickFilter('income')} />
                        <FilterPill label={t('transactions.filterExpense')} isActive={activeFilter === 'expense'} onPress={() => handleQuickFilter('expense')} />
                        <FilterPill label={t('transactions.filterTransfer')} isActive={activeFilter === 'transfer'} onPress={() => handleQuickFilter('transfer')} />
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
                        transactions={displayedTransactions}
                        showDateHeaders={true}
                        onEndReached={loadNextPage}
                        loadingMore={loadingMore}
                    />
                </View>
            </ScrollView>

            {/* Filter Modal */}
            <TransactionFilterModal
                visible={filterModalVisible}
                onClose={() => setFilterModalVisible(false)}
                currentFilters={filters}
                onApply={handleApplyFilters}
                onReset={handleResetFilters}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
