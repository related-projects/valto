import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme/theme';

interface FilterPillProps {
    label: string;
    isActive: boolean;
    onPress: () => void;
}

export const FilterPill: React.FC<FilterPillProps> = ({ label, isActive, onPress }) => {
    const { colors, typography, spacing, radius } = useTheme();

    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.container,
                {
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.full,
                    backgroundColor: isActive ? colors.accent : colors.card,
                    borderWidth: 1,
                    borderColor: isActive ? colors.accent : colors.border,
                    marginRight: spacing.sm,
                },
            ]}
        >
            <Text
                style={{
                    color: isActive ? colors.accentForeground : colors.foreground,
                    fontWeight: isActive ? typography.weights.semibold : typography.weights.regular,
                    fontSize: typography.sizes.sm,
                }}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
