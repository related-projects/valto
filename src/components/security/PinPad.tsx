/**
 * PinPad Component
 *
 * 4-digit PIN entry with animated dots and optional biometric shortcut.
 * Follows existing design system tokens.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PIN_LENGTH } from '../../domain/security/types';
import { useTheme } from '../../theme/theme';

interface PinPadProps {
    /** Called when user completes PIN entry */
    onComplete: (pin: string) => void;
    /** Show biometric button */
    showBiometricButton?: boolean;
    /** Called when biometric button is pressed */
    onBiometricPress?: () => void;
    /** Title text above dots */
    title?: string;
    /** Subtitle/error text below dots */
    subtitle?: string;
    /** Whether to show error state (shake/red) */
    error?: boolean;
    /** Disable all input (e.g. during a brute-force lock-out) */
    disabled?: boolean;
}

export const PinPad: React.FC<PinPadProps> = ({
    onComplete,
    showBiometricButton = false,
    onBiometricPress,
    title = 'Enter PIN',
    subtitle,
    error = false,
    disabled = false,
}) => {
    const { colors, typography, spacing, radius } = useTheme();
    const [pin, setPin] = useState('');

    const handleDigit = useCallback((digit: string) => {
        if (disabled) return;
        setPin(prev => {
            const next = prev + digit;
            if (next.length === PIN_LENGTH) {
                // Defer the callback to avoid updating state during render
                setTimeout(() => {
                    onComplete(next);
                    setPin('');
                }, 100);
                return next;
            }
            return next;
        });
    }, [onComplete, disabled]);

    const handleBackspace = useCallback(() => {
        if (disabled) return;
        setPin(prev => prev.slice(0, -1));
    }, [disabled]);

    // ── Dots ──────────────────────────────────────────────────────────
    const renderDots = () => (
        <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <View
                    key={i}
                    style={[
                        styles.dot,
                        {
                            backgroundColor: i < pin.length
                                ? (error ? colors.destructive : colors.primary)
                                : colors.muted,
                            borderRadius: radius.full,
                        },
                    ]}
                />
            ))}
        </View>
    );

    // ── Keypad ────────────────────────────────────────────────────────
    const renderButton = (label: string, onPress: () => void, icon?: string) => (
        <TouchableOpacity
            key={label}
            style={[styles.key, { borderRadius: radius.full, opacity: disabled ? 0.35 : 1 }]}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.6}
        >
            {icon ? (
                <Ionicons name={icon as any} size={24} color={colors.foreground} />
            ) : (
                <Text style={[styles.keyText, { color: colors.foreground, fontSize: typography.sizes['2xl'] }]}>
                    {label}
                </Text>
            )}
        </TouchableOpacity>
    );

    const rows = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
    ];

    return (
        <View style={styles.container}>
            <Text style={[styles.title, { color: colors.foreground, fontSize: typography.sizes.xl }]}>
                {title}
            </Text>

            {renderDots()}

            {subtitle && (
                <Text style={[
                    styles.subtitle,
                    {
                        color: error ? colors.destructive : colors.mutedForeground,
                        fontSize: typography.sizes.sm,
                    },
                ]}>
                    {subtitle}
                </Text>
            )}

            <View style={[styles.keypad, { marginTop: spacing.xl }]}>
                {rows.map((row, rowIdx) => (
                    <View key={rowIdx} style={styles.keyRow}>
                        {row.map(digit => renderButton(digit, () => handleDigit(digit)))}
                    </View>
                ))}

                {/* Bottom row: biometric / 0 / backspace */}
                <View style={styles.keyRow}>
                    {showBiometricButton && onBiometricPress ? (
                        renderButton('bio', onBiometricPress, 'finger-print-outline')
                    ) : (
                        <View style={styles.key} />
                    )}
                    {renderButton('0', () => handleDigit('0'))}
                    {renderButton('del', handleBackspace, 'backspace-outline')}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        paddingHorizontal: 32,
    },
    title: {
        fontWeight: '600',
        marginBottom: 24,
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 12,
    },
    dot: {
        width: 16,
        height: 16,
    },
    subtitle: {
        marginTop: 8,
        textAlign: 'center',
    },
    keypad: {
        width: '100%',
        maxWidth: 300,
    },
    keyRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    key: {
        width: 72,
        height: 72,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyText: {
        fontWeight: '500',
    },
});
