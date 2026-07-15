import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';

interface StatCardProps {
    label: string;
    amount: number;
    variant: 'success' | 'destructive' | 'warning';
}

export const StatCard: React.FC<StatCardProps> = ({ label, amount, variant }) => {
    const { colors, typography, spacing, radius } = useTheme();
    const { formatAmountWhole } = useFormatting();

    const getBackgroundColor = () => {
        switch (variant) {
            case 'success':
                return colors.successBackground;
            case 'destructive':
                return colors.destructiveBackground;
            case 'warning':
                return colors.warningBackground;
        }
    };

    const getTextColor = () => {
        switch (variant) {
            case 'success':
                return colors.successText;
            case 'destructive':
                return colors.destructiveText;
            case 'warning':
                return colors.warningText;
        }
    };

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: getBackgroundColor(),
                    borderRadius: radius.lg,
                    padding: spacing.md,
                },
            ]}
        >
            <Text
                style={{
                    color: getTextColor(),
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing.xs,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    color: getTextColor(),
                    fontSize: typography.sizes.xl,
                    fontWeight: typography.weights.bold,
                }}
            >
                {formatAmountWhole(amount)}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
