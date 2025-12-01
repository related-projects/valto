import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { ListItem } from '../ui/ListItem';

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
}

export const TransactionList: React.FC<TransactionListProps> = ({
    transactions,
    showDateHeaders = false,
}) => {
    const { colors, typography } = useTheme();

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

    return (
        <View>
            {transactions.map((transaction) => (
                <ListItem
                    key={transaction.id}
                    title={transaction.title}
                    subtitle={new Date(transaction.date).toLocaleDateString()}
                    leftIcon={
                        <View
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: colors.secondary,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Ionicons
                                name={getIconName(transaction.category)}
                                size={20}
                                color={colors.primaryForeground}
                            />
                        </View>
                    }
                    rightIcon={
                        <Text
                            style={{
                                color: transaction.type === 'income' ? colors.success : colors.foreground,
                                fontWeight: '600',
                                fontSize: typography.sizes.md,
                            }}
                        >
                            {transaction.type === 'income' ? '+' : '-'}${transaction.amount.toFixed(2)}
                        </Text>
                    }
                    onPress={() => { }}
                />
            ))}
        </View>
    );
};
