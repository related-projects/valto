/**
 * Option Picker Modal
 *
 * A full-screen list of options, one row each, with a check on the current
 * one and an X control in the header that closes the picker without choosing.
 * Picking a row closes the picker and hands its value to the caller.
 *
 * Moved unchanged out of MonthStartDayPickerModal (pass 101b item 1) so the
 * theme and date-format rows can use it too: on Android an Alert shows at most
 * three buttons, so a three-option Alert lost its Cancel button (REGISTRE C43).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/theme';
import { getButtonA11y } from '../../utils/accessibility';

export interface PickerOption<T> {
    value: T;
    /** Text shown on the row. */
    label: string;
    testID: string;
    /** Spoken name of the row, when the visible label is not enough. Defaults to the label. */
    accessibilityLabel?: string;
}

interface OptionPickerModalProps<T> {
    visible: boolean;
    title: string;
    options: PickerOption<T>[];
    selectedValue: T;
    onSelect: (value: T) => void;
    onClose: () => void;
    /** Translated accessibility label of the X control. */
    closeLabel: string;
    closeTestID: string;
}

export function OptionPickerModal<T>({
    visible,
    title,
    options,
    selectedValue,
    onSelect,
    onClose,
    closeLabel,
    closeTestID,
}: OptionPickerModalProps<T>) {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();

    const handleSelect = useCallback((value: T) => {
        onClose();
        onSelect(value);
    }, [onSelect, onClose]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                {/* Header */}
                <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
                    <TouchableOpacity
                        onPress={onClose}
                        testID={closeTestID}
                        {...getButtonA11y(closeLabel)}
                    >
                        <Ionicons name="close" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {title}
                    </Text>
                    <View style={{ width: 24 }} />
                </View>

                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + spacing.lg }}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.listCard, {
                        backgroundColor: colors.card,
                        borderRadius: radius.md,
                        ...shadows.card,
                    }]}>
                        {options.map((option, index) => {
                            const isSelected = option.value === selectedValue;
                            const isLast = index === options.length - 1;
                            return (
                                <TouchableOpacity
                                    key={option.testID}
                                    testID={option.testID}
                                    accessibilityRole="button"
                                    accessibilityLabel={option.accessibilityLabel ?? option.label}
                                    accessibilityState={{ selected: isSelected }}
                                    style={[
                                        styles.row,
                                        {
                                            paddingVertical: spacing.sm + 4,
                                            paddingHorizontal: spacing.md,
                                            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                                            borderBottomColor: colors.border,
                                        },
                                    ]}
                                    onPress={() => handleSelect(option.value)}
                                    activeOpacity={0.6}
                                >
                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '500' }}>
                                        {option.label}
                                    </Text>
                                    {isSelected && (
                                        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
    },
    listCard: {
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
});
