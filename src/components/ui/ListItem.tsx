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
    testID?: string;
}

export const ListItem: React.FC<ListItemProps> = ({
    title,
    subtitle,
    leftIcon,
    rightIcon,
    onPress,
    style,
    showChevron = true,
    testID,
}) => {
    const { colors, typography, spacing, radius } = useTheme();

    return (
        <TouchableOpacity
            testID={testID}
            onPress={onPress}
            disabled={!onPress}
            style={[
                styles.container,
                {
                    paddingVertical: spacing.sm,
                },
                style,
            ]}
        >
            <View style={styles.leftContent}>
                {leftIcon && <View style={{ marginRight: spacing.md }}>{leftIcon}</View>}
                <View style={{ flexShrink: 1 }}>
                    <Text
                        style={{
                            color: colors.foreground,
                            fontSize: typography.sizes.md,
                            fontWeight: '500',
                        }}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                </View>
            </View>
            <View style={styles.rightContent}>
                {rightIcon}
                {subtitle && (
                    <Text
                        style={{
                            color: colors.mutedForeground,
                            fontSize: typography.sizes.sm,
                            marginRight: spacing.xs,
                            flexShrink: 1,
                        }}
                        numberOfLines={2}
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
        flexShrink: 1,
        maxWidth: '55%',
    },
});

