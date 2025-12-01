import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface SpendingChartProps {
    data: { name: string; value: number; color: string }[];
}

export const SpendingChart: React.FC<SpendingChartProps> = ({ data }) => {
    const { colors, typography, spacing, radius } = useTheme();
    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
        <Card>
            <Text style={{ color: colors.foreground, fontWeight: '600', marginBottom: spacing.md }}>
                Spending Breakdown
            </Text>
            <View style={styles.container}>
                <View style={styles.bars}>
                    {data.map((item, index) => (
                        <View key={index} style={styles.barContainer}>
                            <View
                                style={[
                                    styles.bar,
                                    {
                                        backgroundColor: item.color,
                                        height: (item.value / total) * 150, // Scale height
                                        borderRadius: radius.sm,
                                        width: 8,
                                    },
                                ]}
                            />
                        </View>
                    ))}
                </View>
                <View style={styles.legend}>
                    {data.map((item, index) => (
                        <View key={index} style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: item.color }]} />
                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                {item.name}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    container: {
        gap: 16,
    },
    bars: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        height: 150,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 8,
    },
    barContainer: {
        alignItems: 'center',
    },
    bar: {},
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'center',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});
