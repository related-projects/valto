import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';
import { Card } from '../ui/Card';

interface QuickActionsProps {
    onAddExpense: () => void;
    onAddIncome: () => void;
    onTransfer: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
    onAddExpense,
    onAddIncome,
    onTransfer,
}) => {
    const { colors, typography, spacing, radius } = useTheme();

    const actions = [
        {
            icon: 'arrow-down-outline' as const,
            label: 'Income',
            onPress: onAddIncome,
            bg: colors.successBackground,
            iconColor: colors.successText,
        },
        {
            icon: 'arrow-up-outline' as const,
            label: 'Expense',
            onPress: onAddExpense,
            bg: colors.destructiveBackground,
            iconColor: colors.destructiveText,
        },
        {
            icon: 'swap-horizontal-outline' as const,
            label: 'Transfer',
            onPress: onTransfer,
            bg: colors.iconBadgeBackground,
            iconColor: colors.accent,
        },
    ];

    return (
        <Card>
            <Text style={{ fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.md, color: colors.foreground }}>
                Quick Actions
            </Text>
            <View style={styles.container}>
                {actions.map((action, index) => (
                    <TouchableOpacity
                        key={index}
                        onPress={action.onPress}
                        style={[
                            styles.actionButton,
                            {
                                backgroundColor: colors.secondary,
                                borderRadius: radius.lg,
                                padding: spacing.md,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.iconContainer,
                                {
                                    backgroundColor: action.bg,
                                    borderRadius: radius.full,
                                    padding: spacing.sm,
                                    marginBottom: spacing.sm,
                                },
                            ]}
                        >
                            <Ionicons name={action.icon} size={16} color={action.iconColor} />
                        </View>
                        <Text
                            style={{
                                color: colors.foreground,
                                fontSize: typography.sizes.xs,
                                fontWeight: '500',
                            }}
                        >
                            {action.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </Card>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
