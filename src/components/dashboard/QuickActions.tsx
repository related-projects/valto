import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';

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

    const ActionButton = ({
        icon,
        label,
        onPress,
    }: {
        icon: keyof typeof Ionicons.glyphMap;
        label: string;
        onPress: () => void;
    }) => (
        <TouchableOpacity onPress={onPress} style={styles.actionItem}>
            <View
                style={[
                    styles.iconContainer,
                    {
                        backgroundColor: colors.secondary,
                        borderRadius: radius.full,
                        width: 48,
                        height: 48,
                    },
                ]}
            >
                <Ionicons name={icon} size={24} color={colors.primaryForeground} />
            </View>
            <Text
                style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.xs,
                    marginTop: spacing.xs,
                    fontWeight: '500',
                }}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <ActionButton icon="remove-circle-outline" label="Expense" onPress={onAddExpense} />
            <ActionButton icon="add-circle-outline" label="Income" onPress={onAddIncome} />
            <ActionButton icon="swap-horizontal-outline" label="Transfer" onPress={onTransfer} />
            <ActionButton icon="qr-code-outline" label="Scan" onPress={() => { }} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    actionItem: {
        alignItems: 'center',
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
