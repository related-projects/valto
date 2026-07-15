/**
 * DropdownPicker
 *
 * Reusable collapsible dropdown picker component.
 * Uses the app's theme tokens for consistent styling.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';

// ─── Types ────────────────────────────────────────────────────────────

export interface DropdownItem {
    id: string;
    label: string;
    /** Optional sublabel shown below the main label */
    sublabel?: string;
    /** Optional icon name (Ionicons) */
    icon?: string;
    /** Optional icon/label color */
    color?: string;
    /** Optional testID */
    testID?: string;
}

interface DropdownPickerProps {
    /** Label shown above the trigger */
    label: string;
    /** List of selectable items */
    items: DropdownItem[];
    /** Currently selected item ID */
    selectedId: string;
    /** Called when an item is selected */
    onSelect: (id: string) => void;
    /** Placeholder when no item selected */
    placeholder?: string;
    /** Optional icon for the trigger row */
    triggerIcon?: React.ReactNode;
    /** Empty state text */
    emptyText?: string;
    /** Maximum height of the dropdown list */
    maxHeight?: number;
    /** Optional testID */
    testID?: string;
}

// ─── Component ────────────────────────────────────────────────────────

export const DropdownPicker: React.FC<DropdownPickerProps> = ({
    label,
    items,
    selectedId,
    onSelect,
    placeholder = 'Select...',
    triggerIcon,
    emptyText = 'No items available',
    maxHeight = 200,
    testID,
}) => {
    const { colors, spacing: sp, typography: tp, radius: rd } = useTheme();
    const [open, setOpen] = useState(false);

    const selectedItem = items.find(i => i.id === selectedId);

    return (
        <View style={{ marginBottom: sp.lg }}>
            <Text style={{ color: colors.mutedForeground, fontSize: tp.sizes.sm, marginBottom: sp.xs }}>
                {label}
            </Text>
            <TouchableOpacity
                testID={testID}
                style={[styles.trigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setOpen(!open)}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {triggerIcon && <View style={{ marginRight: sp.sm }}>{triggerIcon}</View>}
                    <View>
                        <Text style={{ color: colors.foreground, fontSize: tp.sizes.md }}>
                            {selectedItem?.label || placeholder}
                        </Text>
                        {selectedItem?.sublabel && (
                            <Text style={{ color: colors.mutedForeground, fontSize: tp.sizes.xs }}>
                                {selectedItem.sublabel}
                            </Text>
                        )}
                    </View>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            {open && (
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: rd.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginTop: sp.xs,
                    maxHeight,
                }}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {items.length === 0 ? (
                            <View style={{ padding: sp.md, alignItems: 'center' }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: tp.sizes.sm }}>
                                    {emptyText}
                                </Text>
                            </View>
                        ) : (
                            items.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    testID={item.testID}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        padding: sp.md,
                                        borderBottomWidth: 1,
                                        borderBottomColor: colors.border,
                                        backgroundColor: selectedId === item.id ? colors.muted : 'transparent',
                                    }}
                                    onPress={() => {
                                        onSelect(item.id);
                                        setOpen(false);
                                    }}
                                >
                                    {item.icon && (
                                        <Ionicons
                                            name={item.icon as keyof typeof Ionicons.glyphMap}
                                            size={20}
                                            color={item.color || colors.primary}
                                            style={{ marginRight: sp.sm }}
                                        />
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.foreground, fontSize: tp.sizes.md }}>
                                            {item.label}
                                        </Text>
                                        {item.sublabel && (
                                            <Text style={{ color: colors.mutedForeground, fontSize: tp.sizes.xs }}>
                                                {item.sublabel}
                                            </Text>
                                        )}
                                    </View>
                                    {selectedId === item.id && (
                                        <Ionicons name="checkmark" size={20} color={colors.accent} />
                                    )}
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    trigger: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 14,
    },
});
