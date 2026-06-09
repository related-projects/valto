import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
    textStyle?: TextStyle;
    icon?: React.ReactNode;
    testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    style,
    textStyle,
    icon,
    testID,
}) => {
    const { colors, spacing, radius, typography } = useTheme();

    const getBackgroundColor = () => {
        if (disabled) return colors.muted;
        switch (variant) {
            case 'primary': return colors.primary;
            case 'secondary': return colors.secondary;
            case 'destructive': return colors.destructive;
            case 'outline': return 'transparent';
            case 'ghost': return 'transparent';
            default: return colors.primary;
        }
    };

    const getTextColor = () => {
        if (disabled) return colors.mutedForeground;
        switch (variant) {
            case 'primary': return colors.primaryForeground;
            case 'secondary': return colors.secondaryForeground;
            case 'destructive': return colors.destructiveForeground;
            case 'outline': return colors.foreground;
            case 'ghost': return colors.primary;
            default: return colors.primaryForeground;
        }
    };

    const getBorderColor = () => {
        if (variant === 'outline') return colors.border;
        return 'transparent';
    };

    const getPadding = () => {
        switch (size) {
            case 'sm': return { paddingVertical: spacing.xs, paddingHorizontal: spacing.md };
            case 'lg': return { paddingVertical: spacing.md, paddingHorizontal: spacing.xl };
            default: return { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg }; // md
        }
    };

    return (
        <TouchableOpacity
            testID={testID}
            onPress={onPress}
            disabled={disabled || loading}
            style={[
                styles.container,
                {
                    backgroundColor: getBackgroundColor(),
                    borderColor: getBorderColor(),
                    borderWidth: variant === 'outline' ? 1 : 0,
                    borderRadius: radius.md,
                    ...getPadding(),
                },
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={getTextColor()} />
            ) : (
                <>
                    {icon}
                    <Text
                        style={[
                            styles.text,
                            {
                                color: getTextColor(),
                                fontSize: size === 'sm' ? typography.sizes.sm : typography.sizes.md,
                                marginLeft: icon ? spacing.sm : 0,
                            },
                            textStyle,
                        ]}
                    >
                        {title}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontWeight: '600',
    },
});
