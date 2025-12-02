import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AddTransactionModalProps {
    visible: boolean;
    onClose: () => void;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const [transactionType, setTransactionType] = useState<'Expense' | 'Income' | 'Transfer'>('Expense');
    const [amount, setAmount] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Food & Dining');
    const [note, setNote] = useState('');

    const handleAmountChange = (text: string) => {
        // Remove non-numeric characters except decimal point
        const cleaned = text.replace(/[^0-9.]/g, '');

        // Ensure only one decimal point
        const parts = cleaned.split('.');
        if (parts.length > 2) {
            return;
        }

        // Limit to 10 digits before decimal and 2 after
        const beforeDecimal = parts[0].slice(0, 10);
        const afterDecimal = parts[1] ? parts[1].slice(0, 2) : '';

        const newAmount = parts.length === 2 ? `${beforeDecimal}.${afterDecimal}` : beforeDecimal;
        setAmount(newAmount);
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
            <View style={styles.overlay}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <View style={[styles.modalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name="close" size={24} color="#000" />
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>Add Transaction</Text>
                            <TouchableOpacity onPress={handleSave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Text style={styles.saveButton}>Save</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Divider */}
                        <View style={styles.divider} />

                        {/* Transaction Type Tabs */}
                        <View style={styles.tabsContainer}>
                            <View style={styles.tabsBackground}>
                                {(['Expense', 'Income', 'Transfer'] as const).map((type) => (
                                    <TouchableOpacity
                                        key={type}
                                        style={[
                                            styles.tab,
                                            transactionType === type && styles.activeTab,
                                        ]}
                                        onPress={() => setTransactionType(type)}
                                    >
                                        <Text style={[
                                            styles.tabText,
                                            transactionType === type && styles.activeTabText,
                                        ]}>
                                            {type}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {/* Amount Input */}
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionLabel}>Amount</Text>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.currencySymbol}>$</Text>
                                    <TextInput
                                        style={styles.amountInput}
                                        placeholder="0.00"
                                        placeholderTextColor="#8E8E93"
                                        keyboardType="decimal-pad"
                                        value={amount}
                                        onChangeText={handleAmountChange}
                                        maxLength={13} // 10 digits + 1 decimal + 2 decimals
                                    />
                                </View>
                            </View>

                            {/* Category Selector */}
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionLabel}>Category</Text>
                                <TouchableOpacity style={styles.inputContainer}>
                                    <Text style={styles.inputText}>{selectedCategory}</Text>
                                    <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
                                </TouchableOpacity>
                            </View>

                            {/* Wallet Selector */}
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionLabel}>Wallet</Text>
                                <TouchableOpacity style={styles.inputContainer}>
                                    <Text style={styles.inputText}>Main Wallet</Text>
                                    <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
                                </TouchableOpacity>
                            </View>

                            {/* Note Input */}
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionLabel}>Note</Text>
                                <View style={styles.inputContainer}>
                                    <TextInput
                                        style={styles.noteInput}
                                        placeholder="Add a note..."
                                        placeholderTextColor="#8E8E93"
                                        value={note}
                                        onChangeText={setNote}
                                        multiline
                                    />
                                </View>
                            </View>
                        </ScrollView>

                        {/* Save Button */}
                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={styles.saveButtonContainer}
                                onPress={handleSave}
                            >
                                <Text style={styles.saveButtonText}>Add Transaction</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#000',
    },
    saveButton: {
        fontSize: 16,
        fontWeight: '600',
        color: '#A09090',
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E5E5',
        width: '100%',
    },
    tabsContainer: {
        paddingHorizontal: 16,
        marginTop: 20,
    },
    tabsBackground: {
        backgroundColor: '#F0F0F0',
        borderRadius: 12,
        padding: 4,
        flexDirection: 'row',
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        color: '#8E8E93',
    },
    activeTabText: {
        color: '#000',
        fontWeight: '600',
    },
    content: {
        flex: 1,
        paddingTop: 24,
    },
    inputSection: {
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 13,
        color: '#8E8E93',
        marginBottom: 10,
    },
    inputContainer: {
        backgroundColor: '#F0F0F0',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    currencySymbol: {
        fontSize: 18,
        color: '#000',
        marginRight: 8,
    },
    amountInput: {
        flex: 1,
        fontSize: 18,
        color: '#000',
        fontWeight: '600',
    },
    inputText: {
        fontSize: 16,
        color: '#000',
    },
    noteInput: {
        fontSize: 16,
        color: '#000',
        flex: 1,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    footer: {
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    saveButtonContainer: {
        backgroundColor: '#8B5C48',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
