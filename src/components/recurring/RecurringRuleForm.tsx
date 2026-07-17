/**
 * RecurringRuleForm Component
 *
 * Reusable form for creating and editing recurring transaction rules.
 * Uses existing UI components (InputField, DropdownPicker, SegmentControl, Button).
 *
 * UX fixes:
 * - Modal header with title + close button (matches existing modals)
 * - iOS date picker: wrapped in a card with Done button to dismiss
 * - Consistent spacing with rest of the app
 * - Full i18n and accessibility support
 */

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionType } from '../../domain/entities/Transaction';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { useFormatting } from '../../hooks/useFormatting';
import { getButtonA11y } from '../../utils/accessibility';
import type { CreateRecurringTransactionDTO, UpdateRecurringTransactionDTO } from '../../domain/entities/RecurringTransaction';
import type { RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { useCategories } from '../../hooks/useCategories';
import { useWallets } from '../../hooks/useWallets';
import { useTheme } from '../../theme/theme';
import { Button } from '../ui/Button';
import { InputField } from '../ui/InputField';
import { SegmentControl, type Segment } from '../ui/SegmentControl';
import { DropdownPicker, type DropdownItem } from '../ui/DropdownPicker';

interface RecurringRuleFormProps {
    /** Existing rule for editing mode, undefined for create mode */
    existingRule?: RecurringTransaction;
    /** Called on successful form submission */
    onSubmit: (dto: CreateRecurringTransactionDTO | UpdateRecurringTransactionDTO) => Promise<void>;
    /** Called to dismiss the form */
    onCancel: () => void;
}

export const RecurringRuleForm: React.FC<RecurringRuleFormProps> = ({
    existingRule,
    onSubmit,
    onCancel,
}) => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const { wallets } = useWallets();
    const { categories } = useCategories();
    const { parseAmountToCents, centsToMajor, decimals } = useFormatting();

    const isEdit = !!existingRule;

    const TYPE_SEGMENTS: Segment<TransactionType>[] = [
        { key: 'expense', label: t('recurring.segmentExpense'), value: TransactionType.EXPENSE },
        { key: 'income', label: t('recurring.segmentIncome'), value: TransactionType.INCOME },
    ];

    const FREQUENCY_SEGMENTS: Segment<RecurrenceFrequency>[] = [
        { key: 'daily', label: t('recurring.segmentDaily'), value: RecurrenceFrequency.DAILY },
        { key: 'weekly', label: t('recurring.segmentWeekly'), value: RecurrenceFrequency.WEEKLY },
        { key: 'monthly', label: t('recurring.segmentMonthly'), value: RecurrenceFrequency.MONTHLY },
        { key: 'yearly', label: t('recurring.segmentYearly'), value: RecurrenceFrequency.YEARLY },
    ];

    // ─── State ────────────────────────────────────────────────────────
    const [type, setType] = useState<TransactionType>(existingRule?.type ?? TransactionType.EXPENSE);
    const [amount, setAmount] = useState('');
    const [walletId, setWalletId] = useState(existingRule?.walletId ?? (wallets[0]?.id ?? ''));
    const [categoryId, setCategoryId] = useState(existingRule?.categoryId ?? '');
    const [description, setDescription] = useState(existingRule?.description ?? '');
    const [frequency, setFrequency] = useState<RecurrenceFrequency>(
        existingRule?.frequency ?? RecurrenceFrequency.MONTHLY,
    );
    const [interval, setInterval] = useState(existingRule ? String(existingRule.interval) : '1');
    const [startDate, setStartDate] = useState(existingRule?.startDate ?? new Date());
    const [endDate, setEndDate] = useState<Date | undefined>(existingRule?.endDate);
    const [hasEndDate, setHasEndDate] = useState(!!existingRule?.endDate);
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Seed the amount field in major units when editing (per-currency exponent).
    // Re-runs once decimals resolves so a non-2-decimal currency seeds correctly.
    useEffect(() => {
        if (existingRule) {
            setAmount(String(centsToMajor(existingRule.amount)));
        }
    }, [existingRule, centsToMajor]);

    // Filter categories by type and map to DropdownItem
    const filteredCategories = categories.filter(c => {
        if (type === TransactionType.EXPENSE) return c.type === 'expense';
        if (type === TransactionType.INCOME) return c.type === 'income';
        return true;
    });

    const walletItems: DropdownItem[] = wallets.map(w => ({ id: w.id, label: w.name }));
    const categoryItems: DropdownItem[] = filteredCategories.map(c => ({ id: c.id, label: c.name }));

    // ─── Frequency label keys ─────────────────────────────────────────
    const FREQ_KEYS: Record<RecurrenceFrequency, string> = {
        daily: 'recurring.freqDay',
        weekly: 'recurring.freqWeek',
        monthly: 'recurring.freqMonth',
        yearly: 'recurring.freqYear',
    };

    // ─── Handlers ─────────────────────────────────────────────────────

    const handleTypeChange = (newType: TransactionType) => {
        setType(newType);
        setCategoryId(''); // Reset category when type changes
    };

    const handleSubmit = async () => {
        const amountCents = parseAmountToCents(amount);
        if (amountCents === null) {
            Alert.alert(t('recurring.invalidAmount'), t('recurring.invalidAmountMessage'));
            return;
        }
        if (!walletId) {
            Alert.alert(t('recurring.walletRequired'), t('recurring.walletRequiredMessage'));
            return;
        }
        if (!categoryId) {
            Alert.alert(t('recurring.categoryRequired'), t('recurring.categoryRequiredMessage'));
            return;
        }
        const parsedInterval = parseInt(interval, 10);
        if (isNaN(parsedInterval) || parsedInterval < 1) {
            Alert.alert(t('recurring.invalidInterval'), t('recurring.invalidIntervalMessage'));
            return;
        }

        setSubmitting(true);
        try {
            if (isEdit && existingRule) {
                const dto: UpdateRecurringTransactionDTO = {
                    id: existingRule.id,
                    type,
                    amount: amountCents,
                    walletId,
                    categoryId,
                    description: description || undefined,
                    frequency,
                    interval: parsedInterval,
                    endDate: hasEndDate ? endDate : null,
                };
                await onSubmit(dto);
            } else {
                const dto: CreateRecurringTransactionDTO = {
                    type,
                    amount: amountCents,
                    walletId,
                    categoryId,
                    description: description || undefined,
                    startDate,
                    endDate: hasEndDate ? endDate : undefined,
                    frequency,
                    interval: parsedInterval,
                };
                await onSubmit(dto);
            }
        } catch (error) {
            Alert.alert(t('common.error'), error instanceof Error ? error.message : t('recurring.saveFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (d: Date) => d.toLocaleDateString();

    const frequencyLabel = () => {
        const intVal = parseInt(interval, 10) || 1;
        const base = t(FREQ_KEYS[frequency]);
        return intVal === 1
            ? t('recurring.frequencyEvery', { base })
            : t('recurring.frequencyEveryN', { interval: intVal, base });
    };

    // ─── Date Picker Helper (platform-aware) ──────────────────────────

    const renderDatePicker = (
        visible: boolean,
        value: Date,
        onDismiss: () => void,
        onChangeDate: (date: Date) => void,
        minimumDate?: Date,
    ) => {
        if (!visible) return null;

        if (Platform.OS === 'ios') {
            return (
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    marginTop: spacing.sm,
                    padding: spacing.sm,
                    ...shadows.card,
                }}>
                    <DateTimePicker
                        value={value}
                        mode="date"
                        display="spinner"
                        minimumDate={minimumDate}
                        onChange={(_, date) => {
                            if (date) onChangeDate(date);
                        }}
                    />
                    <TouchableOpacity
                        onPress={onDismiss}
                        style={{
                            alignSelf: 'center',
                            backgroundColor: colors.primary,
                            borderRadius: radius.md,
                            paddingHorizontal: spacing.lg,
                            paddingVertical: spacing.xs + 2,
                            marginTop: spacing.xs,
                        }}
                        {...getButtonA11y(t('common.done'))}
                    >
                        <Text style={{ color: '#fff', fontSize: typography.sizes.sm, fontWeight: '600' }}>
                            {t('common.done')}
                        </Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <DateTimePicker
                value={value}
                mode="date"
                display="default"
                minimumDate={minimumDate}
                onChange={(_, date) => {
                    onDismiss();
                    if (date) onChangeDate(date);
                }}
            />
        );
    };

    // ─── Render ───────────────────────────────────────────────────────

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Modal Header */}
            <View style={{
                paddingTop: insets.top,
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.md,
                backgroundColor: colors.card,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <TouchableOpacity onPress={onCancel} style={{ padding: 4 }} {...getButtonA11y(t('a11y.closeButton'))}>
                    <Ionicons name="close" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.lg,
                    fontWeight: '600',
                }}>
                    {isEdit ? t('recurring.editRule') : t('recurring.newRule')}
                </Text>
                {/* Invisible spacer to center title */}
                <View style={{ width: 32 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Type Selector */}
                <Text style={[styles.label, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                    {t('recurring.transactionType')}
                </Text>
                <SegmentControl<TransactionType>
                    segments={TYPE_SEGMENTS}
                    selectedValue={type}
                    onSelect={handleTypeChange}
                />

                {/* Amount */}
                <View style={{ marginTop: spacing.md }}>
                    <InputField
                        label={t('recurring.amount')}
                        placeholder="0.00"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType={decimals === 0 ? "number-pad" : "decimal-pad"}
                    />
                </View>

                {/* Wallet */}
                <View style={{ marginTop: spacing.md }}>
                    <DropdownPicker
                        label={t('recurring.wallet')}
                        items={walletItems}
                        selectedId={walletId}
                        onSelect={setWalletId}
                    />
                </View>

                {/* Category */}
                <View style={{ marginTop: spacing.md }}>
                    <DropdownPicker
                        label={t('recurring.category')}
                        items={categoryItems}
                        selectedId={categoryId}
                        onSelect={setCategoryId}
                        placeholder={t('recurring.selectCategory')}
                    />
                </View>

                {/* Description */}
                <View style={{ marginTop: spacing.md }}>
                    <InputField
                        label={t('recurring.description')}
                        placeholder={t('recurring.descriptionPlaceholder')}
                        value={description}
                        onChangeText={setDescription}
                    />
                </View>

                {/* Frequency */}
                <View style={{ marginTop: spacing.lg }}>
                    <Text style={[styles.label, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                        {t('recurring.frequency')}
                    </Text>
                    <SegmentControl<RecurrenceFrequency>
                        segments={FREQUENCY_SEGMENTS}
                        selectedValue={frequency}
                        onSelect={setFrequency}
                    />
                </View>

                {/* Interval */}
                <View style={{ marginTop: spacing.md }}>
                    <InputField
                        label={t('recurring.repeatEvery')}
                        placeholder="1"
                        value={interval}
                        onChangeText={setInterval}
                        keyboardType="numeric"
                    />
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs, marginTop: 4 }}>
                        {frequencyLabel()}
                    </Text>
                </View>

                {/* Start Date */}
                {!isEdit && (
                    <View style={{ marginTop: spacing.md }}>
                        <Text style={[styles.label, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                            {t('recurring.startDate')}
                        </Text>
                        <Pressable
                            onPress={() => setShowStartPicker(!showStartPicker)}
                            style={{
                                backgroundColor: colors.card,
                                borderRadius: radius.md,
                                padding: spacing.sm,
                                ...shadows.card,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                            {...getButtonA11y(t('a11y.selectDate'))}
                        >
                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                {formatDate(startDate)}
                            </Text>
                            <Ionicons name="calendar-outline" size={20} color={colors.mutedForeground} />
                        </Pressable>
                        {renderDatePicker(
                            showStartPicker,
                            startDate,
                            () => setShowStartPicker(false),
                            setStartDate,
                        )}
                    </View>
                )}

                {/* End Date */}
                <View style={{ marginTop: spacing.md }}>
                    <Pressable
                        onPress={() => {
                            setHasEndDate(!hasEndDate);
                            if (!hasEndDate && !endDate) {
                                const d = new Date();
                                d.setFullYear(d.getFullYear() + 1);
                                setEndDate(d);
                            }
                            if (hasEndDate) {
                                setShowEndPicker(false);
                            }
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}
                        {...getButtonA11y(t('a11y.toggleEndDate'))}
                    >
                        <Ionicons
                            name={hasEndDate ? 'checkbox-outline' : 'square-outline'}
                            size={22}
                            color={colors.primary}
                        />
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, marginLeft: spacing.xs }}>
                            {t('recurring.setEndDate')}
                        </Text>
                    </Pressable>
                    {hasEndDate && (
                        <>
                            <Pressable
                                onPress={() => setShowEndPicker(!showEndPicker)}
                                style={{
                                    backgroundColor: colors.card,
                                    borderRadius: radius.md,
                                    padding: spacing.sm,
                                    ...shadows.card,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                                {...getButtonA11y(t('a11y.selectDate'))}
                            >
                                <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                    {endDate ? formatDate(endDate) : t('recurring.selectEndDate')}
                                </Text>
                                <Ionicons name="calendar-outline" size={20} color={colors.mutedForeground} />
                            </Pressable>
                            {renderDatePicker(
                                showEndPicker,
                                endDate ?? new Date(),
                                () => setShowEndPicker(false),
                                (date) => setEndDate(date),
                                startDate,
                            )}
                        </>
                    )}
                </View>

                {/* Actions */}
                <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
                    <Button
                        title={isEdit ? t('recurring.updateRule') : t('recurring.createRule')}
                        onPress={handleSubmit}
                        loading={submitting}
                    />
                    <Button
                        title={t('common.cancel')}
                        variant="secondary"
                        onPress={onCancel}
                    />
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    label: {
        fontWeight: '600',
        marginBottom: 8,
    },
});
