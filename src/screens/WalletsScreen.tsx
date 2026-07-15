import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dimensions,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddWalletModal } from '../components/modals/AddWalletModal';
import { EditWalletModal } from '../components/modals/EditWalletModal';
import { TransactionList } from '../components/transactions/TransactionList';
import { Card } from '../components/ui/Card';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Wallet } from '../domain/entities';
import { useTransactions } from '../hooks/useTransactions';
import { useWallets } from '../hooks/useWallets';
import { useTheme } from '../theme/theme';
import { useFormatting } from '../hooks/useFormatting';

// ─── Constants ────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Card width shows ~78% of screen, revealing the edge of the next card */
const WALLET_CARD_WIDTH = SCREEN_WIDTH * 0.78;
const WALLET_CARD_HEIGHT = 225;
/** Gap between cards in the horizontal scroll */
const WALLET_CARD_GAP = 12;

export const WalletsScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();

    // Get real data
    const { wallets, getTotalBalance, refreshWallets } = useWallets();
    const { transactions } = useTransactions();
    const { formatAmount } = useFormatting();

    // Modal state
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

    // Helper to convert hex color to rgba with opacity
    const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    const totalBalance = getTotalBalance();

    const handleAddWallet = () => {
        setAddModalVisible(true);
    };

    const handleEditWallet = (wallet: Wallet) => {
        setSelectedWallet(wallet);
        setEditModalVisible(true);
    };

    const handleModalSuccess = async () => {
        await refreshWallets();
    };

    // ─── FlatList Optimization ────────────────────────────────────────

    const snapInterval = WALLET_CARD_WIDTH + WALLET_CARD_GAP;

    const getItemLayout = useCallback(
        (_data: ArrayLike<Wallet> | null | undefined, index: number) => ({
            length: WALLET_CARD_WIDTH,
            offset: (WALLET_CARD_WIDTH + WALLET_CARD_GAP) * index,
            index,
        }),
        [],
    );

    const keyExtractor = useCallback((item: Wallet) => item.id, []);

    const renderSeparator = useCallback(
        () => <View style={{ width: WALLET_CARD_GAP }} />,
        [],
    );

    const renderWalletCard = useCallback(
        ({ item: wallet }: { item: Wallet }) => (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleEditWallet(wallet)}
                style={{ width: WALLET_CARD_WIDTH }}
            >
                <View
                    style={{
                        backgroundColor: wallet.color || colors.accent,
                        height: WALLET_CARD_HEIGHT,
                        borderRadius: radius.xl,
                        ...shadows.elevated,
                        shadowColor: wallet.color || colors.accent,
                        padding: spacing.xl,
                        justifyContent: 'space-between',
                        overflow: 'hidden',
                    }}
                >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{
                            width: 44,
                            height: 44,
                            borderRadius: radius.full,
                            backgroundColor: hexToRgba(colors.accentForeground, 0.2),
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Ionicons name="card-outline" size={22} color={colors.accentForeground} />
                        </View>
                        <TouchableOpacity onPress={() => handleEditWallet(wallet)}>
                            <Ionicons name="ellipsis-vertical" size={20} color={colors.accentForeground} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes['4xl'], fontWeight: typography.weights.bold, letterSpacing: -1, marginBottom: spacing.md }}>
                            {formatAmount(wallet.balance)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                            <View style={{
                                backgroundColor: hexToRgba(colors.accentForeground, 0.2),
                                paddingHorizontal: spacing.md,
                                paddingVertical: spacing.xs + 2,
                                borderRadius: spacing.lg,
                            }}>
                                <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textTransform: 'capitalize' }}>
                                    {t(`wallets.type.${wallet.type}`)}
                                </Text>
                            </View>
                            <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, opacity: 0.8 }} numberOfLines={1}>
                                {wallet.name}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        ),
        [colors, typography, spacing, radius, shadows, formatAmount, t],
    );

    // ─── Empty State ──────────────────────────────────────────────────

    const renderEmptyState = () => (
        <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'] }}>
            <Ionicons name="wallet-outline" size={48} color={colors.mutedForeground} style={{ marginBottom: spacing.md }} />
            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.md, marginBottom: spacing.lg }}>
                {t('wallets.noWallets')}
            </Text>
            <TouchableOpacity
                style={{
                    backgroundColor: colors.accent,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    borderRadius: radius.md,
                }}
                onPress={handleAddWallet}
            >
                <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                    {t('wallets.createFirst')}
                </Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <>
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background }]}
                contentContainerStyle={{
                    paddingTop: insets.top + spacing.md,
                    paddingBottom: spacing.tabBarOffset,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header — keeps horizontal padding */}
                <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: spacing.xl,
                    paddingHorizontal: spacing.lg,
                }}>
                    <View>
                        <Text
                            style={{
                                color: colors.foreground,
                                fontSize: typography.sizes['3xl'],
                                fontWeight: typography.weights.bold,
                                letterSpacing: -0.5,
                                marginBottom: spacing.xs,
                            }}
                        >
                            {t('wallets.title')}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                            {t('wallets.total', { amount: formatAmount(totalBalance) })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: colors.accent,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderRadius: radius.md,
                            gap: spacing.xs,
                        }}
                        onPress={handleAddWallet}
                    >
                        <Ionicons name="add" size={18} color={colors.accentForeground} />
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>{t('wallets.add')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Wallet Cards — Horizontal FlatList (full-bleed, no horizontal padding on parent) */}
                {wallets.length === 0 ? (
                    <View style={{ paddingHorizontal: spacing.lg }}>
                        {renderEmptyState()}
                    </View>
                ) : (
                    <View style={{ marginBottom: spacing['2xl'] }}>
                        <FlatList
                            data={wallets}
                            renderItem={renderWalletCard}
                            keyExtractor={keyExtractor}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            snapToInterval={snapInterval}
                            decelerationRate="fast"
                            contentContainerStyle={{
                                paddingHorizontal: spacing.lg,
                                // When single wallet, center it
                                ...(wallets.length === 1 && {
                                    flexGrow: 1,
                                    justifyContent: 'center',
                                }),
                            }}
                            ItemSeparatorComponent={renderSeparator}
                            getItemLayout={getItemLayout}
                            windowSize={5}
                            initialNumToRender={3}
                            maxToRenderPerBatch={3}
                        />
                    </View>
                )}

                {/* Recent Activities */}
                <View style={{ marginBottom: spacing.lg, paddingHorizontal: spacing.lg }}>
                    <Card>
                        <SectionHeader title={t('wallets.recentActivities')} />
                        <TransactionList transactions={transactions.slice(0, 5)} showDateHeaders={false} />
                    </Card>
                </View>
            </ScrollView>

            <AddWalletModal
                visible={addModalVisible}
                onClose={() => setAddModalVisible(false)}
                onSuccess={handleModalSuccess}
            />

            <EditWalletModal
                visible={editModalVisible}
                wallet={selectedWallet}
                onClose={() => {
                    setEditModalVisible(false);
                    setSelectedWallet(null);
                }}
                onSuccess={handleModalSuccess}
            />
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
