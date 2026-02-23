import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface SpendingBreakdownProps {
    data: { name: string; value: number; color: string; percentage: number }[];
    currency?: string;
}

export const SpendingBreakdown: React.FC<SpendingBreakdownProps> = ({ data, currency = '$' }) => {
    const { colors, typography, spacing, radius } = useTheme();

    // Handle empty state
    if (data.length === 0) {
        return (
            <Card>
                <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
                    Spending by Category
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        No expense data this month
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing.xs }}>
                        Add expenses to see your spending breakdown
                    </Text>
                </View>
            </Card>
        );
    }

    return (
        <Card>
            <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.sizes.sm, marginBottom: spacing.lg }}>
                Spending by Category
            </Text>

            <View style={{ gap: spacing.md }}>
                {data.map((item, index) => (
                    <View key={index}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxs }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                <View
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 5,
                                        backgroundColor: item.color,
                                        marginRight: spacing.sm,
                                    }}
                                />
                                <Text
                                    style={{
                                        color: colors.foreground,
                                        fontSize: typography.sizes.sm,
                                        fontWeight: '500',
                                        flex: 1,
                                    }}
                                    numberOfLines={1}
                                >
                                    {item.name}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                    {item.percentage.toFixed(0)}%
                                </Text>
                                <Text style={{ fontSize: typography.sizes.md, fontWeight: '600', color: colors.foreground }}>
                                    {currency}{(item.value / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Text>
                            </View>
                        </View>

                        <View
                            style={{
                                height: 6,
                                backgroundColor: colors.muted,
                                borderRadius: radius.full,
                                overflow: 'hidden',
                                marginTop: spacing.xs,
                            }}
                        >
                            <View
                                style={{
                                    height: '100%',
                                    backgroundColor: item.color,
                                    width: `${item.percentage}%`,
                                    borderRadius: radius.full,
                                }}
                            />
                        </View>
                    </View>
                ))}
            </View>
        </Card>
    );
};
