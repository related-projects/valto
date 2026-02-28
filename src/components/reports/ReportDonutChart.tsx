/**
 * ReportDonutChart Component
 *
 * SVG donut chart showing expense distribution by category.
 * Follows the same SVG pattern as SpendingChart but shows all categories.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../../theme/theme';
import { formatAmount } from '../../utils/formatAmount';
import { Card } from '../ui/Card';

interface DonutDataItem {
    name: string;
    value: number;
    color: string;
    percentage: number;
}

interface ReportDonutChartProps {
    data: DonutDataItem[];
    totalExpense: number;
    currency?: string;
}

export const ReportDonutChart: React.FC<ReportDonutChartProps> = ({
    data,
    totalExpense,
    currency = '$',
}) => {
    const { colors, typography, spacing } = useTheme();

    // Handle empty state
    if (data.length === 0) {
        return (
            <Card>
                <Text
                    style={{
                        color: colors.foreground,
                        fontWeight: typography.weights.semibold,
                        fontSize: typography.sizes.sm,
                        marginBottom: spacing.md,
                    }}
                >
                    Expense Distribution
                </Text>
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center' }}>
                        No expense data this month
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing.xs }}>
                        Add expenses to see your distribution
                    </Text>
                </View>
            </Card>
        );
    }

    // Donut chart parameters
    const size = 160;
    const strokeWidth = 28;
    const center = size / 2;
    const chartRadius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * chartRadius;

    let startAngle = -90;

    return (
        <Card>
            <Text
                style={{
                    color: colors.foreground,
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing.lg,
                }}
            >
                Expense Distribution
            </Text>

            {/* Chart */}
            <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                        <G rotation={0} origin={`${center}, ${center}`}>
                            {data.map((item, index) => {
                                const percentage = item.value / totalExpense;
                                const strokeDasharray = `${circumference * percentage} ${circumference}`;
                                const angle = startAngle;
                                startAngle += percentage * 360;

                                return (
                                    <Circle
                                        key={index}
                                        cx={center}
                                        cy={center}
                                        r={chartRadius}
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
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, fontWeight: typography.weights.medium }}>
                            Total
                        </Text>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                            {formatAmount(totalExpense, currency)}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Legend */}
            <View style={styles.legend}>
                {data.map((item, index) => (
                    <View key={index} style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: item.color }]} />
                        <Text
                            style={{
                                color: colors.mutedForeground,
                                fontSize: typography.sizes.xs,
                                flex: 1,
                            }}
                            numberOfLines={1}
                        >
                            {item.name}
                        </Text>
                        <Text
                            style={{
                                color: colors.foreground,
                                fontSize: typography.sizes.xs,
                                fontWeight: typography.weights.semibold,
                            }}
                        >
                            {item.percentage.toFixed(0)}%
                        </Text>
                    </View>
                ))}
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    legend: {
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
});
