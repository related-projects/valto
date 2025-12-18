import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
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
import { mockWallets } from '../../data/mockData';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
import { IconBadge } from '../ui/IconBadge';

interface AddTransactionModalProps {
    visible: boolean;
    onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ visible, onClose }) => {
    const { colors, spacing, typography, radius } = useTheme();
    const scrollViewRef = React.useRef<ScrollView>(null);
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Food & Dining');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [notes, setNotes] = useState('');
    const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>('expense');
    const [selectedWallet, setSelectedWallet] = useState(mockWallets[0]?.name || 'Cash');

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

    const handleSave = () => {
        // Handle save logic here
        onClose();
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
                        <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
                            <Text style={{ color: colors.accent, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>
                                Save
                            </Text>
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
                                <TouchableOpacity style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <IconBadge
                                            icon={<Ionicons name="restaurant-outline" size={18} color={colors.primary} />}
                                            size="sm"
                                        />
                                        <View style={{ marginLeft: spacing.sm }}>
                                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>{category}</Text>
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
                                        // Basic alert for wallet selection stub
                                        // In a real app, this would open a modal/bottom sheet
                                        const nextWallet = mockWallets.find(w => w.name !== selectedWallet) || mockWallets[0];
                                        if (nextWallet) setSelectedWallet(nextWallet.name);
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                        <Ionicons name="wallet-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
                                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>{selectedWallet}</Text>
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
