import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { mockWallets } from '../data/mockData';
import { useTheme } from '../theme/theme';

export const WalletsScreen = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingTop: insets.top + spacing.md,
                paddingBottom: spacing['3xl'],
                paddingHorizontal: spacing.md,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes['2xl'],
                        fontWeight: 'bold',
                    }}
                >
                    Wallets
                </Text>
                <TouchableOpacity>
                    <Ionicons name="add-circle" size={32} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <View style={{ gap: spacing.md }}>
                {mockWallets.map((wallet) => (
                    <Card
                        key={wallet.id}
                        style={{
                            backgroundColor: wallet.color,
                            height: 160,
                            justifyContent: 'space-between',
                        }}
                        padding="lg"
                    >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={{ color: '#fff', fontSize: typography.sizes.lg, fontWeight: '600' }}>
                                {wallet.name}
                            </Text>
                            <Ionicons name="card-outline" size={24} color="#fff" />
                        </View>

                        <View>
                            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: typography.sizes.sm }}>
                                Balance
                            </Text>
                            <Text style={{ color: '#fff', fontSize: typography.sizes['3xl'], fontWeight: 'bold' }}>
                                ${wallet.balance.toLocaleString()}
                            </Text>
                        </View>
                    </Card>
                ))}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
