import { Ionicons } from '@expo/vector-icons';
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
import { Category, CategoryType } from '../../domain/entities';
import { useCategories } from '../../hooks/useCategories';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
import { IconBadge } from '../ui/IconBadge';
import { Segment, SegmentControl } from '../ui/SegmentControl';

interface CategoryModalProps {
    visible: boolean;
    onClose: () => void;
    categoryToEdit?: Category | null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;

const COLORS = [
    '#FFB74D', '#E57373', '#64B5F6', '#4DD0E1', '#BA68C8',
    '#81C784', '#9575CD', '#F06292', '#A1887F', '#90A4AE',
    '#FFA726', '#EC407A', '#66BB6A', '#42A5F5', '#26A69A'
];

const ICONS = [
    'restaurant', 'cart', 'car', 'film-outline', 'flash',
    'medical', 'school', 'person', 'home', 'business',
    'gift', 'cash', 'briefcase', 'trending-up', 'ellipsis-horizontal'
];

const TYPE_SEGMENTS: Segment<CategoryType>[] = Object.values(CategoryType).map(t => ({
    key: t,
    label: t,
    value: t,
}));

export const CategoryModal: React.FC<CategoryModalProps> = ({ visible, onClose, categoryToEdit }) => {
    const { colors, spacing, typography, radius } = useTheme();
    const { createCategory, updateCategory } = useCategories();

    const [name, setName] = useState('');
    const [type, setType] = useState<CategoryType>(CategoryType.EXPENSE);
    const [icon, setIcon] = useState('pricetag');
    const [color, setColor] = useState(COLORS[0]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            if (categoryToEdit) {
                setName(categoryToEdit.name);
                setType(categoryToEdit.type);
                setIcon(categoryToEdit.icon || 'pricetag');
                setColor(categoryToEdit.color || COLORS[0]);
            } else {
                setName('');
                setType(CategoryType.EXPENSE);
                setIcon('pricetag');
                setColor(COLORS[0]);
            }
        }
    }, [visible, categoryToEdit]);

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter a category name');
            return;
        }

        try {
            setSaving(true);
            if (categoryToEdit) {
                await updateCategory({
                    id: categoryToEdit.id,
                    name: name.trim(),
                    type,
                    icon,
                    color,
                });
            } else {
                await createCategory({
                    name: name.trim(),
                    type,
                    icon,
                    color,
                });
            }
            onClose();
        } catch (error) {
            Alert.alert('Error', 'Failed to save category');
            console.error(error);
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
                            {categoryToEdit ? 'Edit Category' : 'New Category'}
                        </Text>
                        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                                <Text style={{ color: colors.accent, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>Save</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <ScrollView
                            style={styles.scrollContent}
                            contentContainerStyle={styles.scrollContentContainer}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Type Segmented Control */}
                            <SegmentControl
                                segments={TYPE_SEGMENTS}
                                selectedValue={type}
                                onSelect={setType}
                                style={{ marginBottom: spacing.xl }}
                            />

                            {/* Name */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Name
                                </Text>
                                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <TextInput
                                        style={[styles.input, { color: colors.foreground }]}
                                        value={name}
                                        onChangeText={setName}
                                        placeholder="Category Name"
                                        placeholderTextColor={colors.mutedForeground}
                                    />
                                </View>
                            </View>

                            {/* Color Picker */}
                            <View style={{ marginBottom: spacing.xl }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Color
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {COLORS.map((c) => (
                                        <TouchableOpacity
                                            key={c}
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: 18,
                                                backgroundColor: c,
                                                marginRight: spacing.sm,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: color === c ? 2 : 0,
                                                borderColor: colors.foreground,
                                            }}
                                            onPress={() => setColor(c)}
                                        >
                                            {color === c && <Ionicons name="checkmark" size={20} color="#FFF" />}
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Icon Picker */}
                            <View style={{ marginBottom: spacing.xl }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    Icon
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                    {ICONS.map((i) => (
                                        <TouchableOpacity
                                            key={i}
                                            style={{
                                                width: 48,
                                                height: 48,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: radius.md,
                                                backgroundColor: icon === i ? colors.muted : 'transparent',
                                            }}
                                            onPress={() => setIcon(i)}
                                        >
                                            <IconBadge
                                                icon={<Ionicons name={i as any} size={24} color={color} />}
                                                size="md"
                                            />
                                        </TouchableOpacity>
                                    ))}
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
        borderRadius: radius.md,
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
});
