import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Wallet } from '../../domain/entities';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface WalletListProps {
    wallets: Wallet[];
    currency?: string;
}

export const WalletList: React.FC<WalletListProps> = ({ wallets, currency = '$' }) => {
    const { colors, typography, spacing, radius } = useTheme();
    const router = useRouter();

    const getIconName = (type: string): keyof typeof Ionicons.glyphMap => {
        switch (type) {
            case 'cash': return 'wallet-outline';
            case 'bank': return 'card-outline';
            case 'mobile': return 'phone-portrait-outline';
            case 'savings': return 'cash-outline';
            default: return 'wallet-outline';
        }
    };

    // Handle empty state
    if (wallets.length === 0) {
        return (
            <Card>
                <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.md }}>
                    Wallets
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                    <Ionicons name="wallet-outline" size={32} color={colors.mutedForeground} style={{ marginBottom: spacing.sm }} />
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        No wallets yet
                    </Text>
                    <TouchableOpacity
                        style={{
                            marginTop: spacing.md,
                            paddingHorizontal: spacing.lg,
                            paddingVertical: spacing.sm,
                            backgroundColor: colors.accent,
                            borderRadius: radius.md,
                        }}
                        onPress={() => { /* Navigation to be implemented */ }}
                    >
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                            Create your first wallet
                        </Text>
                    </TouchableOpacity>
                </View>
            </Card>
        );
    }

    return (
        <Card>
            <View style={styles.header}>
                <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '600' }}>
                    Wallets
                </Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/wallets')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: colors.accent, fontSize: typography.sizes.xs, fontWeight: '500' }}>
                            See all
                        </Text>
                        <Ionicons name="chevron-forward" size={12} color={colors.accent} />
                    </View>
                </TouchableOpacity>
            </View>

            <View style={{ gap: spacing.sm }}>
                {wallets.slice(0, 3).map((wallet) => (
                    <TouchableOpacity
                        key={wallet.id}
                        onPress={() => { }}
                        style={[
                            styles.walletItem,
                            {
                                backgroundColor: colors.secondary,
                                borderRadius: radius.lg,
                                padding: spacing.md,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.iconContainer,
                                {
                                    backgroundColor: `${wallet.color || colors.accent}20`,
                                    borderRadius: radius.sm,
                                },
                            ]}
                        >
                            <Ionicons name={getIconName(wallet.type)} size={16} color={wallet.color || colors.accent} />
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '500' }}>
                                {wallet.name}
                            </Text>
                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textTransform: 'capitalize' }}>
                                {wallet.type}
                            </Text>
                        </View>

                        <Text
                            style={{
                                color: wallet.balance < 0 ? colors.destructive : colors.foreground,
                                fontSize: typography.sizes.sm,
                                fontWeight: '600',
                            }}
                        >
                            {currency}{wallet.balance.toLocaleString()}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    walletItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
