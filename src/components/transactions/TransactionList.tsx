import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';

interface Transaction {
    id: string;
    title: string;
    category: string;
    amount: number;
    type: string;
    date: string;
}

interface TransactionListProps {
    transactions: Transaction[];
    showDateHeaders?: boolean;
    currency?: string;
}

const groupByDate = (transactions: Transaction[]) => {
    const groups: Record<string, Transaction[]> = {};

    transactions.forEach((transaction) => {
        const date = new Date(transaction.date);
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

    const getIconName = (category: string): keyof typeof Ionicons.glyphMap => {
        switch (category) {
            case 'shopping': return 'cart-outline';
            case 'food': return 'fast-food-outline';
            case 'transport': return 'car-outline';
            case 'entertainment': return 'film-outline';
            case 'utilities': return 'flash-outline';
            case 'salary': return 'cash-outline';
            default: return 'card-outline';
        }
    };

    const getCategoryColor = (category: string) => {
        const colorMap: Record<string, string> = {
            shopping: '#8B5CF6',
            food: '#F59E0B',
            transport: '#3B82F6',
            entertainment: '#EC4899',
            utilities: '#10B981',
            salary: '#4ade80',
        };
        return colorMap[category] || colors.accent;
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
                    const categoryColor = getCategoryColor(transaction.category);
                    return (
                        <TouchableOpacity
                            key={transaction.id}
                            style={[
                                styles.transactionItem,
                                {
                                    backgroundColor: colors.secondary,
                                    borderRadius: radius.lg,
                                    padding: spacing.sm,
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
                                    name={getIconName(transaction.category)}
                                    size={20}
                                    color={categoryColor}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                                    {transaction.title}
                                </Text>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textTransform: 'capitalize' }}>
                                    {transaction.category}
                                </Text>
                            </View>
                            <Text
                                style={{
                                    color: transaction.type === 'income' ? colors.success : colors.foreground,
                                    fontWeight: '600',
                                    fontSize: typography.sizes.sm,
                                }}
                            >
                                {transaction.type === 'income' ? '+' : '-'}{currency}{transaction.amount.toFixed(2)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    }

    const grouped = groupByDate(transactions);

    return (
        <View style={{ gap: 16 }}>
            {Object.entries(grouped).map(([date, items]) => (
                <View key={date}>
                    <Text
                        style={{
                            color: colors.mutedForeground,
                            fontSize: typography.sizes.xs,
                            fontWeight: '500',
                            marginBottom: 8,
                            paddingHorizontal: 4,
                        }}
                    >
                        {date}
                    </Text>
                    <View style={{ gap: 4 }}>
                        {items.map((transaction) => {
                            const categoryColor = getCategoryColor(transaction.category);
                            return (
                                <TouchableOpacity
                                    key={transaction.id}
                                    style={[
                                        styles.transactionItem,
                                        {
                                            backgroundColor: colors.secondary,
                                            borderRadius: radius.lg,
                                            padding: spacing.sm,
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
                                            name={getIconName(transaction.category)}
                                            size={20}
                                            color={categoryColor}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                                            {transaction.title}
                                        </Text>
                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textTransform: 'capitalize' }}>
                                            {transaction.category}
                                        </Text>
                                    </View>
                                    <Text
                                        style={{
                                            color: transaction.type === 'income' ? colors.success : colors.foreground,
                                            fontWeight: '600',
                                            fontSize: typography.sizes.sm,
                                        }}
                                    >
                                        {transaction.type === 'income' ? '+' : '-'}{currency}{transaction.amount.toFixed(2)}
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
