import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';

interface StatCardProps {
    label: string;
    amount: number;
    variant: 'success' | 'destructive' | 'warning';
    currency?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, amount, variant, currency = '$' }) => {
    const { colors, typography, spacing, radius } = useTheme();

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
                {currency}{(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
