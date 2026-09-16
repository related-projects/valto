/**
 * Language Picker Modal
 *
 * Lists the languages getOfferedLanguages allows - the complete locales, plus
 * the one the install already holds. Shows native name + English name with a
 * checkmark on the current selection.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOfferedLanguages, type LanguageDefinition } from '../../domain/constants/languages';
import { useTheme } from '../../theme/theme';

interface LanguagePickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (language: LanguageDefinition) => void;
    selectedCode: string;
}

export const LanguagePickerModal: React.FC<LanguagePickerModalProps> = ({
    visible,
    onClose,
    onSelect,
    selectedCode,
}) => {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const handleSelect = useCallback((lang: LanguageDefinition) => {
        onSelect(lang);
        onClose();
    }, [onSelect, onClose]);

    // Derived from the active code, not from SUPPORTED_LANGUAGES: the set that
    // may be OFFERED is narrower than the set that may be STORED. See the
    // COMPLETE_LANGUAGE_CODES block in domain/constants/languages.ts.
    const offeredLanguages = getOfferedLanguages(selectedCode);

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
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {t('languagePicker.title')}
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
                        {offeredLanguages.map((lang, index) => {
                            const isSelected = lang.code === selectedCode;
                            const isLast = index === offeredLanguages.length - 1;
                            return (
                                <TouchableOpacity
                                    key={lang.code}
                                    style={[
                                        styles.row,
                                        {
                                            paddingVertical: spacing.sm + 4,
                                            paddingHorizontal: spacing.md,
                                            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                                            borderBottomColor: colors.border,
                                        },
                                    ]}
                                    onPress={() => handleSelect(lang)}
                                    activeOpacity={0.6}
                                >
                                    <View>
                                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '500' }}>
                                            {lang.nativeName}
                                        </Text>
                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                            {lang.name}
                                        </Text>
                                    </View>
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
