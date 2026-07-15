/**
 * RecurringRulesScreen
 *
 * Displays all recurring transaction rules with create, edit,
 * pause/resume, and delete actions.
 *
 * UX follows CategoriesScreen/AboutScreen patterns:
 * - Card-style header with arrow-back + router.back()
 * - FAB for add (matching CategoriesScreen)
 * - Proper empty state with CTA
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { RecurringRuleForm } from '../components/recurring/RecurringRuleForm';
import { container, getUseCaseDeps } from '../core/di/container';
import { dataEvents } from '../core/events/dataEvents';
import { processRecurringRules } from '../data/services/RecurringTransactionEngine';
import { RecurrenceFrequency, type CreateRecurringTransactionDTO, type RecurringTransaction, type UpdateRecurringTransactionDTO } from '../domain/entities/RecurringTransaction';
import { useFormatting } from '../hooks/useFormatting';
import { useRecurringRules } from '../hooks/useRecurringRules';
import { useTheme } from '../theme/theme';
import { getButtonA11y } from '../utils/accessibility';

// ─── Helpers ──────────────────────────────────────────────────────────
const FREQ_KEYS: Record<RecurrenceFrequency, string> = {
    daily: 'recurring.freqDay',
    weekly: 'recurring.freqWeek',
    monthly: 'recurring.freqMonth',
    yearly: 'recurring.freqYear',
};

// ─── Rule Card ────────────────────────────────────────────────────────

const RuleCard: React.FC<{
    rule: RecurringTransaction;
    onEdit: (rule: RecurringTransaction) => void;
    onTogglePause: (rule: RecurringTransaction) => void;
    onDelete: (rule: RecurringTransaction) => void;
}> = ({ rule, onEdit, onTogglePause, onDelete }) => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const { formatAmount } = useFormatting();

    const statusColor = rule.isPaused ? colors.mutedForeground : colors.primary;
    const statusLabel = rule.isPaused ? t('recurring.statusPaused') : t('recurring.statusActive');
    const typeIcon = rule.type === 'income' ? 'trending-up' : 'trending-down';
    const typeColor = rule.type === 'income' ? (colors.success ?? '#22c55e') : (colors.destructive ?? '#ef4444');

    return (
        <View style={{
            backgroundColor: colors.card,
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.sm,
            ...shadows.card,
        }}>
            {/* Header Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name={typeIcon as any} size={20} color={typeColor} />
                    <Text
                        style={{
                            color: colors.foreground,
                            fontSize: typography.sizes.md,
                            fontWeight: '600',
                            marginLeft: spacing.xs,
                            flex: 1,
                        }}
                        numberOfLines={1}
                    >
                        {rule.description || t('recurring.defaultDescription')}
                    </Text>
                </View>
                <View style={{
                    backgroundColor: rule.isPaused ? colors.muted : colors.accent,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: radius.sm,
                }}>
                    <Text style={{ color: statusColor, fontSize: typography.sizes.xs, fontWeight: '600' }}>
                        {statusLabel}
                    </Text>
                </View>
            </View>

            {/* Details */}
            <View style={{ marginTop: spacing.sm }}>
                <Text style={{ color: typeColor, fontSize: typography.sizes.lg, fontWeight: '700' }}>
                    {rule.type === 'income' ? '+' : '-'}{formatAmount(rule.amount)}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginTop: 2 }}>
                    {rule.interval === 1
                        ? t('recurring.frequencyEvery', { base: t(FREQ_KEYS[rule.frequency]) })
                        : t('recurring.frequencyEveryN', { interval: rule.interval, base: t(FREQ_KEYS[rule.frequency]) })}
                </Text>
            </View>

            {/* Action Bar */}
            <View style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                marginTop: spacing.md,
                gap: spacing.md,
            }}>
                <Pressable onPress={() => onEdit(rule)} hitSlop={8} {...getButtonA11y(t('a11y.editRule'))}>
                    <Ionicons name="pencil-outline" size={20} color={colors.primary} />
                </Pressable>
                <Pressable
                    onPress={() => onTogglePause(rule)}
                    hitSlop={8}
                    {...getButtonA11y(rule.isPaused ? t('a11y.resumeRule') : t('a11y.pauseRule'))}
                >
                    <Ionicons
                        name={rule.isPaused ? 'play-outline' : 'pause-outline'}
                        size={20}
                        color={colors.primary}
                    />
                </Pressable>
                <Pressable onPress={() => onDelete(rule)} hitSlop={8} {...getButtonA11y(t('a11y.deleteRule'))}>
                    <Ionicons name="trash-outline" size={20} color={colors.destructive ?? '#ef4444'} />
                </Pressable>
            </View>
        </View>
    );
};

// ─── Screen ───────────────────────────────────────────────────────────

