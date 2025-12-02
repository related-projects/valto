import { Ionicons } from '@expo/vector-icons';
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
import { useTheme } from '../../theme/theme';

interface AddTransactionModalProps {
    visible: boolean;
    onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ visible, onClose }) => {
    const { colors, spacing, typography } = useTheme();
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Food & Dining');
    const [date, setDate] = useState('Today');
    const [notes, setNotes] = useState('');

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
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.overlay}
            >
                <TouchableOpacity
                    style={styles.overlayTouchable}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <View style={[styles.modalContainer, { backgroundColor: colors.card, height: MODAL_HEIGHT }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={28} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '700' }}>
                            Add Transaction
                        </Text>
                        <View style={{ width: 28 }} />
                    </View>

                    <ScrollView
                        style={styles.scrollContent}
                        contentContainerStyle={styles.scrollContentContainer}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Amount */}
                        <View style={{ marginBottom: spacing.lg }}>
                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                Amount
                            </Text>
                            <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                <Text style={{ color: colors.foreground, fontSize: 18, marginRight: 8 }}>$</Text>
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
                                    <View style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 16,
                                        backgroundColor: 'rgba(139, 92, 72, 0.085)',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: spacing.sm,
                                    }}>
                                        <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
                                    </View>
                                    <Text style={{ color: colors.foreground, fontSize: 16 }}>{category}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                            </TouchableOpacity>
                        </View>

                        {/* Date */}
                        <View style={{ marginBottom: spacing.lg }}>
                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                Date
                            </Text>
                            <TouchableOpacity style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <Ionicons name="calendar-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
                                    <Text style={{ color: colors.foreground, fontSize: 16 }}>{date}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                            </TouchableOpacity>
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
                                />
                            </View>
                        </View>
                    </ScrollView>

                    {/* Action Buttons */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.accent }]}
                            onPress={handleSave}
                        >
                            <Text style={styles.buttonText}>Add Transaction</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    overlayTouchable: {
        flex: 1,
    },
    modalContainer: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
    },
    scrollContent: {
        flex: 1,
    },
    scrollContentContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    input: {
        flex: 1,
        fontSize: 16,
    },
    textAreaContainer: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    textArea: {
        fontSize: 16,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    footer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
    },
    button: {
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
