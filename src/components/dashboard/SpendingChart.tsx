import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../../theme/theme';
import { formatAmount, formatAmountCompact } from '../../utils/formatAmount';
import { Card } from '../ui/Card';

interface SpendingChartProps {
    data: { name: string; value: number; color: string }[];
    currency?: string;
}

export const SpendingChart: React.FC<SpendingChartProps> = ({ data, currency = '$' }) => {
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
                        No expense data yet
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing.xs }}>
                        Add transactions to see your spending breakdown
                    </Text>
                </View>
            </Card>
        );
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);

    // Simple Donut Chart Logic
    const size = 120;
    const strokeWidth = 24;
    const center = size / 2;
    const radiusChart = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radiusChart;

    let startAngle = -90;

    return (
        <Card>
            <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
                Spending by Category
            </Text>

            <View style={styles.container}>
                <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                        <G rotation={0} origin={`${center}, ${center}`}>
                            {data.map((item, index) => {
                                const percentage = item.value / total;
                                const strokeDasharray = `${circumference * percentage} ${circumference}`;
                                const angle = startAngle;
                                startAngle += percentage * 360;

                                return (
                                    <Circle
                                        key={index}
                                        cx={center}
                                        cy={center}
                                        r={radiusChart}
                                        stroke={item.color}
                                        strokeWidth={strokeWidth}
                                        fill="transparent"
                                        strokeDasharray={strokeDasharray}
                                        strokeDashoffset={0}
                                        rotation={angle}
                                        origin={`${center}, ${center}`}
                                        strokeLinecap="butt"
                                    />
                                );
                            })}
                        </G>
                    </Svg>
                    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, fontWeight: '500' }}>
                            {formatAmountCompact(total, currency)}
                        </Text>
                    </View>
                </View>

                <View style={styles.legend}>
                    {data.slice(0, 4).map((item, index) => (
                        <View key={index} style={styles.legendItem}>
                            <View style={[styles.dot, { backgroundColor: item.color }]} />
                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, flex: 1 }} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                                {formatAmount(item.value, currency)}
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
    },
    legend: {
        flex: 1,
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});
