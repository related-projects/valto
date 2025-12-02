import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme';

interface ListItemProps {
    title: string;
    subtitle?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    onPress?: () => void;
    style?: ViewStyle;
    showChevron?: boolean;
}

export const ListItem: React.FC<ListItemProps> = ({
    title,
    subtitle,
    leftIcon,
    rightIcon,
    onPress,
    style,
    showChevron = true,
}) => {
    const { colors, typography, spacing, radius } = useTheme();

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={!onPress}
            style={[
                styles.container,
                {
                    paddingVertical: spacing.md,
                },
                style,
            ]}
        >
            <View style={styles.leftContent}>
                {leftIcon && <View style={{ marginRight: spacing.md }}>{leftIcon}</View>}
                <View>
                    <Text
                        style={{
                            color: colors.foreground,
                            fontSize: typography.sizes.md,
                            fontWeight: '500',
                        }}
                    >
                        {title}
                    </Text>
                </View>
            </View>
            <View style={styles.rightContent}>
                {rightIcon}
                {subtitle && showChevron && (
                    <Text
                        style={{
                            color: colors.mutedForeground,
                            fontSize: typography.sizes.sm,
                            marginRight: spacing.xs,
                        }}
                    >
                        {subtitle}
                    </Text>
                )}
                {showChevron && onPress && !rightIcon && (
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    leftContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    rightContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
