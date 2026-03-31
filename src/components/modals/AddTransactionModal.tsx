import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
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
import { useCategories } from '../../hooks/useCategories';
import { useFormatting } from '../../hooks/useFormatting';
import { useTransactions } from '../../hooks/useTransactions';
import { useWallets } from '../../hooks/useWallets';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
import { DropdownPicker, type DropdownItem } from '../ui/DropdownPicker';
import { IconBadge } from '../ui/IconBadge';
import { SegmentControl } from '../ui/SegmentControl';

interface AddTransactionModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ visible, onClose, onSuccess }) => {
    const { colors, spacing, typography, radius } = useTheme();
    const { t, i18n } = useTranslation();
    const { formatAmount } = useFormatting();
    const scrollViewRef = React.useRef<ScrollView>(null);

    // Hooks
    const { wallets, refreshWallets, transferBetweenWallets } = useWallets();
    const { categories, expenseCategories, incomeCategories } = useCategories();
    const { createTransaction } = useTransactions();

    // Form state
    const [amount, setAmount] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [notes, setNotes] = useState('');
    const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>('expense');
    const [selectedWalletId, setSelectedWalletId] = useState<string>('');
    const [destWalletId, setDestWalletId] = useState<string>('');
    const [saving, setSaving] = useState(false);

    // Auto-select first wallet
    useEffect(() => {
        if (visible && wallets.length > 0 && !selectedWalletId) {
            setSelectedWalletId(wallets[0].id);
        }
    }, [visible, wallets, selectedWalletId]);

    // Auto-select first category
    useEffect(() => {
        if (visible) {
            const list = transactionType === 'expense' ? expenseCategories : incomeCategories;
            if (list.length > 0 && !selectedCategoryId) {
                setSelectedCategoryId(list[0].id);
            }
        }
    }, [visible, transactionType, expenseCategories, incomeCategories, selectedCategoryId]);

    // Refresh wallets when modal becomes visible
    useEffect(() => {
        if (visible) {
            refreshWallets();
        }
    }, [visible, refreshWallets]);

    const selectedWallet = wallets.find(w => w.id === selectedWalletId);

    const categoryItems: DropdownItem[] = useMemo(() => {
        const list = transactionType === 'expense' ? expenseCategories : incomeCategories;
        return list.map(c => ({
            id: c.id,
            label: c.name,
            icon: (c.icon as string) || 'pricetag-outline',
            color: c.color,
        }));
    }, [transactionType, expenseCategories, incomeCategories]);

    const walletItems: DropdownItem[] = useMemo(() =>
        wallets.map(w => ({
            id: w.id,
            label: w.name,
            sublabel: formatAmount(w.balance),
            icon: 'wallet-outline',
            color: w.color,
        })),
        [wallets, formatAmount]);

    const destWalletItems: DropdownItem[] = useMemo(() =>
        wallets
            .filter(w => w.id !== selectedWalletId)
            .map(w => ({
                id: w.id,
                label: w.name,
                sublabel: formatAmount(w.balance),
                icon: 'wallet-outline',
                color: w.color,
            })),
        [wallets, selectedWalletId, formatAmount]);

    // ── Handlers ─────────────────────────────────────────────────────

