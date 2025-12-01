import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme/theme';

export const CustomTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, shadows } = useTheme();

    const TAB_BAR_HEIGHT = 60;
    const FAB_SIZE = 56;
    const CURVE_WIDTH = 100;

    return (
        <View style={styles.container}>
            {/* Custom curved background */}
            <View style={[styles.tabBarBackground, { height: TAB_BAR_HEIGHT + insets.bottom }]}>
                <Svg
                    width="100%"
                    height={TAB_BAR_HEIGHT}
                    style={StyleSheet.absoluteFill}
                >
                    <Path
                        d={`
              M 0,0
              L ${(100 - CURVE_WIDTH) / 2}%,0
              Q ${50 - CURVE_WIDTH / 4}%,0 ${50 - CURVE_WIDTH / 4}%,${TAB_BAR_HEIGHT / 2}
              Q 50%,${TAB_BAR_HEIGHT + 10} ${50 + CURVE_WIDTH / 4}%,${TAB_BAR_HEIGHT / 2}
              Q ${50 + CURVE_WIDTH / 4}%,0 ${(100 + CURVE_WIDTH) / 2}%,0
              L 100%,0
              L 100%,${TAB_BAR_HEIGHT}
              L 0,${TAB_BAR_HEIGHT}
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

                        // Skip middle tab (index 2) to make room for FAB
                        if (index === 2) {
                            return <View key={route.key} style={{ flex: 1 }} />;
                        }

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
                            </TouchableOpacity>
                        );
                    })}
                </View>

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
                    onPress={() => {
                        // Handle FAB press - could open a modal or navigate
                        console.log('FAB pressed');
                    }}
                >
                    <Ionicons name="add" size={32} color={colors.accentForeground} />
                </TouchableOpacity>
            </View>
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
    fab: {
        position: 'absolute',
        left: '50%',
        marginLeft: -28, // Half of FAB_SIZE
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
    },
});
