import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionList } from '../components/transactions/TransactionList';
import { Card } from '../components/ui/Card';
import { mockTransactions, mockWallets } from '../data/mockData';
import { useTheme } from '../theme/theme';

export const WalletsScreen = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();

    const totalBalance = mockWallets.reduce((sum, w) => sum + w.balance, 0);

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingTop: insets.top + 16,
                paddingBottom: 100,
                paddingHorizontal: 20,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <View>
                    <Text
                        style={{
                            color: colors.foreground,
                            fontSize: 28,
                            fontWeight: '700',
                            letterSpacing: -0.5,
                            marginBottom: 4,
                        }}
                    >
                        Wallets
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 15, fontWeight: '500' }}>
                        Total: ${totalBalance.toLocaleString()}
                    </Text>
                </View>
                <TouchableOpacity
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.accent,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 20,
                        gap: 4,
                    }}
                >
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Add</Text>
                    <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={{ gap: 20, marginBottom: 32 }}>
                {mockWallets.map((wallet) => (
                    <TouchableOpacity
                        key={wallet.id}
                        activeOpacity={0.9}
                    >
                        <Card
                            style={{
                                backgroundColor: wallet.color,
                                height: 180,
                                justifyContent: 'space-between',
                                borderRadius: 24,
                                shadowColor: wallet.color,
                                shadowOffset: { width: 0, height: 8 },
                                shadowOpacity: 0.25,
                                shadowRadius: 16,
                                elevation: 8,
                                padding: 24, // Increased padding
                            }}
                            padding="none" // Use manual padding
                        >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <View style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 22,
                                    backgroundColor: 'rgba(255,255,255,0.2)',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Ionicons name="card-outline" size={22} color="#fff" />
                                </View>
                                <TouchableOpacity>
                                    <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>

                            <View>
                                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '500', marginBottom: 8 }}>
                                    {wallet.name}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700', letterSpacing: -1, marginBottom: 16 }}>
                                    ${wallet.balance.toLocaleString()}
                                </Text>
                                <View style={{
                                    backgroundColor: 'rgba(255,255,255,0.2)',
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 20,
                                    alignSelf: 'flex-start',
                                }}>
                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>
                                        {wallet.type}
                                    </Text>
                                </View>
                            </View>
                        </Card>
                    </TouchableOpacity>
                ))}
            </View>

            <View>
                <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '700', marginBottom: 16, letterSpacing: -0.5 }}>
                    Recent Activities
                </Text>
                <Card padding="none" style={{ overflow: 'hidden' }}>
                    <TransactionList transactions={mockTransactions.slice(0, 5)} showDateHeaders={false} />
                </Card>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
