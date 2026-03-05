import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    View
} from 'react-native';
import { Category, CreateBudgetDTO, getCurrentMonth } from '../../domain/entities';
import { useCategories } from '../../hooks/useCategories';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';

interface AddBudgetModalProps {
    visible: boolean;
    onClose: () => void;
    onCreateBudget: (dto: CreateBudgetDTO) => Promise<void>;
    /** Category IDs that already have a budget for the current month */
    budgetedCategoryIds: string[];
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.75;

export const AddBudgetModal: React.FC<AddBudgetModalProps> = ({
    visible,
    onClose,
    onCreateBudget,
    budgetedCategoryIds,
}) => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius } = useTheme();
    const { expenseCategories } = useCategories();

    // Form state
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [limitAmount, setLimitAmount] = useState('');
    const [saving, setSaving] = useState(false);

    // Filter out categories that already have a budget this month
    const availableCategories = expenseCategories.filter(
        cat => !budgetedCategoryIds.includes(cat.id)
    );

    const selectedCategory = availableCategories.find(c => c.id === selectedCategoryId);

    const resetForm = () => {
        setSelectedCategoryId(null);
        setLimitAmount('');
    };

    const handleSave = async () => {
        if (!selectedCategoryId) {
            Alert.alert(t('modals.addBudget.selectCategory'), t('modals.addBudget.selectCategoryMessage'));
            return;
        }

        const parsedAmount = parseFloat(limitAmount);
        const amountNum = Math.round(parsedAmount * 100);

        if (!limitAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
            Alert.alert(t('modals.addBudget.invalidAmount'), t('modals.addBudget.invalidAmountMessage'));
            return;
        }

        try {
            setSaving(true);
            await onCreateBudget({
                categoryId: selectedCategoryId,
                month: getCurrentMonth(),
                limitAmount: amountNum,
            });
            resetForm();
            onClose();
        } catch (error) {
            Alert.alert(
                t('modals.common.error'),
                error instanceof Error ? error.message : t('modals.addBudget.errorCreate')
            );
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const renderCategoryItem = (category: Category) => {
        const isSelected = selectedCategoryId === category.id;
        return (
            <TouchableOpacity
                key={category.id}
                style={[
                    styles.categoryItem,
                    {
                        backgroundColor: isSelected ? colors.accent : colors.background,
                        borderColor: isSelected ? colors.accent : colors.border,
                        borderRadius: radius.md,
                    },
                ]}
                onPress={() => setSelectedCategoryId(category.id)}
            >
                {category.color && (
                    <View
                        style={[
                            styles.categoryDot,
                            { backgroundColor: category.color },
                        ]}
                    />
                )}
                <Text
                    style={{
                        color: isSelected ? colors.accentForeground : colors.foreground,
                        fontSize: typography.sizes.sm,
                        fontWeight: isSelected ? '600' : '500',
                        flex: 1,
                    }}
                >
                    {category.name}
                </Text>
                {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accentForeground} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <TouchableOpacity
                    style={styles.overlayTouchable}
                    activeOpacity={1}
                    onPress={handleClose}
                />
                <View style={[styles.modalContainer, { backgroundColor: colors.card, height: MODAL_HEIGHT }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                            <Ionicons name="close" size={24} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                            {t('modals.addBudget.title')}
                        </Text>
                        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                                <Text style={{ color: colors.accent, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>
                                    {t('modals.common.save')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                    >
                        <ScrollView
                            style={styles.scrollContent}
                            contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: spacing.tabBarOffset }]}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Budget Limit */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    {t('modals.addBudget.monthlyLimit')}
                                </Text>
                                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, marginRight: spacing.sm }}>$</Text>
                                    <TextInput
                                        style={[styles.input, { color: colors.foreground }]}
                                        placeholder="0.00"
                                        placeholderTextColor={colors.mutedForeground}
                                        keyboardType="decimal-pad"
                                        value={limitAmount}
                                        onChangeText={setLimitAmount}
                                        autoFocus
                                    />
                                </View>
                            </View>

                            {/* Category Selection */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }}>
                                    {t('modals.addBudget.expenseCategory')}
                                </Text>

                                {availableCategories.length === 0 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                                        <Ionicons name="alert-circle-outline" size={32} color={colors.mutedForeground} />
                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, textAlign: 'center', marginTop: spacing.sm }}>
                                            {expenseCategories.length === 0
                                                ? t('modals.addBudget.noCategoriesEmpty')
                                                : t('modals.addBudget.noCategoriesAll')}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={{ gap: spacing.xs }}>
                                        {availableCategories.map(renderCategoryItem)}
                                    </View>
                                )}
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
    categoryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        borderWidth: 1,
    },
    categoryDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: spacing.sm,
    },
});
