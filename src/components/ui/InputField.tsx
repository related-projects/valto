import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme';

interface InputFieldProps extends TextInputProps {
    label?: string;
    error?: string;
    containerStyle?: ViewStyle;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

export const InputField: React.FC<InputFieldProps> = ({
    label,
    error,
    containerStyle,
    leftIcon,
    rightIcon,
    style,
    ...props
}) => {
    const { colors, typography, spacing, radius } = useTheme();

    return (
        <View style={[styles.container, containerStyle]}>
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
                        backgroundColor: colors.input,
                        borderColor: error ? colors.destructive : 'transparent',
                        borderRadius: radius.md,
                        paddingHorizontal: spacing.md,
                        height: 48,
                    },
                ]}
            >
                {leftIcon && <View style={{ marginRight: spacing.sm }}>{leftIcon}</View>}
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
                    {...props}
                />
                {rightIcon && <View style={{ marginLeft: spacing.sm }}>{rightIcon}</View>}
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
    },
    label: {
        fontWeight: '500',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
    },
    input: {
        flex: 1,
        height: '100%',
    },
    error: {
        fontWeight: '400',
    },
});
