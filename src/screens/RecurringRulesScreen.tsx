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
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecurringRuleForm } from '../components/recurring/RecurringRuleForm';
import { container } from '../core/di/container';
import { dataEvents } from '../core/events/dataEvents';
import { processRecurringRules } from '../data/services/RecurringTransactionEngine';
import { RecurrenceFrequency, type CreateRecurringTransactionDTO, type RecurringTransaction, type UpdateRecurringTransactionDTO } from '../domain/entities/RecurringTransaction';
import { useFormatting } from '../hooks/useFormatting';
import { useRecurringRules } from '../hooks/useRecurringRules';
import { useTheme } from '../theme/theme';

// ─── Helpers ──────────────────────────────────────────────────────────
const FREQ_BASE: Record<RecurrenceFrequency, string> = {
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    yearly: 'year',
};

function frequencyLabel(freq: RecurrenceFrequency, interval: number): string {
    const base = FREQ_BASE[freq]; // freq.replace(/ly$/, '');
    return interval === 1 ? `Every ${base}` : `Every ${interval} ${base}s`;
}

// ─── Rule Card ────────────────────────────────────────────────────────

const RuleCard: React.FC<{
    rule: RecurringTransaction;
    onEdit: (rule: RecurringTransaction) => void;
    onTogglePause: (rule: RecurringTransaction) => void;
    onDelete: (rule: RecurringTransaction) => void;
}> = ({ rule, onEdit, onTogglePause, onDelete }) => {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const { formatAmount } = useFormatting();

    const statusColor = rule.isPaused ? colors.mutedForeground : colors.primary;
    const statusLabel = rule.isPaused ? 'Paused' : 'Active';
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
                        {rule.description || 'Recurring Transaction'}
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
                    {frequencyLabel(rule.frequency, rule.interval)}
                </Text>
            </View>

            {/* Action Bar */}
            <View style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                marginTop: spacing.md,
                gap: spacing.md,
            }}>
                <Pressable onPress={() => onEdit(rule)} hitSlop={8}>
                    <Ionicons name="pencil-outline" size={20} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => onTogglePause(rule)} hitSlop={8}>
                    <Ionicons
                        name={rule.isPaused ? 'play-outline' : 'pause-outline'}
                        size={20}
                        color={colors.primary}
                    />
                </Pressable>
                <Pressable onPress={() => onDelete(rule)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={colors.destructive ?? '#ef4444'} />
                </Pressable>
            </View>
        </View>
    );
};

// ─── Screen ───────────────────────────────────────────────────────────

export const RecurringRulesScreen: React.FC = () => {
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
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update rule');
        }
    }, [pauseRule, resumeRule]);

    const handleDelete = useCallback((rule: RecurringTransaction) => {
        Alert.alert(
            'Delete Rule',
            'Are you sure you want to delete this recurring rule? Past transactions will not be affected.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteRule(rule.id);
                        } catch (error) {
                            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete rule');
                        }
                    },
                },
            ],
        );
    }, [deleteRule]);

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
                });
                // Refresh transaction list
                dataEvents.emit('transactions');
                dataEvents.emit('wallets');

                if (result.skipped && result.skipped.length > 0) {
                    // Insufficient funds — inform user clearly
                    Alert.alert(
                        'Rule Created — Insufficient Funds',
                        'Recurring rule created successfully, but transactions were skipped because your wallet does not have enough funds. They will be generated automatically once funds are available.',
                    );
                } else if (result.transactionsGenerated > 0) {
                    Alert.alert(
                        'Rule Created',
                        `Recurring rule created successfully.\n${result.transactionsGenerated} transaction(s) generated.`,
                    );
                } else {
                    Alert.alert('Rule Created', 'Recurring rule created successfully. Transactions will be generated on the next due date.');
                }
            } catch {
                Alert.alert('Rule Created', 'Recurring rule created. Transactions will generate on next app launch.');
            }
        } else {
            Alert.alert('Rule Updated', 'Recurring rule updated successfully.');
        }
    }, [createRule, updateRule]);

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
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl * 3 }}>
            <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.lg,
            }}>
                <Ionicons name="repeat-outline" size={40} color={colors.primary} />
            </View>
            <Text style={{
                color: colors.foreground,
                fontSize: typography.sizes.lg,
                fontWeight: '600',
                marginBottom: spacing.xs,
            }}>
                No recurring transactions yet
            </Text>
            <Text style={{
                color: colors.mutedForeground,
                fontSize: typography.sizes.sm,
                textAlign: 'center',
                marginBottom: spacing.lg,
                paddingHorizontal: spacing.xl,
            }}>
                Automate your income and expenses
            </Text>
            <TouchableOpacity
                onPress={handleCreate}
                style={{
                    backgroundColor: colors.primary,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.xl,
                    paddingVertical: spacing.sm + 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    ...shadows.soft,
                }}
            >
                <Ionicons name="add-circle-outline" size={20} color="#fff" style={{ marginRight: spacing.xs }} />
                <Text style={{ color: '#fff', fontSize: typography.sizes.md, fontWeight: '600' }}>
                    Create Rule
                </Text>
            </TouchableOpacity>
        </View>
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
                    <TouchableOpacity onPress={() => router.back()} style={{ marginRight: spacing.md }}>
                        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{
                        color: colors.foreground,
                        fontSize: typography.sizes.xl,
                        fontWeight: typography.weights.bold,
                    }}>
                        Recurring Transactions
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
