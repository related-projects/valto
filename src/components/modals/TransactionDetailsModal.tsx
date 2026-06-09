import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { useCategories } from '../../hooks/useCategories';
import { useFormatting } from '../../hooks/useFormatting';
import { useTransactions } from '../../hooks/useTransactions';
import { useWallets } from '../../hooks/useWallets';
import { useTheme } from '../../theme/theme';

export function TransactionDetailsModal() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const { t } = useTranslation();
    const { colors, typography, spacing, radius } = useTheme();

    const { transactions, loading } = useTransactions();
    const { categories } = useCategories();
    const { wallets } = useWallets();
    const { formatAmount, formatDate } = useFormatting();

    const transaction = useMemo(() => {
        return transactions.find((tx) => tx.id === id); // `useLocalSearchParams` automatically resolves `[id]`
    }, [transactions, id]);

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    if (!transaction) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <EmptyState
                    title={t('common.error')}
                    description={t('common.somethingWentWrong')}
                    icon="alert-circle-outline"
                />
            </View>
        );
    }

    const isTransfer = transaction.type === 'transfer' || transaction.categoryId === 'transfer-in' || transaction.categoryId === 'transfer-out';
    const isIncome = transaction.type === 'income' || transaction.categoryId === 'transfer-in';
    const sign = isTransfer ? '' : isIncome ? '+' : '-';
    
    let categoryName = t('components.transactionList.unknown');
    let colorHex = colors.accent;
    let iconName: keyof typeof Ionicons.glyphMap = 'card-outline';

    if (isTransfer) {
        categoryName = t('components.transactionList.transfer');
        colorHex = '#3B82F6';
        iconName = 'swap-horizontal-outline';
    } else {
        const cat = categories.find((c) => c.id === transaction.categoryId);
        if (cat) {
            categoryName = cat.name;
            const lowerName = categoryName.toLowerCase();
            if (lowerName.includes('shopping')) colorHex = '#8B5CF6';
            else if (lowerName.includes('food') || lowerName.includes('dining')) colorHex = '#F59E0B';
            else if (lowerName.includes('transport')) colorHex = '#3B82F6';
            else if (lowerName.includes('entertainment')) colorHex = '#EC4899';
            else if (lowerName.includes('utilities')) colorHex = '#10B981';
            else if (lowerName.includes('salary') || lowerName.includes('income')) colorHex = '#4ade80';
            else if (lowerName.includes('health')) colorHex = '#14B8A6';
            
            if (lowerName.includes('food') || lowerName.includes('dining')) iconName = 'restaurant-outline';
            else if (lowerName.includes('shopping')) iconName = 'cart-outline';
            else if (lowerName.includes('transport')) iconName = 'car-outline';
            else if (lowerName.includes('entertainment')) iconName = 'film-outline';
            else if (lowerName.includes('utilities')) iconName = 'flash-outline';
            else if (lowerName.includes('salary') || lowerName.includes('income')) iconName = 'cash-outline';
            else if (lowerName.includes('health')) iconName = 'medical-outline';
        }
    }

    const wallet = wallets.find((w) => w.id === transaction.walletId);
    const walletName = wallet?.name || t('components.transactionList.unknown');

    const valueColor = isTransfer ? colors.foreground : isIncome ? colors.success : colors.foreground;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <View style={[styles.iconLarge, { backgroundColor: `${colorHex}15`, borderRadius: radius.full }]}>
                    <Ionicons name={iconName} size={42} color={colorHex} />
                </View>
                <Text style={[styles.amount, { color: valueColor, marginTop: spacing.md }]}>
                    {sign}{formatAmount(transaction.amount)}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.md, marginTop: spacing.xs }}>
                    {transaction.note || categoryName}
                </Text>
            </View>

            <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }}>
                
                <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.lg }]}>
                    
                    <View style={styles.row}>
                        <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('modals.addTransaction.type') || "Type"}</Text>
                        <Text style={[styles.value, { color: colors.foreground, textTransform: 'capitalize' }]}>
                            {t(`transactions.filter${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}`) || transaction.type}
                        </Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.row}>
                        <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('modals.addTransaction.category')}</Text>
                        <Text style={[styles.value, { color: colors.foreground }]}>{categoryName}</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.row}>
                        <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('modals.addTransaction.wallet')}</Text>
                        <Text style={[styles.value, { color: colors.foreground }]}>{walletName}</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.row}>
                        <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('modals.addTransaction.date')}</Text>
                        <Text style={[styles.value, { color: colors.foreground }]}>{formatDate(transaction.date)}</Text>
                    </View>
                    
                </View>

                {transaction.note ? (
                    <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.lg, marginTop: spacing.lg }]}>
                        <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: spacing.sm }]}>
                            {t('modals.addTransaction.notes')}
                        </Text>
                        <Text style={[styles.value, { color: colors.foreground }]}>
                            {transaction.note}
                        </Text>
                    </View>
                ) : null}



            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconLarge: {
        width: 80,
        height: 80,
        alignItems: 'center',
        justifyContent: 'center',
    },
    amount: {
        fontSize: 36,
        fontWeight: '700',
    },
    card: {
        padding: 20,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    label: {
        fontSize: 15,
    },
    value: {
        fontSize: 15,
        fontWeight: '500',
    },
    divider: {
        height: 1,
        width: '100%',
        opacity: 0.5,
    },

});
