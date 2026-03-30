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
 */

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionType } from '../../domain/entities/Transaction';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { normalizeAmount, centsToMajor } from '../../utils/normalizeAmount';
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

const TYPE_SEGMENTS: Segment<TransactionType>[] = [
    { key: 'expense', label: 'Expense', value: TransactionType.EXPENSE },
    { key: 'income', label: 'Income', value: TransactionType.INCOME },
];

const FREQUENCY_SEGMENTS: Segment<RecurrenceFrequency>[] = [
    { key: 'daily', label: 'Daily', value: RecurrenceFrequency.DAILY },
    { key: 'weekly', label: 'Weekly', value: RecurrenceFrequency.WEEKLY },
    { key: 'monthly', label: 'Monthly', value: RecurrenceFrequency.MONTHLY },
    { key: 'yearly', label: 'Yearly', value: RecurrenceFrequency.YEARLY },
];

export const RecurringRuleForm: React.FC<RecurringRuleFormProps> = ({
    existingRule,
    onSubmit,
    onCancel,
}) => {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const { wallets } = useWallets();
    const { categories } = useCategories();

    const isEdit = !!existingRule;

    // ─── State ────────────────────────────────────────────────────────
    const [type, setType] = useState<TransactionType>(existingRule?.type ?? TransactionType.EXPENSE);
    const [amount, setAmount] = useState(existingRule ? String(centsToMajor(existingRule.amount)) : '');
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

    // Filter categories by type and map to DropdownItem
    const filteredCategories = categories.filter(c => {
        if (type === TransactionType.EXPENSE) return c.type === 'expense';
        if (type === TransactionType.INCOME) return c.type === 'income';
        return true;
    });

    const walletItems: DropdownItem[] = wallets.map(w => ({ id: w.id, label: w.name }));
    const categoryItems: DropdownItem[] = filteredCategories.map(c => ({ id: c.id, label: c.name }));

    // ─── Handlers ─────────────────────────────────────────────────────

    const handleTypeChange = (newType: TransactionType) => {
        setType(newType);
        setCategoryId(''); // Reset category when type changes
    };

    const handleSubmit = async () => {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
            return;
        }
        const amountCents = normalizeAmount(parsedAmount);
        if (!walletId) {
            Alert.alert('Wallet Required', 'Please select a wallet.');
            return;
        }
        if (!categoryId) {
            Alert.alert('Category Required', 'Please select a category.');
            return;
        }
        const parsedInterval = parseInt(interval, 10);
        if (isNaN(parsedInterval) || parsedInterval < 1) {
            Alert.alert('Invalid Interval', 'Interval must be at least 1.');
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
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save rule');
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (d: Date) => d.toLocaleDateString();

    const frequencyLabel = () => {
        const intVal = parseInt(interval, 10) || 1;
        const freqSeg = FREQUENCY_SEGMENTS.find(f => f.value === frequency);
        const base = freqSeg?.label.toLowerCase().replace(/ly$/, '') ?? frequency;
        return intVal === 1 ? `Every ${base}` : `Every ${intVal} ${base}s`;
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
            // iOS: Show inline spinner with Done button to dismiss
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
                    >
                        <Text style={{ color: '#fff', fontSize: typography.sizes.sm, fontWeight: '600' }}>
                            Done
                        </Text>
                    </TouchableOpacity>
                </View>
            );
        }

        // Android: default dialog auto-dismisses on confirm/cancel
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
                <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
                    <Ionicons name="close" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.lg,
                    fontWeight: '600',
                }}>
                    {isEdit ? 'Edit Rule' : 'New Rule'}
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
                    Transaction Type
                </Text>
                <SegmentControl<TransactionType>
                    segments={TYPE_SEGMENTS}
                    selectedValue={type}
                    onSelect={handleTypeChange}
                />

                {/* Amount */}
                <View style={{ marginTop: spacing.md }}>
                    <InputField
                        label="Amount"
                        placeholder="0.00"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                    />
                </View>

                {/* Wallet */}
                <View style={{ marginTop: spacing.md }}>
                    <DropdownPicker
                        label="Wallet"
                        items={walletItems}
                        selectedId={walletId}
                        onSelect={setWalletId}
                    />
                </View>

                {/* Category */}
                <View style={{ marginTop: spacing.md }}>
                    <DropdownPicker
                        label="Category"
                        items={categoryItems}
                        selectedId={categoryId}
                        onSelect={setCategoryId}
                        placeholder="Select category"
                    />
                </View>

                {/* Description */}
                <View style={{ marginTop: spacing.md }}>
                    <InputField
                        label="Description (optional)"
                        placeholder="e.g. Netflix subscription"
                        value={description}
                        onChangeText={setDescription}
                    />
                </View>

                {/* Frequency */}
                <View style={{ marginTop: spacing.lg }}>
                    <Text style={[styles.label, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                        Frequency
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
                        label="Repeat every"
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
                            Start Date
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
                    >
                        <Ionicons
                            name={hasEndDate ? 'checkbox-outline' : 'square-outline'}
                            size={22}
                            color={colors.primary}
                        />
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, marginLeft: spacing.xs }}>
                            Set end date
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
                            >
                                <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                    {endDate ? formatDate(endDate) : 'Select end date'}
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
                        title={isEdit ? 'Update Rule' : 'Create Rule'}
                        onPress={handleSubmit}
                        loading={submitting}
                    />
                    <Button
                        title="Cancel"
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
