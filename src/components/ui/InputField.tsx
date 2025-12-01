import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/theme';

interface InputFieldProps extends TextInputProps {
    label?: string;
    error?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    onRightIconPress?: () => void;
    variant?: 'default' | 'pill';
}

export const InputField: React.FC<InputFieldProps> = ({
    label,
    error,
    leftIcon,
    rightIcon,
    onRightIconPress,
    variant = 'default',
    style,
    ...props
}) => {
    const { colors, typography, spacing, radius } = useTheme();
    const [isFocused, setIsFocused] = useState(false);

    const isPill = variant === 'pill';

    return (
        <View style={styles.container}>
            {label && (
                <Text
                    style={[
                        styles.label,
                        {
                            color: colors.foreground,
                            marginBottom: spacing.xs,
                            fontSize: typography.sizes.sm,
                        },
                    ]}
                >
                    {label}
                </Text>
            )}
            <View
                style={[
                    styles.inputContainer,
                    {
                        backgroundColor: isPill ? colors.card : colors.input,
                        borderColor: error
                            ? colors.destructive
                            : isFocused
                                ? colors.primary
                                : isPill ? colors.border : 'transparent',
                        borderWidth: isPill ? 1 : 1,
                        borderRadius: isPill ? 999 : radius.md,
                        paddingHorizontal: spacing.md,
                        height: isPill ? 44 : 48,
                    },
                ]}
            >
                {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
                <TextInput
                    style={[
                        styles.input,
                        {
                            color: colors.foreground,
                            fontSize: typography.sizes.md,
                        },
                        style,
                    ]}
                    placeholderTextColor={colors.mutedForeground}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    {...props}
                />
                {rightIcon && (
                    <TouchableOpacity onPress={onRightIconPress} disabled={!onRightIconPress}>
                        <View style={styles.rightIcon}>{rightIcon}</View>
                    </TouchableOpacity>
                )}
            </View>
            {error && (
                <Text
                    style={[
                        styles.error,
                        {
                            color: colors.destructive,
                            marginTop: spacing.xs,
                            fontSize: typography.sizes.xs,
                        },
                    ]}
                >
                    {error}
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginBottom: 16,
    },
    label: {
        fontWeight: '500',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: '100%',
    },
    leftIcon: {
        marginRight: 8,
    },
    rightIcon: {
        marginLeft: 8,
    },
    error: {
        fontWeight: '500',
    },
});
