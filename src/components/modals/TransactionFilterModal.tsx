/**
 * TransactionFilterModal
 *
 * Bottom-sheet modal for composing transaction filters.
 * Follows the same visual pattern as AddTransactionModal.
 *
 * UI-only responsibilities:
 * - Collects filter inputs into local state
 * - On "Apply": pushes local state to the hook's setFilters(), closes modal
 * - On "Reset": clears local state and resets hook filters
 * - On close (tap outside / ✕): discards local changes, closes modal
 */

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dimensions,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { TransactionType } from '../../domain/entities';
import { TransactionFilters } from '../../domain/filters/filterTransactions';
import { useCategories } from '../../hooks/useCategories';
import { useFormatting } from '../../hooks/useFormatting';
import { useWallets } from '../../hooks/useWallets';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
import { FilterPill } from '../ui/FilterPill';

// ─── Props ────────────────────────────────────────────────────────────

interface TransactionFilterModalProps {
    visible: boolean;
    onClose: () => void;
    currentFilters: TransactionFilters;
    onApply: (filters: TransactionFilters) => void;
    onReset: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;

// ─── Component ────────────────────────────────────────────────────────

export const TransactionFilterModal: React.FC<TransactionFilterModalProps> = ({
    visible,
    onClose,
    currentFilters,
    onApply,
    onReset,
}) => {
    const { colors, spacing, typography, radius } = useTheme();
    const { t, i18n } = useTranslation();
    const { categories } = useCategories();
    const { wallets } = useWallets();
    const { parseAmount } = useFormatting();

    // ── Local filter state (copied from current on open) ──────────────

    const [selectedTypes, setSelectedTypes] = useState<TransactionType[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([]);
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');

    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showEndDatePicker, setShowEndDatePicker] = useState(false);

    // Sync local state from current filters when modal opens
    useEffect(() => {
        if (visible) {
            setSelectedTypes(currentFilters.types || []);
            setSelectedCategoryIds(currentFilters.categoryIds || []);
            setSelectedWalletIds(currentFilters.walletIds || []);
            setStartDate(currentFilters.startDate);
            setEndDate(currentFilters.endDate);
            setMinAmount(currentFilters.minAmount !== undefined ? String(currentFilters.minAmount) : '');
            setMaxAmount(currentFilters.maxAmount !== undefined ? String(currentFilters.maxAmount) : '');
        }
    }, [visible, currentFilters]);

    // ── Handlers ──────────────────────────────────────────────────────

    const toggleType = useCallback((type: TransactionType) => {
        setSelectedTypes((prev) =>
            prev.includes(type)
                ? prev.filter((t) => t !== type)
                : [...prev, type]
        );
    }, []);

    const toggleCategory = useCallback((id: string) => {
        setSelectedCategoryIds((prev) =>
            prev.includes(id)
                ? prev.filter((c) => c !== id)
                : [...prev, id]
        );
    }, []);

    const toggleWallet = useCallback((id: string) => {
        setSelectedWalletIds((prev) =>
            prev.includes(id)
                ? prev.filter((w) => w !== id)
                : [...prev, id]
        );
    }, []);

    const handleStartDateChange = useCallback((_event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowStartDatePicker(false);
        }
        if (selectedDate) {
            setStartDate(selectedDate);
        }
    }, []);

