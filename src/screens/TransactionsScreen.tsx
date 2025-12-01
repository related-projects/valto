import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionList } from '../components/transactions/TransactionList';
import { InputField } from '../components/ui/InputField';
import { mockTransactions } from '../data/mockData';
import { useTheme } from '../theme/theme';

export const TransactionsScreen = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();

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
                    leftIcon={<Ionicons name="search" size={20} color={colors.mutedForeground} />}
                />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing['3xl'] }}>
                <TransactionList transactions={mockTransactions} />
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
