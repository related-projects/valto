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
import { useTransactions } from '../../hooks/useTransactions';
import { useWallets } from '../../hooks/useWallets';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
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
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showWalletPicker, setShowWalletPicker] = useState(false);
    const [notes, setNotes] = useState('');
    const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>('expense');
    const [selectedWalletId, setSelectedWalletId] = useState<string>('');
    const [saving, setSaving] = useState(false);

    // Transfer-specific state
    const [destWalletId, setDestWalletId] = useState<string>('');
    const [showDestWalletPicker, setShowDestWalletPicker] = useState(false);

    // Refresh wallets when modal becomes visible
    useEffect(() => {
        if (visible) {
            refreshWallets();
        }
    }, [visible, refreshWallets]);

    // Initialize default selections when data loads
    useEffect(() => {
        if (wallets.length > 0 && !selectedWalletId) {
            setSelectedWalletId(wallets[0].id);
        }
        // Set default destination wallet for transfers
        if (wallets.length > 1 && !destWalletId) {
            setDestWalletId(wallets[1].id);
        }
    }, [wallets, selectedWalletId, destWalletId]);

    useEffect(() => {
        const defaultCategories = transactionType === 'expense' ? expenseCategories : incomeCategories;
        if (defaultCategories.length > 0 && !selectedCategoryId) {
            setSelectedCategoryId(defaultCategories[0].id);
        }
    }, [transactionType, expenseCategories, incomeCategories, selectedCategoryId]);

    // Get selected wallet and category for display
    const selectedWallet = wallets.find(w => w.id === selectedWalletId);
    const selectedCategory = categories.find(c => c.id === selectedCategoryId);
    const destWallet = wallets.find(w => w.id === destWalletId);
    const availableDestWallets = wallets.filter(w => w.id !== selectedWalletId);

    const handleDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            if (event.type === 'set' && selectedDate) {
                setDate(selectedDate);
            }
            // Dismiss on both 'set' and 'dismissed' for Android
            if (event.type === 'set' || event.type === 'dismissed') {
                setShowDatePicker(false);
            }
        } else {
            // iOS spinner: continuous updates, never dismiss here
            // Picker closes via overlay tap or existing close controls
            if (selectedDate) {
                setDate(selectedDate);
            }
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

        // Transfer mode validation and handling
        if (transactionType === 'transfer') {
            if (!destWalletId) {
                Alert.alert('No Destination Wallet', 'Please select a destination wallet');
                return;
            }

            if (selectedWalletId === destWalletId) {
                Alert.alert('Invalid Transfer', 'Source and destination wallets must be different');
                return;
            }

            if (selectedWallet && amountNum > selectedWallet.balance) {
                Alert.alert('Insufficient Balance', `Source wallet only has $${selectedWallet.balance.toLocaleString()}`);
                return;
            }

            try {
                setSaving(true);
                await transferBetweenWallets(selectedWalletId, destWalletId, amountNum);

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
                    error instanceof Error ? error.message : 'Failed to complete transfer'
                );
            } finally {
                setSaving(false);
            }
            return;
        }

        // Regular expense/income transaction
        if (!selectedCategoryId) {
            Alert.alert('No Category Selected', 'Please select a category');
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
                            <SegmentControl
                                segments={[
                                    { key: 'expense', label: 'Expense', value: 'expense' as const },
                                    { key: 'income', label: 'Income', value: 'income' as const },
                                    { key: 'transfer', label: 'Transfer', value: 'transfer' as const },
                                ]}
                                selectedValue={transactionType}
                                onSelect={setTransactionType}
                                style={{ marginBottom: spacing.xl }}
                            />
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

                            {/* Category - only shown for expense/income, not transfer */}
                            {transactionType !== 'transfer' && (
                                <View style={{ marginBottom: spacing.lg }}>
                                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                        Category
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                        onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                            <IconBadge
                                                icon={<Ionicons name={(selectedCategory?.icon as keyof typeof Ionicons.glyphMap) || 'pricetag-outline'} size={18} color={selectedCategory?.color || colors.primary} />}
                                                size="sm"
                                            />
                                            <View style={{ marginLeft: spacing.sm }}>
                                                <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                    {selectedCategory?.name || 'Select category'}
                                                </Text>
                                            </View>
                                        </View>
                                        <Ionicons name={showCategoryPicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
                                    </TouchableOpacity>
                                    {showCategoryPicker && (
                                        <View style={{
                                            backgroundColor: colors.card,
                                            borderRadius: radius.md,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            marginTop: spacing.xs,
                                            maxHeight: 200,
                                        }}>
                                            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                                {(transactionType === 'expense' ? expenseCategories : incomeCategories).length === 0 ? (
                                                    <View style={{ padding: spacing.md, alignItems: 'center' }}>
                                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                                                            No categories available
                                                        </Text>
                                                    </View>
                                                ) : (
                                                    (transactionType === 'expense' ? expenseCategories : incomeCategories).map((category) => (
                                                        <TouchableOpacity
                                                            key={category.id}
                                                            style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                padding: spacing.md,
                                                                borderBottomWidth: 1,
                                                                borderBottomColor: colors.border,
                                                                backgroundColor: selectedCategoryId === category.id ? colors.muted : 'transparent',
                                                            }}
                                                            onPress={() => {
                                                                setSelectedCategoryId(category.id);
                                                                setShowCategoryPicker(false);
                                                            }}
                                                        >
                                                            <Ionicons
                                                                name={(category.icon as keyof typeof Ionicons.glyphMap) || 'pricetag-outline'}
                                                                size={20}
                                                                color={category.color || colors.primary}
                                                                style={{ marginRight: spacing.sm }}
                                                            />
                                                            <Text style={{ flex: 1, color: colors.foreground, fontSize: typography.sizes.md }}>
                                                                {category.name}
                                                            </Text>
                                                            {selectedCategoryId === category.id && (
                                                                <Ionicons name="checkmark" size={20} color={colors.accent} />
                                                            )}
                                                        </TouchableOpacity>
                                                    ))
                                                )}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Wallet Selector / From Wallet (for transfers) */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    {transactionType === 'transfer' ? 'From' : 'Wallet'}
                                </Text>
                                <TouchableOpacity
                                    style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                    onPress={() => setShowWalletPicker(!showWalletPicker)}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <Ionicons name="wallet-outline" size={20} color={selectedWallet?.color || colors.primary} style={{ marginRight: spacing.sm }} />
                                        <View>
                                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                {selectedWallet?.name || 'Select wallet'}
                                            </Text>
                                            {transactionType === 'transfer' && selectedWallet && (
                                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                                    Balance: ${selectedWallet.balance.toLocaleString()}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <Ionicons name={showWalletPicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
                                </TouchableOpacity>
                                {showWalletPicker && (
                                    <View style={{
                                        backgroundColor: colors.card,
                                        borderRadius: radius.md,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                        marginTop: spacing.xs,
                                        maxHeight: 200,
                                    }}>
                                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                            {wallets.length === 0 ? (
                                                <View style={{ padding: spacing.md, alignItems: 'center' }}>
                                                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                                                        No wallets available
                                                    </Text>
                                                </View>
                                            ) : (
                                                wallets.map((wallet) => (
                                                    <TouchableOpacity
                                                        key={wallet.id}
                                                        style={{
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            padding: spacing.md,
                                                            borderBottomWidth: 1,
                                                            borderBottomColor: colors.border,
                                                            backgroundColor: selectedWalletId === wallet.id ? colors.muted : 'transparent',
                                                        }}
                                                        onPress={() => {
                                                            setSelectedWalletId(wallet.id);
                                                            setShowWalletPicker(false);
                                                        }}
                                                    >
                                                        <Ionicons
                                                            name="wallet-outline"
                                                            size={20}
                                                            color={wallet.color || colors.primary}
                                                            style={{ marginRight: spacing.sm }}
                                                        />
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                                {wallet.name}
                                                            </Text>
                                                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                                                ${wallet.balance.toLocaleString()}
                                                            </Text>
                                                        </View>
                                                        {selectedWalletId === wallet.id && (
                                                            <Ionicons name="checkmark" size={20} color={colors.accent} />
                                                        )}
                                                    </TouchableOpacity>
                                                ))
                                            )}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>

                            {/* To Wallet - only shown for transfers */}
                            {transactionType === 'transfer' && (
                                <>
                                    {/* Transfer Arrow */}
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

                                    <View style={{ marginBottom: spacing.lg }}>
                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                            To
                                        </Text>
                                        <TouchableOpacity
                                            style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                            onPress={() => setShowDestWalletPicker(!showDestWalletPicker)}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                <Ionicons name="wallet-outline" size={20} color={destWallet?.color || colors.primary} style={{ marginRight: spacing.sm }} />
                                                <View>
                                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                        {destWallet?.name || 'Select destination'}
                                                    </Text>
                                                    {destWallet && (
                                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                                            Balance: ${destWallet.balance.toLocaleString()}
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                            <Ionicons name={showDestWalletPicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
                                        </TouchableOpacity>
                                        {showDestWalletPicker && (
                                            <View style={{
                                                backgroundColor: colors.card,
                                                borderRadius: radius.md,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginTop: spacing.xs,
                                                maxHeight: 200,
                                            }}>
                                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                                    {availableDestWallets.length === 0 ? (
                                                        <View style={{ padding: spacing.md, alignItems: 'center' }}>
                                                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                                                                No other wallets available
                                                            </Text>
                                                        </View>
                                                    ) : (
                                                        availableDestWallets.map((wallet) => (
                                                            <TouchableOpacity
                                                                key={wallet.id}
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    padding: spacing.md,
                                                                    borderBottomWidth: 1,
                                                                    borderBottomColor: colors.border,
                                                                    backgroundColor: destWalletId === wallet.id ? colors.muted : 'transparent',
                                                                }}
                                                                onPress={() => {
                                                                    setDestWalletId(wallet.id);
                                                                    setShowDestWalletPicker(false);
                                                                }}
                                                            >
                                                                <Ionicons
                                                                    name="wallet-outline"
                                                                    size={20}
                                                                    color={wallet.color || colors.primary}
                                                                    style={{ marginRight: spacing.sm }}
                                                                />
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                                        {wallet.name}
                                                                    </Text>
                                                                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                                                        ${wallet.balance.toLocaleString()}
                                                                    </Text>
                                                                </View>
                                                                {destWalletId === wallet.id && (
                                                                    <Ionicons name="checkmark" size={20} color={colors.accent} />
                                                                )}
                                                            </TouchableOpacity>
                                                        ))
                                                    )}
                                                </ScrollView>
                                            </View>
                                        )}
                                    </View>
                                </>
                            )}

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
                                    Platform.OS === 'ios' ? (
                                        <>
                                            <Pressable
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    right: 0,
                                                    bottom: 0,
                                                    zIndex: 1,
                                                }}
                                                onPress={() => setShowDatePicker(false)}
                                            />
                                            <View style={{ zIndex: 2 }}>
                                                <DateTimePicker
                                                    value={date}
                                                    mode="date"
                                                    display="spinner"
                                                    onChange={handleDateChange}
                                                />
                                            </View>
                                        </>
                                    ) : (
                                        <DateTimePicker
                                            value={date}
                                            mode="date"
                                            display="default"
                                            onChange={handleDateChange}
                                        />
                                    )
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
