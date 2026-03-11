import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    FlatList,
    ListRenderItemInfo,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Transaction } from '../../domain/entities';
import { useCategories } from '../../hooks/useCategories';
import { useFormatting } from '../../hooks/useFormatting';
import { useWallets } from '../../hooks/useWallets';
import { useTheme } from '../../theme/theme';

interface TransactionListProps {
    transactions: Transaction[];
    showDateHeaders?: boolean;
    /** Called when the user scrolls near the end of the list */
    onEndReached?: () => void;
    /** Whether more data is currently being loaded */
    loadingMore?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

interface SectionItem {
    type: 'header';
    key: string;
    title: string;
}

interface TransactionItem {
    type: 'transaction';
    key: string;
    transaction: Transaction;
}

type ListItem = SectionItem | TransactionItem;

const ITEM_HEIGHT = 72;
const HEADER_HEIGHT = 44;

const buildSectionedData = (
    transactions: Transaction[],
    todayLabel: string,
    yesterdayLabel: string,
    locale: string = 'en',
): ListItem[] => {
    const items: ListItem[] = [];
    const groups: Record<string, Transaction[]> = {};
    const order: string[] = [];

    transactions.forEach((transaction) => {
        const date = transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let dateKey: string;
        if (date.toDateString() === today.toDateString()) {
            dateKey = todayLabel;
        } else if (date.toDateString() === yesterday.toDateString()) {
            dateKey = yesterdayLabel;
        } else {
            dateKey = date.toLocaleDateString(locale, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
            });
        }

        if (!groups[dateKey]) {
            groups[dateKey] = [];
            order.push(dateKey);
        }
        groups[dateKey].push(transaction);
    });

    for (const dateKey of order) {
        items.push({ type: 'header', key: `header-${dateKey}`, title: dateKey });
        for (const tx of groups[dateKey]) {
            items.push({ type: 'transaction', key: tx.id, transaction: tx });
        }
    }

    return items;
};

// ─── Component ────────────────────────────────────────────────────────

