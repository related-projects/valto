import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryModal } from '../components/modals/CategoryModal';
import { IconBadge } from '../components/ui/IconBadge';
import { ListItem } from '../components/ui/ListItem';
import { Segment, SegmentControl } from '../components/ui/SegmentControl';
import { Category, CategoryType } from '../domain/entities';
import { useCategories } from '../hooks/useCategories';
import { useTheme } from '../theme/theme';

export const CategoriesScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { expenseCategories, incomeCategories, loading, deleteCategory } = useCategories();

    // Segment data
    const SEGMENTS: Segment<CategoryType>[] = [
        { key: 'expense', label: t('categories.expense'), value: CategoryType.EXPENSE },
        { key: 'income', label: t('categories.income'), value: CategoryType.INCOME },
    ];

    // State for filter segment (Expense / Income)
    const [selectedType, setSelectedType] = useState<CategoryType>(CategoryType.EXPENSE);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);

    const categories = selectedType === CategoryType.EXPENSE ? expenseCategories : incomeCategories;

    const handleEdit = (category: Category) => {
        setCategoryToEdit(category);
        setModalVisible(true);
    };

    const handleAddNew = () => {
        setCategoryToEdit(null);
        setModalVisible(true);
    };

    const handleDelete = (category: Category) => {
        Alert.alert(
            t('categories.deleteTitle'),
            t('categories.deleteMessage', { name: category.name }),
            [
                { text: t('alerts.cancel'), style: 'cancel' },
                {
                    text: t('categories.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCategory(category.id);
                        } catch (error) {
                            Alert.alert(t('alerts.error'), t('categories.deleteFailed'));
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
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
                        {t('categories.title')}
                    </Text>
                </View>
            </View>

            {/* Segment Control */}
            <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                <SegmentControl
                    segments={SEGMENTS}
                    selectedValue={selectedType}
                    onSelect={setSelectedType}
                    style={{ ...shadows.soft }}
                />
            </View>

            {/* List */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.lg,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    {categories.map((category) => (
                        <ListItem
                            key={category.id}
                            title={category.name}
                            leftIcon={
                                <IconBadge
                                    icon={<Ionicons name={(category.icon as keyof typeof Ionicons.glyphMap) || 'pricetag'} size={20} color={category.color || colors.primary} />}
                                    size="sm"
                                />
                            }
                            rightIcon={
                                <TouchableOpacity onPress={() => handleDelete(category)} style={{ padding: spacing.xs }}>
                                    <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                                </TouchableOpacity>
                            }
                            onPress={() => handleEdit(category)}
                            showChevron={false}
                        />
                    ))}
                    {categories.length === 0 && (
                        <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                            <Ionicons name="grid-outline" size={40} color={colors.mutedForeground} style={{ marginBottom: spacing.sm }} />
                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.md }}>{t('categories.noCategories')}</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* FAB for Add */}
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
                onPress={handleAddNew}
            >
                <Ionicons name="add" size={30} color={colors.accentForeground} />
            </TouchableOpacity>

            {/* Modal */}
            <CategoryModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                categoryToEdit={categoryToEdit}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
