import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface Wallet {
    id: string;
    name: string;
    balance: number;
    color: string;
}

interface WalletListProps {
    wallets: Wallet[];
}

export const WalletList: React.FC<WalletListProps> = ({ wallets }) => {
    const { colors, typography, spacing, radius } = useTheme();

    return (
        <View>
            <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: '600' }}>
                    My Wallets
                </Text>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md }}
            >
                {wallets.map((wallet) => (
                    <TouchableOpacity key={wallet.id}>
                        <Card
                            style={{
                                width: 140,
                                height: 100,
                                backgroundColor: wallet.color,
                                justifyContent: 'space-between',
                            }}
                            padding="md"
                        >
                            <Text style={{ color: '#fff', fontSize: typography.sizes.sm, fontWeight: '500' }}>
                                {wallet.name}
                            </Text>
                            <Text style={{ color: '#fff', fontSize: typography.sizes.lg, fontWeight: 'bold' }}>
                                ${wallet.balance.toLocaleString()}
                            </Text>
                        </Card>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity>
                    <Card
                        style={{
                            width: 60,
                            height: 100,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: colors.secondary,
                        }}
                    >
                        <Text style={{ fontSize: 24, color: colors.mutedForeground }}>+</Text>
                    </Card>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};
