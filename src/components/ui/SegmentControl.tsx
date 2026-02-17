import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';

export interface Segment<T> {
    key: string;
    label: string;
    value: T;
}

interface SegmentControlProps<T> {
    segments: Segment<T>[];
    selectedValue: T;
    onSelect: (value: T) => void;
    style?: object;
}

export function SegmentControl<T>({ segments, selectedValue, onSelect, style }: SegmentControlProps<T>) {
    const { colors, spacing, typography, radius } = useTheme();

    const slideAnim = useRef(new Animated.Value(0)).current;
    const [itemWidth, setItemWidth] = useState(0);

    useEffect(() => {
        const index = segments.findIndex(s => s.value === selectedValue);
        Animated.timing(slideAnim, {
            toValue: index * itemWidth,
            duration: 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
        }).start();
    }, [selectedValue, itemWidth]);

    return (
        <View
            style={[styles.container, { backgroundColor: colors.background }, style]}
            onLayout={(e) => {
                const innerWidth = e.nativeEvent.layout.width - spacing.xs * 2;
                setItemWidth(innerWidth / segments.length);
            }}
        >
            {/* Sliding indicator */}
            {itemWidth > 0 && (
                <Animated.View
                    style={[
                        styles.indicator,
                        {
                            width: itemWidth,
                            left: spacing.xs,
                            backgroundColor: colors.card,
                            borderRadius: radius.md,
                            transform: [{ translateX: slideAnim }],
                        },
                    ]}
                />
            )}
            {segments.map((seg) => {
                const isActive = seg.value === selectedValue;
                return (
                    <TouchableOpacity
                        key={seg.key}
                        style={styles.button}
                        onPress={() => onSelect(seg.value)}
                        activeOpacity={0.8}
                    >
                        <Text
                            style={{
                                color: isActive ? colors.foreground : colors.mutedForeground,
                                fontSize: typography.sizes.sm,
                                fontWeight: isActive ? '600' : '500',
                                textTransform: 'capitalize',
                            }}
                        >
                            {seg.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        padding: spacing.xs,
        borderRadius: radius.lg,
        height: 44,
    },
    indicator: {
        position: 'absolute',
        top: spacing.xs,
        bottom: spacing.xs,
        ...shadows.soft,
    },
    button: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
    },
});
