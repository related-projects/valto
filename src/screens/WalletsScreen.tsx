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
                paddingTop: insets.top + 16,
                paddingBottom: 100,
                paddingHorizontal: 20,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
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
                    <Ionicons name="add-circle" size={28} color={colors.accent} />
                </TouchableOpacity>
            </View>

            <View style={{ gap: 20 }}>
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
                                borderRadius: 20,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.15,
                                shadowRadius: 12,
                                elevation: 5,
                            }}
                            padding="lg"
                        >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <View>
                                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
                                        {wallet.name}
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textTransform: 'capitalize' }}>
                                        {wallet.type}
                                    </Text>
                                </View>
                                <View style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 22,
                                    backgroundColor: 'rgba(255,255,255,0.25)',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Ionicons name="card-outline" size={22} color="#fff" />
                                </View>
                            </View>

                            <View>
                                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 6 }}>
                                    Total Balance
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>
                                    ${wallet.balance.toLocaleString()}
                                </Text>
                            </View>
                        </Card>
                    </TouchableOpacity>
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
