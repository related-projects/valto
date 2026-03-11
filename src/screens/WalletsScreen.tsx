import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

export const WalletsScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius } = useTheme();
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

    return (
        <>
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background }]}
                contentContainerStyle={{
                    paddingTop: insets.top + spacing.md,
                    paddingBottom: spacing.tabBarOffset,
                    paddingHorizontal: spacing.lg,
                }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl }}>
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

                {wallets.length === 0 ? (
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
                ) : (
                    <View style={{ gap: spacing.lg, marginBottom: spacing['2xl'] }}>
                        {wallets.map((wallet) => (
                            <TouchableOpacity
                                key={wallet.id}
                                activeOpacity={0.9}
                                onPress={() => handleEditWallet(wallet)}
                            >
                                <View
                                    style={{
                                        backgroundColor: wallet.color || colors.accent,
                                        height: 225,
                                        borderRadius: radius.xl,
                                        shadowColor: wallet.color || colors.accent,
                                        shadowOffset: { width: 0, height: spacing.sm },
                                        shadowOpacity: 0.25,
                                        shadowRadius: spacing.md,
                                        elevation: 8,
                                        padding: spacing.xl,
                                        justifyContent: 'space-between',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <View style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 22,
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
                                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                                            {formatAmount(wallet.balance)}
                                        </Text>
                                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes['4xl'], fontWeight: typography.weights.bold, letterSpacing: -1, marginBottom: spacing.md }}>
                                            {formatAmount(wallet.balance)}
                                        </Text>
                                        <View style={{
                                            backgroundColor: hexToRgba(colors.accentForeground, 0.2),
                                            paddingHorizontal: spacing.md,
                                            paddingVertical: spacing.xs + 2,
                                            borderRadius: spacing.lg,
                                            alignSelf: 'flex-start',
                                        }}>
                                            <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textTransform: 'capitalize' }}>
                                                {t(`wallets.type.${wallet.type}`)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <View style={{ marginBottom: spacing.lg }}>
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

