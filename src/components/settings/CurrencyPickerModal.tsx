/**
 * Currency Picker Modal
 *
 * Full-screen modal with searchable FlatList for selecting currency.
 * Disabled when currency is already locked.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPORTED_CURRENCIES, type CurrencyDefinition } from '../../domain/constants/currencies';
import { useTheme } from '../../theme/theme';
import { getButtonA11y } from '../../utils/accessibility';

interface CurrencyPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (currency: CurrencyDefinition) => void;
    selectedCode: string;
    locked: boolean;
}

// ─── Memoized Row ─────────────────────────────────────────────────────

interface CurrencyRowProps {
    item: CurrencyDefinition;
    selected: boolean;
    onPress: () => void;
}

const CurrencyRow: React.FC<CurrencyRowProps> = React.memo(({ item, selected, onPress }) => {
    const { colors, spacing, typography } = useTheme();
    return (
        <TouchableOpacity
            style={[styles.row, { paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md }]}
            onPress={onPress}
            activeOpacity={0.6}
        >
            <View style={styles.rowLeft}>
                <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '500', width: 48 }}>
                    {item.symbol}
                </Text>
                <View>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                        {item.code}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                        {item.name}
                    </Text>
                </View>
            </View>
            {selected && (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            )}
        </TouchableOpacity>
    );
});

// ─── Modal ────────────────────────────────────────────────────────────

export const CurrencyPickerModal: React.FC<CurrencyPickerModalProps> = ({
    visible,
    onClose,
    onSelect,
    selectedCode,
    locked,
}) => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const [search, setSearch] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const handleSearchChange = useCallback((text: string) => {
        setSearch(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(text.trim().toLowerCase());
        }, 300);
    }, []);

    const filteredCurrencies = useMemo(() => {
        if (!debouncedSearch) return SUPPORTED_CURRENCIES;
        return SUPPORTED_CURRENCIES.filter(c =>
            c.code.toLowerCase().includes(debouncedSearch)
            || c.name.toLowerCase().includes(debouncedSearch)
            || c.symbol.toLowerCase().includes(debouncedSearch),
        );
    }, [debouncedSearch]);

    const handleSelect = useCallback((item: CurrencyDefinition) => {
        if (locked) return;
        onSelect(item);
    }, [locked, onSelect]);

    const renderItem = useCallback(({ item }: { item: CurrencyDefinition }) => (
        <CurrencyRow
            item={item}
            selected={item.code === selectedCode}
            onPress={() => handleSelect(item)}
        />
    ), [selectedCode, handleSelect]);

    const keyExtractor = useCallback((item: CurrencyDefinition) => item.code, []);

    const handleClose = useCallback(() => {
        setSearch('');
        setDebouncedSearch('');
        onClose();
    }, [onClose]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={handleClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                {/* Header */}
                <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
                    <TouchableOpacity onPress={handleClose} {...getButtonA11y(t('a11y.closeButton'))}>
                        <Ionicons name="close" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {t('currencyPicker.title')}
                    </Text>
                    <View style={{ width: 24 }} />
                </View>

                {locked && (
                    <View style={[styles.lockedBanner, { backgroundColor: colors.accent, marginHorizontal: spacing.md, borderRadius: radius.md, padding: spacing.sm }]}>
                        <Ionicons name="lock-closed-outline" size={16} color={colors.accentForeground} />
                        <Text style={{ color: colors.accentForeground, fontSize: typography.sizes.sm, marginLeft: spacing.sm, flex: 1 }}>
                            {t('currencyPicker.locked')}
                        </Text>
                    </View>
                )}

                {/* Search */}
                {!locked && (
                    <View style={[styles.searchContainer, { paddingHorizontal: spacing.md, marginBottom: spacing.sm }]}>
                        <View style={[styles.searchBox, { backgroundColor: colors.card, borderRadius: radius.md, ...shadows.card }]}>
                            <Ionicons name="search" size={18} color={colors.mutedForeground} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.foreground, fontSize: typography.sizes.sm }]}
                                placeholder={t('currencyPicker.searchPlaceholder')}
                                placeholderTextColor={colors.mutedForeground}
                                value={search}
                                onChangeText={handleSearchChange}
                                autoCorrect={false}
                                autoCapitalize="characters"
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => { setSearch(''); setDebouncedSearch(''); }}>
                                    <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* List */}
                {filteredCurrencies.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.md }}>
                            {t('currencyPicker.noResults')}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredCurrencies}
                        renderItem={renderItem}
                        keyExtractor={keyExtractor}
                        initialNumToRender={20}
                        maxToRenderPerBatch={15}
                        windowSize={10}
                        getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
                        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
                    />
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
    },
    lockedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    searchContainer: {},
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        marginRight: 8,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
