/**
 * CustomTabBar Component
 *
 * Bottom tab bar with a floating action button positioned at the
 * bottom-right corner, above the tab bar. The FAB opens the
 * Add Transaction modal.
 */

import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/theme';
import { AddTransactionModal } from '../modals/AddTransactionModal';

export const CustomTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, shadows, spacing, typography } = useTheme();
    const [showAddModal, setShowAddModal] = useState(false);

    const TAB_BAR_HEIGHT = 60;
    const FAB_SIZE = 52;

    return (
        <View style={styles.container}>
            {/* Tab bar background */}
            <View
                style={[
                    styles.tabBarBackground,
                    {
                        height: TAB_BAR_HEIGHT + insets.bottom,
                        backgroundColor: colors.navBackground,
                    },
                ]}
            >
                {/* Tab buttons */}
                <View style={[styles.tabsContainer, { height: TAB_BAR_HEIGHT }]}>
                    {state.routes.map((route, index) => {
                        const { options } = descriptors[route.key];
                        const isFocused = state.index === index;

                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        };

                        const iconName = options.tabBarIcon
                            ? (options.tabBarIcon as any)({ color: isFocused ? colors.navActive : colors.navInactive, focused: isFocused })?.props?.name
                            : 'ellipse-outline';

                        return (
                            <TouchableOpacity
                                key={route.key}
                                accessibilityRole="button"
                                accessibilityState={isFocused ? { selected: true } : {}}
                                accessibilityLabel={options.tabBarAccessibilityLabel}
                                onPress={onPress}
                                style={styles.tab}
                            >
                                <Ionicons
                                    name={iconName}
                                    size={24}
                                    color={isFocused ? colors.navActive : colors.navInactive}
                                />
                                <Text
                                    style={{
                                        fontSize: typography.sizes.xs,
                                        marginTop: spacing.xs,
                                        color: isFocused ? colors.navActive : colors.navInactive,
                                    }}
                                >
                                    {options.title}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* Floating Action Button — bottom right, above the tab bar */}
            <TouchableOpacity
                style={[
                    styles.fab,
                    {
                        backgroundColor: colors.accent,
                        width: FAB_SIZE,
                        height: FAB_SIZE,
                        borderRadius: FAB_SIZE / 2,
                        bottom: TAB_BAR_HEIGHT + insets.bottom + spacing.sm,
                        right: spacing.md,
                        ...shadows.elevated,
                    },
                ]}
                onPress={() => setShowAddModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
            >
                <Ionicons name="add" size={28} color={colors.accentForeground} />
            </TouchableOpacity>

            {/* Add Transaction Modal */}
            <AddTransactionModal
                visible={showAddModal}
                onClose={() => setShowAddModal(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    tabBarBackground: {
        width: '100%',
        position: 'relative',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0,0,0,0.08)',
    },
    tabsContainer: {
        flexDirection: 'row',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    tab: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fab: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
    },
});
