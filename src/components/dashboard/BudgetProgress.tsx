import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface BudgetProgressProps {
    spent: number;
    budget: number;
}

export const BudgetProgress: React.FC<BudgetProgressProps> = ({ spent, budget }) => {
    const { colors, typography, spacing, radius } = useTheme();
    const percentage = Math.min((spent / budget) * 100, 100);

    return (
        <Card>
            <View style={styles.header}>
                <Text style={{ color: colors.foreground, fontWeight: '600' }}>Monthly Budget</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                    {Math.round(percentage)}%
                </Text>
            </View>

            <View
                style={[
                    styles.track,
                    {
                        backgroundColor: colors.muted,
                        borderRadius: radius.full,
                        height: 8,
                        marginTop: spacing.sm,
                    },
                ]}
            >
                <View
                    style={[
                        styles.fill,
                        {
                            backgroundColor: colors.primary,
                            borderRadius: radius.full,
                            width: `${percentage}%`,
                            height: '100%',
                        },
                    ]}
                />
            </View>

            <View style={styles.footer}>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                    Spent: ${spent}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                    Budget: ${budget}
                </Text>
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    track: {
        width: '100%',
        overflow: 'hidden',
    },
    fill: {},
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
});
