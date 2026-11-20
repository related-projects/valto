/**
 * Month Start Day Picker Modal
 *
 * The days 1 to 31 a month can start on (REGISTRE C20), as a scrollable list:
 * an Alert, the picker the first-day-of-week row used, cannot hold 31 items.
 * A check marks the current day. Picking closes the picker and hands the day
 * to the caller, which asks for confirmation before storing it.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/theme';
import { getButtonA11y } from '../../utils/accessibility';

interface MonthStartDayPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (day: number) => void;
    selectedDay: number;
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export const MonthStartDayPickerModal: React.FC<MonthStartDayPickerModalProps> = ({
    visible,
    onClose,
    onSelect,
    selectedDay,
}) => {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const handleSelect = useCallback((day: number) => {
        onClose();
        onSelect(day);
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
                        testID="month_start_day_picker_close"
                        {...getButtonA11y(t('a11y.closeButton'))}
                    >
                        <Ionicons name="close" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {t('settings.monthStartDay')}
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
                        {DAYS.map((day) => {
                            const isSelected = day === selectedDay;
                            const isLast = day === DAYS.length;
                            return (
                                <TouchableOpacity
                                    key={day}
                                    testID={`month_start_day_option_${day}`}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('settings.monthStartDayValue', { day })}
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
                                    onPress={() => handleSelect(day)}
                                    activeOpacity={0.6}
                                >
                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '500' }}>
                                        {String(day)}
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
};

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
