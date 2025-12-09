import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme/theme';
import { AddTransactionModal } from '../modals/AddTransactionModal';

export const CustomTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, shadows, spacing, typography } = useTheme();
    const { width: screenWidth } = Dimensions.get('window');
    const [showAddModal, setShowAddModal] = useState(false);

    const TAB_BAR_HEIGHT = 60;
    const FAB_SIZE = 56;
    const CURVE_DEPTH = 20;
    const CURVE_WIDTH = 100;

    // Calculate absolute positions
    const curveStart = (screenWidth - CURVE_WIDTH) / 2;
    const curveEnd = (screenWidth + CURVE_WIDTH) / 2;
    const curveCenter = screenWidth / 2;

    return (
        <View style={styles.container}>
            {/* Custom curved background */}
            <View style={[styles.tabBarBackground, { height: TAB_BAR_HEIGHT + insets.bottom }]}>
                <Svg
                    width={screenWidth}
                    height={TAB_BAR_HEIGHT}
                    style={StyleSheet.absoluteFill}
                >
                    <Path
                        d={`
              M 0, 0
              L ${curveStart}, 0
              Q ${curveStart + 10}, 0 ${curveStart + 20},${CURVE_DEPTH}
              Q ${curveCenter},${TAB_BAR_HEIGHT / 2} ${curveEnd - 20},${CURVE_DEPTH}
              Q ${curveEnd - 10}, 0 ${curveEnd}, 0
              L ${screenWidth}, 0
              L ${screenWidth},${TAB_BAR_HEIGHT}
              L 0, ${TAB_BAR_HEIGHT}
Z
    `}
                        fill={colors.navBackground}
                    />
                </Svg>

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

                {/* Spacer for FAB in the center */}
                <View style={[styles.fabSpacer, { height: TAB_BAR_HEIGHT }]} />

                {/* Floating Action Button */}
                <TouchableOpacity
                    style={[
                        styles.fab,
                        {
                            backgroundColor: colors.accent,
                            width: FAB_SIZE,
                            height: FAB_SIZE,
                            borderRadius: FAB_SIZE / 2,
                            bottom: TAB_BAR_HEIGHT - FAB_SIZE / 2 + 10,
                            ...shadows.elevated,
                        },
                    ]}
                    onPress={() => setShowAddModal(true)}
                >
                    <Ionicons name="add" size={32} color={colors.accentForeground} />
                </TouchableOpacity>
            </View>

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
    fabSpacer: {
        position: 'absolute',
        width: 80,
        left: '50%',
        marginLeft: -40,
        pointerEvents: 'none',
    },
    fab: {
        position: 'absolute',
        left: '50%',
        marginLeft: -28, // Half of FAB_SIZE
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
    },
});
