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
                paddingBottom: 100,
                paddingHorizontal: 20,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: 28,
                        fontWeight: '700',
                        letterSpacing: -0.5,
                    }}
                >
                    Wallets
                </Text>
                <TouchableOpacity>
                    <Ionicons name="add-circle" size={32} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <View style={{ gap: 16 }}>
                {mockWallets.map((wallet) => (
                    <Card
                        key={wallet.id}
                        style={{
                            backgroundColor: wallet.color,
                            height: 160,
                            justifyContent: 'space-between',
                            borderRadius: 24,
                            shadowColor: wallet.color,
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.3,
                            shadowRadius: 16,
                            elevation: 8,
                        }}
                        padding="lg"
                    >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>
                                {wallet.name}
                            </Text>
                            <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Ionicons name="card-outline" size={20} color="#fff" />
                            </View>
                        </View>

                        <View>
                            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 4 }}>
                                Balance
                            </Text>
                            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700', letterSpacing: -1 }}>
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
