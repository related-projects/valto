import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Transaction } from '../../domain/entities';
import { useCategories } from '../../hooks/useCategories';
import { useWallets } from '../../hooks/useWallets';
import { useTheme } from '../../theme/theme';
import { formatAmount } from '../../utils/formatAmount';

interface TransactionListProps {
    transactions: Transaction[];
    showDateHeaders?: boolean;
    currency?: string;
}

const groupByDate = (transactions: Transaction[]) => {
    const groups: Record<string, Transaction[]> = {};

    transactions.forEach((transaction) => {
        const date = transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let dateKey: string;
        if (date.toDateString() === today.toDateString()) {
            dateKey = 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            dateKey = 'Yesterday';
        } else {
            dateKey = date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
            });
        }

        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(transaction);
    });

    return groups;
};

export const TransactionList: React.FC<TransactionListProps> = ({
    transactions,
    showDateHeaders = true,
    currency = '$',
}) => {
    const { colors, typography, spacing, radius } = useTheme();
    const { categories } = useCategories();
    const { wallets } = useWallets();

    // Helper to get category name from ID
    const getCategoryName = (categoryId: string): string => {
        if (categoryId === 'transfer-in' || categoryId === 'transfer-out') return 'Transfer';
        const category = categories.find(c => c.id === categoryId);
        return category?.name || 'Unknown';
    };

    // Helper to get wallet name from ID
    const getWalletName = (walletId: string): string => {
        const wallet = wallets.find(w => w.id === walletId);
        return wallet?.name || 'Unknown';
    };

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

    if (transactions.length === 0) {
        return (
            <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 32 }}>📭</Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '500', marginBottom: 4 }}>
                    No transactions yet
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                    Tap the + button to add your first transaction
                </Text>
            </View>
        );
    }

    if (!showDateHeaders) {
        return (
            <View style={{ gap: 4 }}>
                {transactions.map((transaction) => {
                    const categoryName = getCategoryName(transaction.categoryId);
                    const categoryColor = getCategoryColor(categoryName);
                    return (
                        <TouchableOpacity
                            key={transaction.id}
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
                                    {transaction.note || getWalletName(transaction.walletId)}
                                </Text>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textTransform: 'capitalize' }}>
                                    {categoryName}
                                </Text>
                            </View>
                            <Text
                                style={{
                                    color: transaction.type === 'income' || transaction.categoryId === 'transfer-in' ? colors.success : colors.foreground,
                                    fontWeight: '600',
                                    fontSize: typography.sizes.sm,
                                }}
                            >
                                {transaction.type === 'income' || transaction.categoryId === 'transfer-in' ? '+' : '-'}{formatAmount(transaction.amount, currency).replace(/^\$/, '')}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    }

    const grouped = groupByDate(transactions);

    return (
        <View style={{ gap: 0 }}>
            {Object.entries(grouped).map(([date, items]) => (
                <View key={date}>
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
                            {date}
                        </Text>
                    </View>
                    <View>
                        {items.map((transaction) => {
                            const categoryName = getCategoryName(transaction.categoryId);
                            const categoryColor = getCategoryColor(categoryName);
                            return (
                                <TouchableOpacity
                                    key={transaction.id}
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
                                                backgroundColor: `${categoryColor}15`, // Slightly lighter tint
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
                                        {transaction.type === 'income' || transaction.categoryId === 'transfer-in' ? '+' : '-'}{formatAmount(transaction.amount, currency).replace(/^\$/, '')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            ))}
        </View>
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
