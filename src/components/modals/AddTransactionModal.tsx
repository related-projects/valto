import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Modal,
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

const CATEGORIES = [
    { emoji: '🍔', label: 'Food & Dining' },
    { emoji: '🚗', label: 'Transportation' },
    { emoji: '🏠', label: 'Housing' },
    { emoji: '🎬', label: 'Entertainment' },
    { emoji: '🛒', label: 'Shopping' },
    { emoji: '💊', label: 'Healthcare' },
    { emoji: '📚', label: 'Education' },
    { emoji: '✈️', label: 'Travel' },
];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const [transactionType, setTransactionType] = useState<'Expense' | 'Income' | 'Transfer'>('Expense');
    const [amount, setAmount] = useState('0');
    const [selectedCategory, setSelectedCategory] = useState('Food & Dining');
    const [note, setNote] = useState('');

    const handleNumberPress = (num: string) => {
        if (amount === '0') {
            setAmount(num);
        } else {
            setAmount(amount + num);
        }
    };

    const handleDecimalPress = () => {
        if (!amount.includes('.')) {
            setAmount(amount + '.');
        }
    };

    const handleBackspace = () => {
        if (amount.length > 1) {
            setAmount(amount.slice(0, -1));
        } else {
            setAmount('0');
        }
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
                        {/* Amount Display */}
                        <View style={styles.amountContainer}>
                            <Text style={styles.amountLabel}>Amount</Text>
                            <View style={styles.amountDisplay}>
                                <Text style={styles.currencySymbol}>$</Text>
                                <Text style={styles.amountValue}>{amount}</Text>
                            </View>
                        </View>

                        {/* Category Section */}
                        <View style={styles.categorySection}>
                            <Text style={styles.sectionLabel}>Category</Text>
                            <View style={styles.categoryChips}>
                                {CATEGORIES.map((category) => (
                                    <TouchableOpacity
                                        key={category.label}
                                        style={[
                                            styles.categoryChip,
                                            selectedCategory === category.label && styles.selectedChip,
                                        ]}
                                        onPress={() => setSelectedCategory(category.label)}
                                    >
                                        <Text style={styles.chipText}>
                                            {category.emoji} {category.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
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
                                />
                            </View>
                        </View>
                    </ScrollView>

                    {/* Numeric Keypad */}
                    <View style={styles.keypad}>
                        <View style={styles.keypadRow}>
                            {['1', '2', '3'].map((num) => (
                                <TouchableOpacity key={num} style={styles.key} onPress={() => handleNumberPress(num)}>
                                    <Text style={styles.keyText}>{num}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.keypadRow}>
                            {['4', '5', '6'].map((num) => (
                                <TouchableOpacity key={num} style={styles.key} onPress={() => handleNumberPress(num)}>
                                    <Text style={styles.keyText}>{num}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.keypadRow}>
                            {['7', '8', '9'].map((num) => (
                                <TouchableOpacity key={num} style={styles.key} onPress={() => handleNumberPress(num)}>
                                    <Text style={styles.keyText}>{num}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.keypadRow}>
                            <TouchableOpacity style={styles.key} onPress={handleDecimalPress}>
                                <Text style={styles.keyText}>.</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.key} onPress={() => handleNumberPress('0')}>
                                <Text style={styles.keyText}>0</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.key} onPress={handleBackspace}>
                                <Ionicons name="backspace-outline" size={24} color="#000" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
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
    modalContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '90%',
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
    },
    amountContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    amountLabel: {
        fontSize: 14,
        color: '#8E8E93',
        marginBottom: 8,
    },
    amountDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    currencySymbol: {
        fontSize: 24,
        color: '#8E8E93',
        marginRight: 4,
    },
    amountValue: {
        fontSize: 48,
        fontWeight: '700',
        color: '#000',
    },
    categorySection: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    sectionLabel: {
        fontSize: 13,
        color: '#8E8E93',
        marginBottom: 10,
    },
    categoryChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    categoryChip: {
        backgroundColor: '#F0F0F0',
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    selectedChip: {
        backgroundColor: '#E0E0E0',
    },
    chipText: {
        fontSize: 14,
        color: '#000',
    },
    inputSection: {
        paddingHorizontal: 16,
        marginBottom: 16,
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
    inputText: {
        fontSize: 16,
        color: '#000',
    },
    noteInput: {
        fontSize: 16,
        color: '#000',
        flex: 1,
    },
    keypad: {
        backgroundColor: '#E5E5E5',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    keypadRow: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 6,
    },
    key: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
        elevation: 1,
    },
    keyText: {
        fontSize: 24,
        color: '#000',
    },
});