    const handleEndDateChange = useCallback((_event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowEndDatePicker(false);
        }
        if (selectedDate) {
            setEndDate(selectedDate);
        }
    }, []);

    const formatDateLabel = useCallback((d: Date | undefined, placeholder: string): string => {
        if (!d) return placeholder;
        return d.toLocaleDateString(i18n.language, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }, [i18n.language]);

    const handleApply = useCallback(() => {
        const filters: TransactionFilters = {};

        if (selectedTypes.length > 0) filters.types = selectedTypes;
        if (selectedCategoryIds.length > 0) filters.categoryIds = selectedCategoryIds;
        if (selectedWalletIds.length > 0) filters.walletIds = selectedWalletIds;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;

        const parsedMin = parseAmount(minAmount);
        const parsedMax = parseAmount(maxAmount);
        if (parsedMin !== null && parsedMin >= 0) filters.minAmount = parsedMin;
        if (parsedMax !== null && parsedMax >= 0) filters.maxAmount = parsedMax;

        onApply(filters);
        onClose();
    }, [selectedTypes, selectedCategoryIds, selectedWalletIds, startDate, endDate, minAmount, maxAmount, parseAmount, onApply, onClose]);

    const handleReset = useCallback(() => {
        setSelectedTypes([]);
        setSelectedCategoryIds([]);
        setSelectedWalletIds([]);
        setStartDate(undefined);
        setEndDate(undefined);
        setMinAmount('');
        setMaxAmount('');
        onReset();
        onClose();
    }, [onReset, onClose]);

    // ── Active filter count ───────────────────────────────────────────

    const activeCount = useMemo(() => {
        let count = 0;
        if (selectedTypes.length > 0) count++;
        if (selectedCategoryIds.length > 0) count++;
        if (selectedWalletIds.length > 0) count++;
        if (startDate || endDate) count++;
        if (minAmount || maxAmount) count++;
        return count;
    }, [selectedTypes, selectedCategoryIds, selectedWalletIds, startDate, endDate, minAmount, maxAmount]);

    // ── Render ────────────────────────────────────────────────────────

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <TouchableOpacity style={styles.overlayTouchable} activeOpacity={1} onPress={onClose} />
                <View style={[styles.modalContainer, { backgroundColor: colors.card, height: MODAL_HEIGHT }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={onClose} style={styles.headerButton} testID="filter_close_button">
                            <Ionicons name="close" size={24} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                            {t('transactions.filter.title')}
                        </Text>
                        <TouchableOpacity onPress={handleReset} style={styles.headerButton} testID="filter_reset_button">
                            <Text style={{ color: colors.accent, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                                {t('transactions.filter.reset')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.scrollContent}
                        contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: spacing.tabBarOffset }]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* ── Type Filter ─────────────────────────── */}
                        <View style={{ marginBottom: spacing.xl }}>
                            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }]}>
                                {t('transactions.filter.type')}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                                <FilterPill
                                    label={t('transactions.filterIncome')}
                                    isActive={selectedTypes.includes(TransactionType.INCOME)}
                                    onPress={() => toggleType(TransactionType.INCOME)}
                                />
                                <FilterPill
                                    label={t('transactions.filterExpense')}
                                    isActive={selectedTypes.includes(TransactionType.EXPENSE)}
                                    onPress={() => toggleType(TransactionType.EXPENSE)}
                                />
                                <FilterPill
                                    label={t('transactions.filterTransfer')}
                                    isActive={selectedTypes.includes(TransactionType.TRANSFER)}
                                    onPress={() => toggleType(TransactionType.TRANSFER)}
                                />
                            </View>
                        </View>

                        {/* ── Category Filter ────────────────────── */}
                        <View style={{ marginBottom: spacing.xl }}>
                            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }]}>
                                {t('transactions.filter.category')}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                                {categories.map((cat) => (
                                    <FilterPill
                                        key={cat.id}
                                        label={cat.name}
                                        isActive={selectedCategoryIds.includes(cat.id)}
                                        onPress={() => toggleCategory(cat.id)}
                                    />
                                ))}
                                {categories.length === 0 && (
                                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, fontStyle: 'italic' }}>
                                        {t('transactions.filter.selectCategories')}
                                    </Text>
                                )}
                            </View>
                        </View>

                        {/* ── Wallet Filter ──────────────────────── */}
                        <View style={{ marginBottom: spacing.xl }}>
                            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }]}>
                                {t('transactions.filter.wallet')}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                                {wallets.map((w) => (
                                    <FilterPill
                                        key={w.id}
                                        label={w.name}
                                        isActive={selectedWalletIds.includes(w.id)}
                                        onPress={() => toggleWallet(w.id)}
                                    />
                                ))}
                                {wallets.length === 0 && (
                                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, fontStyle: 'italic' }}>
                                        {t('transactions.filter.selectWallets')}
                                    </Text>
                                )}
                            </View>
                        </View>

                        {/* ── Date Range Filter ──────────────────── */}
                        <View style={{ marginBottom: spacing.xl }}>
                            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }]}>
                                {t('transactions.filter.dateRange')}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                                {/* Start Date */}
                                <TouchableOpacity
                                    style={[styles.dateButton, {
                                        backgroundColor: colors.background,
                                        borderColor: startDate ? colors.accent : colors.border,
                                        flex: 1,
                                    }]}
                                    onPress={() => setShowStartDatePicker(true)}
                                    testID="filter_start_date_button"
                                >
                                    <Ionicons name="calendar-outline" size={16} color={startDate ? colors.accent : colors.mutedForeground} style={{ marginRight: spacing.xs }} />
                                    <Text style={{ color: startDate ? colors.foreground : colors.mutedForeground, fontSize: typography.sizes.sm, flex: 1 }}
                                          numberOfLines={1}
                                    >
                                        {formatDateLabel(startDate, t('transactions.filter.startDate'))}
                                    </Text>
                                    {startDate && (
                                        <TouchableOpacity onPress={() => setStartDate(undefined)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>

                                <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />

                                {/* End Date */}
                                <TouchableOpacity
                                    style={[styles.dateButton, {
                                        backgroundColor: colors.background,
                                        borderColor: endDate ? colors.accent : colors.border,
                                        flex: 1,
                                    }]}
                                    onPress={() => setShowEndDatePicker(true)}
                                    testID="filter_end_date_button"
                                >
                                    <Ionicons name="calendar-outline" size={16} color={endDate ? colors.accent : colors.mutedForeground} style={{ marginRight: spacing.xs }} />
                                    <Text style={{ color: endDate ? colors.foreground : colors.mutedForeground, fontSize: typography.sizes.sm, flex: 1 }}
                                          numberOfLines={1}
                                    >
                                        {formatDateLabel(endDate, t('transactions.filter.endDate'))}
                                    </Text>
                                    {endDate && (
                                        <TouchableOpacity onPress={() => setEndDate(undefined)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Date Pickers */}
                            {showStartDatePicker && (
                                Platform.OS === 'ios' ? (
                                    <>
                                        <Pressable
                                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
                                            onPress={() => setShowStartDatePicker(false)}
                                        />
                                        <View style={{ zIndex: 2, marginTop: spacing.sm }}>
                                            <DateTimePicker
                                                value={startDate || new Date()}
                                                mode="date"
                                                display="spinner"
                                                onChange={handleStartDateChange}
                                            />
                                        </View>
                                    </>
                                ) : (
                                    <DateTimePicker
                                        value={startDate || new Date()}
                                        mode="date"
                                        display="default"
                                        onChange={handleStartDateChange}
                                    />
                                )
                            )}
                            {showEndDatePicker && (
                                Platform.OS === 'ios' ? (
                                    <>
                                        <Pressable
                                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
                                            onPress={() => setShowEndDatePicker(false)}
                                        />
                                        <View style={{ zIndex: 2, marginTop: spacing.sm }}>
                                            <DateTimePicker
                                                value={endDate || new Date()}
                                                mode="date"
                                                display="spinner"
                                                onChange={handleEndDateChange}
                                            />
                                        </View>
                                    </>
                                ) : (
                                    <DateTimePicker
                                        value={endDate || new Date()}
                                        mode="date"
                                        display="default"
                                        onChange={handleEndDateChange}
                                    />
                                )
                            )}
                        </View>

                        {/* ── Amount Range Filter ────────────────── */}
                        <View style={{ marginBottom: spacing.xl }}>
                            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }]}>
                                {t('transactions.filter.amountRange')}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                                <View style={[styles.amountInput, { backgroundColor: colors.background, borderColor: minAmount ? colors.accent : colors.border, flex: 1 }]}>
                                    <TextInput
                                        style={{ color: colors.foreground, fontSize: typography.sizes.sm, flex: 1, padding: 0 }}
                                        placeholder={t('transactions.filter.minAmount')}
                                        placeholderTextColor={colors.mutedForeground}
                                        keyboardType="decimal-pad"
                                        value={minAmount}
                                        onChangeText={setMinAmount}
                                        testID="filter_min_amount_input"
                                    />
                                </View>
                                <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
                                <View style={[styles.amountInput, { backgroundColor: colors.background, borderColor: maxAmount ? colors.accent : colors.border, flex: 1 }]}>
                                    <TextInput
                                        style={{ color: colors.foreground, fontSize: typography.sizes.sm, flex: 1, padding: 0 }}
                                        placeholder={t('transactions.filter.maxAmount')}
                                        placeholderTextColor={colors.mutedForeground}
                                        keyboardType="decimal-pad"
                                        value={maxAmount}
                                        onChangeText={setMaxAmount}
                                        testID="filter_max_amount_input"
                                    />
                                </View>
                            </View>
                        </View>

                        {/* ── Apply Button ────────────────────────── */}
                        <TouchableOpacity
                            style={[
                                styles.applyButton,
                                { backgroundColor: colors.accent, borderRadius: radius.md },
                            ]}
                            onPress={handleApply}
                            testID="filter_apply_button"
                            activeOpacity={0.8}
                        >
                            <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>
                                {t('transactions.filter.apply')}
                                {activeCount > 0 ? ` (${activeCount})` : ''}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    overlayTouchable: {
        flex: 1,
    },
    modalContainer: {
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    headerButton: {
        padding: spacing.xs,
    },
    scrollContent: {
        flex: 1,
    },
    scrollContentContainer: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xl,
    },
    sectionLabel: {
        fontWeight: '600' as const,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
    },
    amountInput: {
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
    },
    applyButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        marginTop: spacing.md,
    },
});