export const RecurringRulesScreen: React.FC = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { rules, loading, createRule, updateRule, deleteRule, pauseRule, resumeRule } = useRecurringRules();
    const [formVisible, setFormVisible] = useState(false);
    const [editingRule, setEditingRule] = useState<RecurringTransaction | undefined>();

    const handleCreate = useCallback(() => {
        setEditingRule(undefined);
        setFormVisible(true);
    }, []);

    const handleEdit = useCallback((rule: RecurringTransaction) => {
        setEditingRule(rule);
        setFormVisible(true);
    }, []);

    const handleTogglePause = useCallback(async (rule: RecurringTransaction) => {
        try {
            if (rule.isPaused) {
                await resumeRule(rule.id);
            } else {
                await pauseRule(rule.id);
            }
        } catch (error) {
            Alert.alert(t('common.error'), error instanceof Error ? error.message : t('recurring.saveFailed'));
        }
    }, [pauseRule, resumeRule, t]);

    const handleDelete = useCallback((rule: RecurringTransaction) => {
        Alert.alert(
            t('recurring.deleteRuleTitle'),
            t('recurring.deleteRuleMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteRule(rule.id);
                        } catch (error) {
                            Alert.alert(t('common.error'), error instanceof Error ? error.message : t('recurring.saveFailed'));
                        }
                    },
                },
            ],
        );
    }, [deleteRule, t]);

    const handleFormSubmit = useCallback(async (dto: CreateRecurringTransactionDTO | UpdateRecurringTransactionDTO) => {
        const isCreate = 'startDate' in dto;
        if (isCreate) {
            await createRule(dto);
        } else {
            await updateRule(dto);
        }
        setFormVisible(false);

        if (isCreate) {
            // Run engine immediately to generate transactions for the new rule
            try {
                const result = await processRecurringRules({
                    recurringRepo: container.recurringTransactionRepository,
                    transactionRepo: container.transactionRepository,
                    walletRepo: container.walletRepository,
                    eventBus: dataEvents,
                    runInTransaction: getUseCaseDeps().runInTransaction,
                });
                // Refresh transaction list
                dataEvents.emit('transactions');
                dataEvents.emit('wallets');

                if (result.skipped && result.skipped.length > 0) {
                    Alert.alert(
                        t('recurring.ruleCreatedInsufficientTitle'),
                        t('recurring.ruleCreatedInsufficientMessage'),
                    );
                } else if (result.transactionsGenerated > 0) {
                    Alert.alert(
                        t('recurring.ruleCreated'),
                        t('recurring.ruleCreatedMessage', { count: result.transactionsGenerated }),
                    );
                } else {
                    Alert.alert(t('recurring.ruleCreated'), t('recurring.ruleCreatedNoTransactions'));
                }
            } catch {
                Alert.alert(t('recurring.ruleCreated'), t('recurring.ruleCreatedLaunch'));
            }
        } else {
            Alert.alert(t('recurring.ruleUpdated'), t('recurring.ruleUpdatedMessage'));
        }
    }, [createRule, updateRule, t]);

    const renderItem = useCallback(
        ({ item }: { item: RecurringTransaction }) => (
            <RuleCard
                rule={item}
                onEdit={handleEdit}
                onTogglePause={handleTogglePause}
                onDelete={handleDelete}
            />
        ),
        [handleEdit, handleTogglePause, handleDelete],
    );

    const renderEmpty = () => (
        <EmptyState
            icon="repeat-outline"
            title={t('recurring.emptyTitle')}
            description={t('recurring.emptyDescription')}
            actionLabel={t('recurring.createRule')}
            onAction={handleCreate}
        />
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header — matches CategoriesScreen pattern */}
            <View style={{
                paddingTop: insets.top,
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.md,
                backgroundColor: colors.card,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={{ marginRight: spacing.md }}
                        {...getButtonA11y(t('a11y.backButton'))}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{
                        color: colors.foreground,
                        fontSize: typography.sizes.xl,
                        fontWeight: typography.weights.bold,
                    }}>
                        {t('recurring.title')}
                    </Text>
                </View>
            </View>

            {/* List */}
            <FlatList
                data={rules}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{
                    paddingHorizontal: spacing.lg,
                    paddingTop: spacing.md,
                    paddingBottom: insets.bottom + spacing.xl,
                }}
                ListEmptyComponent={loading ? null : renderEmpty}
            />

            {/* FAB — matches CategoriesScreen pattern */}
            {rules.length > 0 && (
                <TouchableOpacity
                    style={{
                        position: 'absolute',
                        bottom: insets.bottom + spacing.lg,
                        right: spacing.lg,
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: colors.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...shadows.elevated,
                    }}
                    onPress={handleCreate}
                    {...getButtonA11y(t('a11y.addRecurringRule'))}
                >
                    <Ionicons name="add" size={30} color={colors.accentForeground} />
                </TouchableOpacity>
            )}

            {/* Form Modal */}
            <Modal
                visible={formVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setFormVisible(false)}
            >
                <RecurringRuleForm
                    existingRule={editingRule}
                    onSubmit={handleFormSubmit}
                    onCancel={() => setFormVisible(false)}
                />
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
