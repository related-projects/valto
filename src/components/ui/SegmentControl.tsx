import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { getSelectableA11y } from '../../utils/accessibility';

export interface Segment<T> {
    key: string;
    label: string;
    value: T;
    testID?: string;
}

interface SegmentControlProps<T> {
    segments: Segment<T>[];
    selectedValue: T;
    onSelect: (value: T) => void;
    style?: object;
    testID?: string;
}

export function SegmentControl<T>({ segments, selectedValue, onSelect, style, testID }: SegmentControlProps<T>) {
    const { colors, typography, radius } = useTheme();

    return (
        <View
            testID={testID}
            style={[
                styles.container,
                { backgroundColor: colors.background, borderColor: colors.border },
                style,
            ]}
        >
            {segments.map((seg) => {
                const isActive = seg.value === selectedValue;
                return (
                    <TouchableOpacity
                        key={seg.key}
                        testID={seg.testID}
                        style={[
                            styles.button,
                            {
                                borderRadius: radius.md,
                                backgroundColor: isActive ? colors.accent : 'transparent',
                                borderColor: isActive ? colors.accent : 'transparent',
                            },
                        ]}
                        onPress={() => onSelect(seg.value)}
                        activeOpacity={0.8}
                        {...getSelectableA11y(seg.label, isActive)}
                    >
                        <Text
                            style={{
                                color: isActive ? colors.accentForeground : colors.foreground,
                                fontSize: typography.sizes.sm,
                                fontWeight: isActive ? typography.weights.semibold : typography.weights.regular,
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
        borderWidth: 1,
        height: 44,
    },
    button: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
});
