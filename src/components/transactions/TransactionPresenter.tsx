/**
 * Transaction Presenter
 *
 * The single component that decides what a transaction LOOKS like: its icon,
 * its title, its subtitle, whether it carries a note, its sign and its colour.
 *
 * It exists because the two list renderers and the detail screen each used to
 * answer those questions for themselves, and drifted apart: rows titled
 * themselves `note || wallet`, so a row with a note and a row without showed
 * different kinds of information in the same position, and the detail screen
 * painted transfers with a hardcoded blue the list never used.
 *
 * The rule is now fixed here: the title is always the CATEGORY, the subtitle is
 * always the WALLET, and a note is announced by a discreet indicator rather than
 * by taking over the title. Callers choose a variant (how big) and own the outer
 * container (padding, background, press target) - never the content.
 *
 * Categories, wallets and formatAmount arrive as props on purpose. useCategories,
 * useWallets and useFormatting each own their own state and issue a repository
 * read (or a settings load) per instance, so calling them inside a row would fire
 * one async load per row on every render. Every call site already holds one.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Category, Transaction } from '../../domain/entities';
import { Wallet } from '../../domain/entities/Wallet';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
import { isTransferCategoryId, resolveTransactionVisual } from '../../utils/categoryVisuals';

/** Minimal translate signature - the presenter only ever looks up plain keys. */
type TranslateFn = (key: string) => string;

/**
 * How much room the presenter has.
 * - `compact`     - the dense flat list on the dashboard and wallet screens
 * - `comfortable` - the sectioned transactions list
 * - `detail`      - the centred hero on the transaction detail screen
 */
export type TransactionPresenterVariant = 'compact' | 'comfortable' | 'detail';

export interface TransactionPresenterProps {
    transaction: Transaction;
    categories: Category[];
    wallets: Wallet[];
    formatAmount: (amountMinor: number) => string;
    variant: TransactionPresenterVariant;
}

// ─── Shared label resolution ──────────────────────────────────────────
// Exported so the detail screen's field rows name the same category and wallet
// the presenter shows, instead of resolving them a second way.

/** The category label, including the transfer pseudo-ids that have no Category row. */
export function resolveTransactionCategoryLabel(
    transaction: Pick<Transaction, 'categoryId'>,
    categories: Category[],
    t: TranslateFn,
): string {
    if (isTransferCategoryId(transaction.categoryId)) {
        return t('components.transactionList.transfer');
    }
    const category = categories.find((c) => c.id === transaction.categoryId);
    return category?.name || t('components.transactionList.unknown');
}

/** The wallet label for a transaction's wallet id. */
export function resolveWalletLabel(walletId: string, wallets: Wallet[], t: TranslateFn): string {
    const wallet = wallets.find((w) => w.id === walletId);
    return wallet?.name || t('components.transactionList.unknown');
}

/** True when the transaction credits its wallet (income, or the incoming leg). */
function isCredit(transaction: Pick<Transaction, 'type' | 'categoryId'>): boolean {
    return transaction.type === 'income' || transaction.categoryId === 'transfer-in';
}

// ─── Variant metrics ──────────────────────────────────────────────────

interface VariantMetrics {
    readonly iconSize: number;
    readonly tileSize?: number;
    readonly tileAlpha: string;
    readonly titleSize: number;
    readonly titleWeight: '500' | '600' | '700';
    readonly subtitleSize: number;
    readonly amountSize: number;
    readonly amountWeight: '600' | '700';
    readonly noteIconSize: number;
}

