import React from 'react';
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
import { useRouter } from 'expo-router';
import { useCategories } from '../../hooks/useCategories';
import { useFormatting } from '../../hooks/useFormatting';
import { useWallets } from '../../hooks/useWallets';
import { useTheme } from '../../theme/theme';
import { TransactionPresenter } from './TransactionPresenter';

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
    const { colors, typography, spacing } = useTheme();
    const { categories } = useCategories();
    const { wallets } = useWallets();
    const { formatAmount } = useFormatting();
    const router = useRouter();

    // Row CONTENT - title, subtitle, note indicator, amount - belongs to
    // TransactionPresenter, so both renderers below (and the detail screen)
    // cannot describe the same transaction differently. This component owns
    // only the containers: padding, background and the press target.

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
        const renderFlatItem = ({ item }: ListRenderItemInfo<Transaction>) => (
            <TouchableOpacity
                onPress={() => router.push(`/transaction/${item.id}`)}
                style={[
                    styles.transactionItem,
                    {
                        paddingVertical: spacing.sm,
                        paddingHorizontal: 0,
                    },
                ]}
            >
                <TransactionPresenter
                    transaction={item}
                    categories={categories}
                    wallets={wallets}
                    formatAmount={formatAmount}
                    variant="compact"
                />
            </TouchableOpacity>
        );

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
        // Approximate - headers and items have different heights
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

        return (
            <TouchableOpacity
                onPress={() => router.push(`/transaction/${transaction.id}`)}
                style={[
                    styles.transactionItem,
                    {
                        paddingVertical: 16,
                        paddingHorizontal: 20,
                        backgroundColor: colors.card,
                    },
                ]}
            >
                <TransactionPresenter
                    transaction={transaction}
                    categories={categories}
                    wallets={wallets}
                    formatAmount={formatAmount}
                    variant="comfortable"
                />
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
});
