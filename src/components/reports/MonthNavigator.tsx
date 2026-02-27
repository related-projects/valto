/**
 * MonthNavigator Component
 *
 * Simple previous/next month navigation header.
 * Purely presentational — receives all data and callbacks as props.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';

interface MonthNavigatorProps {
    monthLabel: string;
    onPrevious: () => void;
    onNext: () => void;
}

export const MonthNavigator: React.FC<MonthNavigatorProps> = ({
    monthLabel,
    onPrevious,
    onNext,
}) => {
    const { colors, typography, spacing } = useTheme();

    return (
        <View style={styles.container}>
            <TouchableOpacity
                onPress={onPrevious}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.button, { backgroundColor: colors.secondary, borderRadius: spacing.sm }]}
            >
                <Ionicons name="chevron-back" size={20} color={colors.foreground} />
            </TouchableOpacity>

            <Text
                style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.semibold,
                }}
            >
                {monthLabel}
            </Text>

            <TouchableOpacity
                onPress={onNext}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.button, { backgroundColor: colors.secondary, borderRadius: spacing.sm }]}
            >
                <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    button: {
        padding: 8,
    },
});
