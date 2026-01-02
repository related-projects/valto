import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { TransactionType } from '../../domain/entities';
import { useCategories } from '../../hooks/useCategories';
import { useTransactions } from '../../hooks/useTransactions';
import { useWallets } from '../../hooks/useWallets';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
import { IconBadge } from '../ui/IconBadge';

interface AddTransactionModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ visible, onClose, onSuccess }) => {
    const { colors, spacing, typography, radius } = useTheme();
    const scrollViewRef = React.useRef<ScrollView>(null);

    // Hooks
    const { wallets } = useWallets();
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
    const [saving, setSaving] = useState(false);

    // Initialize default selections when data loads
    useEffect(() => {
        if (wallets.length > 0 && !selectedWalletId) {
            setSelectedWalletId(wallets[0].id);
        }
    }, [wallets, selectedWalletId]);

    useEffect(() => {
        const defaultCategories = transactionType === 'expense' ? expenseCategories : incomeCategories;
        if (defaultCategories.length > 0 && !selectedCategoryId) {
            setSelectedCategoryId(defaultCategories[0].id);
        }
    }, [transactionType, expenseCategories, incomeCategories, selectedCategoryId]);

    // Get selected wallet and category for display
    const selectedWallet = wallets.find(w => w.id === selectedWalletId);
    const selectedCategory = categories.find(c => c.id === selectedCategoryId);

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            setDate(selectedDate);
        }
    };

    const formatDate = (date: Date) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const handleSave = async () => {
        // Validation
        const amountNum = parseFloat(amount);

        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0');
            return;
        }

        if (!selectedWalletId) {
            Alert.alert('No Wallet Selected', 'Please select a wallet');
            return;
        }

        if (!selectedCategoryId) {
            Alert.alert('No Category Selected', 'Please select a category');
            return;
        }

        if (transactionType === 'transfer') {
            Alert.alert('Not Supported', 'Transfer functionality is not yet implemented');
            return;
        }

        try {
            setSaving(true);

            // Create transaction
            await createTransaction({
                type: transactionType === 'expense' ? TransactionType.EXPENSE : TransactionType.INCOME,
                amount: amountNum,
                categoryId: selectedCategoryId,
                walletId: selectedWalletId,
                date: date,
                note: notes || undefined,
            });

            // Reset form
            setAmount('');
            setNotes('');
            setDate(new Date());

            // Call success callback
            onSuccess?.();

            // Close modal
            onClose();
        } catch (error) {
            Alert.alert(
                'Error',
                error instanceof Error ? error.message : 'Failed to save transaction'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <TouchableOpacity
                    style={styles.overlayTouchable}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <View style={[styles.modalContainer, { backgroundColor: colors.card, height: MODAL_HEIGHT }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                            <Ionicons name="close" size={24} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                            Add Transaction
                        </Text>
                        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                                <Text style={{ color: colors.accent, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>
                                    Save
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} // Adjust if needed
                    >

                        <ScrollView
                            ref={scrollViewRef}
                            style={styles.scrollContent}
                            contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: spacing.tabBarOffset }]}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Transaction Type Segmented Control */}
                            <View style={[styles.segmentContainer, { backgroundColor: colors.background, marginBottom: spacing.xl }]}>
                                {(['expense', 'income', 'transfer'] as const).map((type) => {
                                    const isActive = transactionType === type;
                                    return (
                                        <TouchableOpacity
                                            key={type}
                                            style={[
                                                styles.segmentButton,
                                                isActive && { backgroundColor: colors.card, ...styles.activeSegmentShadow }
                                            ]}
                                            onPress={() => setTransactionType(type)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={{
                                                color: isActive ? colors.foreground : colors.mutedForeground,
                                                fontSize: typography.sizes.sm,
                                                fontWeight: isActive ? '600' : '500',
                                                textTransform: 'capitalize'
                                            }}>
                                                {type}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            {/* Amount */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Amount
                                </Text>
                                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, marginRight: spacing.sm }}>$</Text>
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

                            {/* Category */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Category
                                </Text>
                                <TouchableOpacity
                                    style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                    onPress={() => {
                                        // Cycle through categories for now (simple implementation)
                                        const availableCategories = transactionType === 'expense' ? expenseCategories : incomeCategories;
                                        const currentIndex = availableCategories.findIndex(c => c.id === selectedCategoryId);
                                        const nextIndex = (currentIndex + 1) % availableCategories.length;
                                        setSelectedCategoryId(availableCategories[nextIndex].id);
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <IconBadge
                                            icon={<Ionicons name="restaurant-outline" size={18} color={colors.primary} />}
                                            size="sm"
                                        />
                                        <View style={{ marginLeft: spacing.sm }}>
                                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                {selectedCategory?.name || 'Select category'}
                                            </Text>
                                        </View>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                                </TouchableOpacity>
                            </View>

                            {/* Wallet Selector */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Wallet
                                </Text>
                                <TouchableOpacity
                                    style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                    onPress={() => {
                                        // Cycle through wallets (simple implementation)
                                        const currentIndex = wallets.findIndex(w => w.id === selectedWalletId);
                                        const nextIndex = (currentIndex + 1) % wallets.length;
                                        setSelectedWalletId(wallets[nextIndex].id);
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <Ionicons name="wallet-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
                                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                            {selectedWallet?.name || 'Select wallet'}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                                </TouchableOpacity>
                            </View>

                            {/* Date */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Date
                                </Text>
                                <TouchableOpacity
                                    style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                    onPress={() => setShowDatePicker(true)}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <Ionicons name="calendar-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
                                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>{formatDate(date)}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                                </TouchableOpacity>
                                {showDatePicker && (
                                    <DateTimePicker
                                        value={date}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'} // Or 'inline' for iOS 14+ style if preferred, usually spinner inside modal or just default
                                        onChange={handleDateChange}
                                    />
                                )}
                            </View>

                            {/* Notes */}
                            <View style={{ marginBottom: spacing.xl }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Notes (Optional)
                                </Text>
                                <View style={[styles.textAreaContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <TextInput
                                        style={[styles.textArea, { color: colors.foreground }]}
                                        placeholder="Add a note..."
                                        placeholderTextColor={colors.mutedForeground}
                                        multiline
                                        numberOfLines={4}
                                        value={notes}
                                        onChangeText={setNotes}
                                        onFocus={() => {
                                            // Delay slightly to allow keyboard to show
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
    segmentContainer: {
        flexDirection: 'row',
        padding: spacing.xs,
        borderRadius: radius.lg,
        height: 44,
    },
    segmentButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md, // Changed to closest token (12)
    },
    activeSegmentShadow: {
        ...shadows.soft,
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
