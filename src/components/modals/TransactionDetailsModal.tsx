import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import {
    TransactionPresenter,
    resolveTransactionCategoryLabel,
    resolveWalletLabel,
} from '../../components/transactions/TransactionPresenter';
import { useCategories } from '../../hooks/useCategories';
import { useFormatting } from '../../hooks/useFormatting';
import { useTransactions } from '../../hooks/useTransactions';
import { useWallets } from '../../hooks/useWallets';
import { useTheme } from '../../theme/theme';
import { getButtonA11y } from '../../utils/accessibility';
import { isTransferCategoryId } from '../../utils/categoryVisuals';

export function TransactionDetailsModal() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const { t } = useTranslation();
    const { colors, spacing, radius, typography } = useTheme();

    const { transactions, loading, deleteTransaction } = useTransactions();
    const { categories } = useCategories();
    const { wallets } = useWallets();
    const { formatDate, formatAmount } = useFormatting();

    // Once the delete is confirmed this screen is on its way out. The refreshed
    // list drops the row before the dismiss finishes, so without this flag the
    // "not found" branch below would flash an error over a successful delete.
    const deletingRef = useRef(false);

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
        if (deletingRef.current) return null;
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

    const isTransfer = transaction.type === 'transfer' || isTransferCategoryId(transaction.categoryId);
    const categoryName = resolveTransactionCategoryLabel(transaction, categories, t);
    const walletName = resolveWalletLabel(transaction.walletId, wallets, t);

    const handleDelete = () => {
        Alert.alert(
            t('modals.transactionDetails.deleteTitle'),
            t('modals.transactionDetails.deleteMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        // Leave first: the list refresh removes this transaction, and a
                        // successful delete must never land the user on an error screen.
                        deletingRef.current = true;
                        router.back();
                        try {
                            await deleteTransaction(transaction.id);
                        } catch {
                            deletingRef.current = false;
                            Alert.alert(t('alerts.error'), t('modals.transactionDetails.deleteFailed'));
                        }
                    },
                },
            ],
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            {/* A transfer is two rows in two wallets with nothing linking them, so
                deleting one leg is refused outright - no affordance for it here.
                The use case throws as well; this only spares the user a dead end. */}
            <Stack.Screen
                options={{
                    headerRight: isTransfer
                        ? undefined
                        : () => (
                            <TouchableOpacity
                                onPress={handleDelete}
                                testID="transaction_delete_button"
                                style={styles.headerButton}
                                {...getButtonA11y(t('a11y.deleteTransaction'))}
                            >
                                {/* Text, not a glyph: every other sheet spells an
                                    irreversible action out at header right. */}
                                <Text style={{
                                    color: colors.destructive,
                                    fontSize: typography.sizes.md,
                                    fontWeight: typography.weights.semibold,
                                }}>
                                    {t('common.delete')}
                                </Text>
                            </TouchableOpacity>
                        ),
                }}
            />

            <View style={{ paddingVertical: spacing.xl }}>
                <TransactionPresenter
                    transaction={transaction}
                    categories={categories}
                    wallets={wallets}
                    formatAmount={formatAmount}
                    variant="detail"
                />
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
    headerButton: {
        padding: 8,
        marginEnd: -8,
        // Same 8px hit padding as the close control opposite, and centred so the
        // text sits on the axis that control's 24px glyph sits on.
        justifyContent: 'center',
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