    const handleDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            if (event.type === 'set' && selectedDate) {
                setDate(selectedDate);
            }
            if (event.type === 'set' || event.type === 'dismissed') {
                setShowDatePicker(false);
            }
        } else {
            if (selectedDate) {
                setDate(selectedDate);
            }
        }
    };

    const formatDateLabel = (d: Date) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return t('modals.addTransaction.today');
        if (d.toDateString() === yesterday.toDateString()) return t('modals.addTransaction.yesterday');
        return d.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const handleSave = async () => {
        const parsedAmount = parseFloat(amount);
        const amountNum = Math.round(parsedAmount * 100);

        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            Alert.alert(t('modals.addTransaction.invalidAmount'), t('modals.addTransaction.invalidAmountMessage'));
            return;
        }

        if (!selectedWalletId) {
            Alert.alert(t('modals.addTransaction.noWalletSelected'), t('modals.addTransaction.noWalletSelectedMessage'));
            return;
        }

        // Transfer mode
        if (transactionType === 'transfer') {
            if (!destWalletId) {
                Alert.alert(t('modals.addTransaction.noDestWallet'), t('modals.addTransaction.noDestWalletMessage'));
                return;
            }
            if (selectedWalletId === destWalletId) {
                Alert.alert(t('modals.addTransaction.invalidTransfer'), t('modals.addTransaction.invalidTransferMessage'));
                return;
            }
            if (selectedWallet && amountNum > selectedWallet.balance) {
                Alert.alert(t('modals.addTransaction.insufficientBalance'), t('modals.addTransaction.insufficientBalanceMessage', { amount: formatAmount(selectedWallet.balance) }));
                return;
            }

            try {
                setSaving(true);
                await transferBetweenWallets(selectedWalletId, destWalletId, amountNum);
                setAmount('');
                setNotes('');
                setDate(new Date());
                onSuccess?.();
                onClose();
            } catch (error) {
                Alert.alert(t('modals.addTransaction.error'), error instanceof Error ? error.message : t('modals.addTransaction.transferFailed'));
            } finally {
                setSaving(false);
            }
            return;
        }

        // Regular expense/income
        if (!selectedCategoryId) {
            Alert.alert(t('modals.addTransaction.noCategorySelected'), t('modals.addTransaction.noCategorySelectedMessage'));
            return;
        }

        try {
            setSaving(true);
            await createTransaction({
                type: transactionType === 'expense' ? TransactionType.EXPENSE : TransactionType.INCOME,
                amount: amountNum,
                categoryId: selectedCategoryId,
                walletId: selectedWalletId,
                date: date,
                note: notes || undefined,
            });
            setAmount('');
            setNotes('');
            setDate(new Date());
            onSuccess?.();
            onClose();
        } catch (error) {
            Alert.alert(t('modals.addTransaction.error'), error instanceof Error ? error.message : t('modals.addTransaction.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <TouchableOpacity style={styles.overlayTouchable} activeOpacity={1} onPress={onClose} />
                <View style={[styles.modalContainer, { backgroundColor: colors.card, height: MODAL_HEIGHT }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                            <Ionicons name="close" size={24} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                            {t('modals.addTransaction.title')}
                        </Text>
                        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                                <Text style={{ color: colors.accent, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>
                                    {t('modals.addTransaction.save')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <ScrollView
                            ref={scrollViewRef}
                            style={styles.scrollContent}
                            contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: spacing.tabBarOffset }]}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Transaction Type Segmented Control */}
                            <SegmentControl
                                segments={[
                                    { key: 'expense', label: t('modals.addTransaction.expense'), value: 'expense' as const },
                                    { key: 'income', label: t('modals.addTransaction.income'), value: 'income' as const },
                                    { key: 'transfer', label: t('modals.addTransaction.transfer'), value: 'transfer' as const },
                                ]}
                                selectedValue={transactionType}
                                onSelect={setTransactionType}
                                style={{ marginBottom: spacing.xl }}
                            />

                            {/* Amount */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    {t('modals.addTransaction.amount')}
                                </Text>
                                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    {/* <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, marginRight: spacing.sm }}>$</Text> */}
                                    <TextInput
                                        style={[styles.input, { color: colors.foreground }]}
                                        placeholder="0.00"
                                        placeholderTextColor={colors.mutedForeground}
                                        keyboardType="decimal-pad"
                                        value={amount}
                                        onChangeText={setAmount}
                                    />
                                </View>
                            </View>

                            {/* Category — only for expense/income */}
                            {transactionType !== 'transfer' && (
                                <DropdownPicker
                                    label={t('modals.addTransaction.category')}
                                    items={categoryItems}
                                    selectedId={selectedCategoryId}
                                    onSelect={setSelectedCategoryId}
                                    placeholder={t('modals.addTransaction.selectCategory')}
                                    triggerIcon={
                                        <IconBadge
                                            icon={
                                                <Ionicons
                                                    name={(categoryItems.find(c => c.id === selectedCategoryId)?.icon as keyof typeof Ionicons.glyphMap) || 'pricetag-outline'}
                                                    size={18}
                                                    color={categoryItems.find(c => c.id === selectedCategoryId)?.color || colors.primary}
                                                />
                                            }
                                            size="sm"
                                        />
                                    }
                                    emptyText={t('modals.addTransaction.noCategories')}
                                />
                            )}

                            {/* Wallet / From Wallet */}
                            <DropdownPicker
                                label={transactionType === 'transfer' ? t('modals.addTransaction.from') : t('modals.addTransaction.wallet')}
                                items={walletItems}
                                selectedId={selectedWalletId}
                                onSelect={setSelectedWalletId}
                                placeholder={t('modals.addTransaction.selectWallet')}
                                triggerIcon={
                                    <Ionicons
                                        name="wallet-outline"
                                        size={20}
                                        color={selectedWallet?.color || colors.primary}
                                    />
                                }
                                emptyText={t('modals.addTransaction.noWallets')}
                            />

                            {/* Transfer Arrow + Destination */}
                            {transactionType === 'transfer' && (
                                <>
                                    <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                                        <View style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 20,
                                            backgroundColor: colors.accent + '20',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>
                                            <Ionicons name="arrow-down" size={20} color={colors.accent} />
                                        </View>
                                    </View>

                                    <DropdownPicker
                                        label={t('modals.addTransaction.to')}
                                        items={destWalletItems}
                                        selectedId={destWalletId}
                                        onSelect={setDestWalletId}
                                        placeholder={t('modals.addTransaction.selectDestination')}
                                        triggerIcon={
                                            <Ionicons
                                                name="wallet-outline"
                                                size={20}
                                                color={destWalletItems.find(w => w.id === destWalletId)?.color || colors.primary}
                                            />
                                        }
                                        emptyText={t('modals.addTransaction.noOtherWallets')}
                                    />
                                </>
                            )}

                            {/* Date */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    {t('modals.addTransaction.date')}
                                </Text>
                                <TouchableOpacity
                                    style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                    onPress={() => setShowDatePicker(true)}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <Ionicons name="calendar-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
                                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>{formatDateLabel(date)}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                                </TouchableOpacity>
                                {showDatePicker && (
                                    Platform.OS === 'ios' ? (
                                        <>
                                            <Pressable
                                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
                                                onPress={() => setShowDatePicker(false)}
                                            />
                                            <View style={{ zIndex: 2 }}>
                                                <DateTimePicker value={date} mode="date" display="spinner" onChange={handleDateChange} />
                                            </View>
                                        </>
                                    ) : (
                                        <DateTimePicker value={date} mode="date" display="default" onChange={handleDateChange} />
                                    )
                                )}
                            </View>

                            {/* Notes */}
                            <View style={{ marginBottom: spacing.xl }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    {t('modals.addTransaction.notes')}
                                </Text>
                                <View style={[styles.textAreaContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <TextInput
                                        style={[styles.textArea, { color: colors.foreground }]}
                                        placeholder={t('modals.addTransaction.notesPlaceholder')}
                                        placeholderTextColor={colors.mutedForeground}
                                        multiline
                                        numberOfLines={4}
                                        value={notes}
                                        onChangeText={setNotes}
                                        onFocus={() => {
                                            setTimeout(() => {
                                                scrollViewRef.current?.scrollToEnd({ animated: true });
                                            }, 100);
                                        }}
                                    />
                                </View>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </View>
        </Modal>
    );
};

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
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 14,
    },
    input: {
        flex: 1,
        fontSize: typography.sizes.md,
    },
    textAreaContainer: {
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
    },
    textArea: {
        fontSize: typography.sizes.md,
        minHeight: 80,
        textAlignVertical: 'top',
    },
});