const METRICS: Record<TransactionPresenterVariant, VariantMetrics> = {
    compact: {
        iconSize: 20,
        tileAlpha: '20',
        titleSize: typography.sizes.sm,
        titleWeight: typography.weights.medium,
        subtitleSize: typography.sizes.xs,
        amountSize: typography.sizes.sm,
        amountWeight: typography.weights.semibold,
        noteIconSize: 12,
    },
    comfortable: {
        iconSize: 22,
        tileSize: 44,
        tileAlpha: '15',
        titleSize: typography.sizes.md,
        titleWeight: typography.weights.semibold,
        subtitleSize: 13,
        amountSize: typography.sizes.md,
        amountWeight: typography.weights.semibold,
        noteIconSize: 13,
    },
    detail: {
        iconSize: 42,
        tileSize: 80,
        tileAlpha: '15',
        titleSize: typography.sizes.md,
        titleWeight: typography.weights.semibold,
        subtitleSize: typography.sizes.sm,
        amountSize: typography.sizes['5xl'],
        amountWeight: typography.weights.bold,
        noteIconSize: 14,
    },
};

// ─── Component ────────────────────────────────────────────────────────

export const TransactionPresenter: React.FC<TransactionPresenterProps> = ({
    transaction,
    categories,
    wallets,
    formatAmount,
    variant,
}) => {
    const { t } = useTranslation();
    const { colors, radius } = useTheme();

    const metrics = METRICS[variant];
    const isDetail = variant === 'detail';

    const { icon, color } = resolveTransactionVisual(transaction, categories, colors.accent);
    const title = resolveTransactionCategoryLabel(transaction, categories, t);
    const subtitle = resolveWalletLabel(transaction.walletId, wallets, t);
    const hasNote = Boolean(transaction.note && transaction.note.trim().length > 0);

    const credit = isCredit(transaction);
    const amount = `${credit ? '+' : '-'}${formatAmount(transaction.amount)}`;
    const amountColor = credit ? colors.success : colors.foreground;

    const iconTile = (
        <View
            style={[
                styles.iconTile,
                {
                    backgroundColor: `${color}${metrics.tileAlpha}`,
                    borderRadius: isDetail ? radius.full : radius.md,
                },
                metrics.tileSize
                    ? { width: metrics.tileSize, height: metrics.tileSize }
                    : styles.iconTilePadded,
            ]}
        >
            <Ionicons name={icon} size={metrics.iconSize} color={color} />
        </View>
    );

    const titleRow = (
        <View style={[styles.titleRow, isDetail && styles.centred]}>
            <Text
                testID="transaction_row_title"
                style={{
                    color: colors.foreground,
                    fontSize: metrics.titleSize,
                    fontWeight: metrics.titleWeight,
                    textTransform: 'capitalize',
                }}
            >
                {title}
            </Text>
            {hasNote ? (
                <Ionicons
                    testID="transaction_note_indicator"
                    accessibilityLabel={t('a11y.hasNote')}
                    name="document-text-outline"
                    size={metrics.noteIconSize}
                    color={colors.mutedForeground}
                    style={styles.noteIndicator}
                />
            ) : null}
        </View>
    );

    const subtitleText = (
        <Text
            testID="transaction_row_subtitle"
            style={{ color: colors.mutedForeground, fontSize: metrics.subtitleSize }}
        >
            {subtitle}
        </Text>
    );

    const amountText = (
        <Text
            testID="transaction_row_amount"
            style={{
                color: amountColor,
                fontSize: metrics.amountSize,
                fontWeight: metrics.amountWeight,
            }}
        >
            {amount}
        </Text>
    );

    if (isDetail) {
        return (
            <View style={styles.detail}>
                {iconTile}
                <View style={styles.detailAmount}>{amountText}</View>
                {titleRow}
                {subtitleText}
            </View>
        );
    }

    return (
        <>
            {iconTile}
            <View style={styles.rowText}>
                {titleRow}
                {subtitleText}
            </View>
            {amountText}
        </>
    );
};

const styles = StyleSheet.create({
    iconTile: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconTilePadded: {
        padding: 10,
    },
    rowText: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    centred: {
        justifyContent: 'center',
    },
    noteIndicator: {
        marginStart: 6,
    },
    detail: {
        alignItems: 'center',
    },
    detailAmount: {
        marginTop: spacing.md,
        marginBottom: spacing.xs,
    },
});