export const TransactionList: React.FC<TransactionListProps> = ({
    transactions,
    showDateHeaders = true,
    onEndReached,
    loadingMore = false,
}) => {
    const { t, i18n } = useTranslation();
    const { colors, typography, spacing, radius } = useTheme();
    const { categories } = useCategories();
    const { wallets } = useWallets();
    const { formatAmount } = useFormatting();

    // Helper to get category name from ID
    const getCategoryName = useCallback((categoryId: string): string => {
        if (categoryId === 'transfer-in' || categoryId === 'transfer-out') return t('components.transactionList.transfer');
        const category = categories.find(c => c.id === categoryId);
        return category?.name || t('components.transactionList.unknown');
    }, [categories, t]);

    // Helper to get wallet name from ID
    const getWalletName = useCallback((walletId: string): string => {
        const wallet = wallets.find(w => w.id === walletId);
        return wallet?.name || t('components.transactionList.unknown');
    }, [wallets, t]);

    const getIconName = (categoryName: string): keyof typeof Ionicons.glyphMap => {
        const lowerName = categoryName.toLowerCase();
        if (lowerName.includes('food') || lowerName.includes('dining')) return 'restaurant-outline';
        if (lowerName.includes('shopping')) return 'cart-outline';
        if (lowerName.includes('transport')) return 'car-outline';
        if (lowerName.includes('entertainment')) return 'film-outline';
        if (lowerName.includes('utilities')) return 'flash-outline';
        if (lowerName.includes('salary') || lowerName.includes('income')) return 'cash-outline';
        if (lowerName.includes('health')) return 'medical-outline';
        if (lowerName.includes('education')) return 'school-outline';
        return 'card-outline';
    };

    const getCategoryColor = (categoryName: string) => {
        const lowerName = categoryName.toLowerCase();
        if (lowerName.includes('shopping')) return '#8B5CF6';
        if (lowerName.includes('food') || lowerName.includes('dining')) return '#F59E0B';
        if (lowerName.includes('transport')) return '#3B82F6';
        if (lowerName.includes('entertainment')) return '#EC4899';
        if (lowerName.includes('utilities')) return '#10B981';
        if (lowerName.includes('salary') || lowerName.includes('income')) return '#4ade80';
        if (lowerName.includes('health')) return '#14B8A6';
        if (lowerName.includes('education')) return '#8B5CF6';
        return colors.accent;
    };

    // Format display amount
    const displayTransactionAmount = (amount: number, type: string, categoryId: string) => {
        const formatted = formatAmount(amount);
        const isIncome = type === 'income' || categoryId === 'transfer-in';
        const sign = isIncome ? '+' : '-';
        return `${sign}${formatted}`;
    };

    // ─── Empty state ──────────────────────────────────────────────────

    if (transactions.length === 0) {
        return (
            <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 32 }}>📭</Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '500', marginBottom: 4 }}>
                    {t('components.transactionList.empty')}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                    {t('components.transactionList.emptyHint')}
                </Text>
            </View>
        );
    }

    // ─── Flat (no headers) ────────────────────────────────────────────

    if (!showDateHeaders) {
        const renderFlatItem = ({ item }: ListRenderItemInfo<Transaction>) => {
            const categoryName = getCategoryName(item.categoryId);
            const categoryColor = getCategoryColor(categoryName);
            return (
                <TouchableOpacity
                    style={[
                        styles.transactionItem,
                        {
                            paddingVertical: spacing.sm,
                            paddingHorizontal: 0,
                        },
                    ]}
                >
                    <View
                        style={[
                            styles.iconContainer,
                            {
                                backgroundColor: `${categoryColor}20`,
                                borderRadius: radius.md,
                            },
                        ]}
                    >
                        <Ionicons
                            name={getIconName(categoryName)}
                            size={20}
                            color={categoryColor}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                            {item.note || getWalletName(item.walletId)}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textTransform: 'capitalize' }}>
                            {categoryName}
                        </Text>
                    </View>
                    <Text
                        style={{
                            color: item.type === 'income' || item.categoryId === 'transfer-in' ? colors.success : colors.foreground,
                            fontWeight: '600',
                            fontSize: typography.sizes.sm,
                        }}
                    >
                        {displayTransactionAmount(item.amount, item.type, item.categoryId)}
                    </Text>
                </TouchableOpacity>
            );
        };

        return (
            <FlatList
                data={transactions}
                renderItem={renderFlatItem}
                keyExtractor={(item) => item.id}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={5}
                scrollEnabled={false}
                onEndReached={onEndReached}
                onEndReachedThreshold={0.3}
            />
        );
    }

    // ─── Sectioned (with date headers) ────────────────────────────────

    const sectionedData = buildSectionedData(
        transactions,
        t('components.transactionList.today'),
        t('components.transactionList.yesterday'),
        i18n.language,
    );

    const getItemLayout = (_data: ArrayLike<ListItem> | null | undefined, index: number) => {
        // Approximate — headers and items have different heights
        const item = sectionedData[index];
        const height = item?.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT;
        return { length: height, offset: index * ITEM_HEIGHT, index };
    };

    const renderSectionedItem = ({ item }: ListRenderItemInfo<ListItem>) => {
        if (item.type === 'header') {
            return (
                <View style={{ backgroundColor: '#f7f8f7', paddingVertical: 12, paddingHorizontal: 20 }}>
                    <Text
                        style={{
                            color: colors.mutedForeground,
                            fontSize: 13,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                        }}
                    >
                        {item.title}
                    </Text>
                </View>
            );
        }

        const transaction = item.transaction;
        const categoryName = getCategoryName(transaction.categoryId);
        const categoryColor = getCategoryColor(categoryName);

        return (
            <TouchableOpacity
                style={[
                    styles.transactionItem,
                    {
                        paddingVertical: 16,
                        paddingHorizontal: 20,
                        backgroundColor: colors.card,
                    },
                ]}
            >
                <View
                    style={[
                        styles.iconContainer,
                        {
                            backgroundColor: `${categoryColor}15`,
                            borderRadius: 12,
                            width: 44,
                            height: 44,
                        },
                    ]}
                >
                    <Ionicons
                        name={getIconName(categoryName)}
                        size={22}
                        color={categoryColor}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '600', marginBottom: 2 }}>
                        {transaction.note || getWalletName(transaction.walletId)}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, textTransform: 'capitalize' }}>
                        {categoryName}
                    </Text>
                </View>
                <Text
                    style={{
                        color: transaction.type === 'income' || transaction.categoryId === 'transfer-in' ? colors.success : colors.foreground,
                        fontWeight: '600',
                        fontSize: 16,
                    }}
                >
                    {displayTransactionAmount(transaction.amount, transaction.type, transaction.categoryId)}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent} />
            </View>
        );
    };

    return (
        <FlatList
            data={sectionedData}
            renderItem={renderSectionedItem}
            keyExtractor={(item) => item.key}
            getItemLayout={getItemLayout}
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={7}
            scrollEnabled={false}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
        />
    );
};

const styles = StyleSheet.create({
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    transactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        padding: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
