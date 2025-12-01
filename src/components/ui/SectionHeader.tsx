import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme';

interface SectionHeaderProps {
    title: string;
    action?: string;
    onActionPress?: () => void;
    style?: ViewStyle;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    action,
    onActionPress,
    style,
}) => {
    const { colors, typography, spacing } = useTheme();

    return (
        <View style={[styles.container, { marginBottom: spacing.sm }, style]}>
            <Text
                style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.lg,
                    fontWeight: '600',
                }}
            >
                {title}
            </Text>
            {action && (
                <TouchableOpacity onPress={onActionPress}>
                    <Text
                        style={{
                            color: colors.primary,
                            fontSize: typography.sizes.sm,
                            fontWeight: '500',
                        }}
                    >
                        {action}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
});
