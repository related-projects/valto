/**
 * DonutChart — shared presentational donut primitive.
 *
 * Renders only the SVG ring + an optional center-label overlay bounded to the
 * inner circle. Each consumer keeps its own data prep, legend, title, Card and
 * layout by composing this primitive.
 *
 * - Center label is an absolutely-centered RN overlay sized to the inner-circle
 *   box, so consumer-supplied text (with adjustsFontSizeToFit) never crosses the
 *   ring at any value/locale.
 * - On mount and on data change the ring draws in as a single continuous
 *   clockwise sweep from 12 o'clock (react-native-reanimated, UI thread),
 *   respecting reduce-motion. The center label fades in. Toggle via
 *   animateOnMount (default true).
 */

import React, { useEffect, useMemo } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    type SharedValue,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DRAW_DURATION_MS = 800;

export interface DonutSegmentData {
    value: number;
    color: string;
}

interface DonutChartProps {
    segments: DonutSegmentData[];
    size: number;
    strokeWidth: number;
    /** Denominator for arc geometry. Defaults to the sum of segment values. */
    total?: number;
    /** Bounded to the inner circle and faded in; consumer owns its content. */
    centerLabel?: React.ReactNode;
    /** Draw-in sweep on mount + data change. Default true. */
    animateOnMount?: boolean;
}

interface ComputedSegment {
    color: string;
    angle: number; // rotation of segment start (deg)
    arcLength: number; // length of this segment's arc
    cumStart: number; // cumulative arc length preceding this segment
}

interface AnimatedSegmentProps {
    progress: SharedValue<number>;
    segment: ComputedSegment;
    circumference: number;
    center: number;
    radius: number;
    strokeWidth: number;
}

/**
 * One ring segment. Its visible arc length is derived from the shared sweep
 * progress on the UI thread, so all segments together read as one continuous
 * clockwise sweep from 12 o'clock.
 */
const AnimatedSegment: React.FC<AnimatedSegmentProps> = ({
    progress,
    segment,
    circumference,
    center,
    radius,
    strokeWidth,
}) => {
    const animatedProps = useAnimatedProps(() => {
        const swept = progress.value * circumference;
        const visible = Math.min(Math.max(swept - segment.cumStart, 0), segment.arcLength);
        return { strokeDasharray: `${visible} ${circumference}` };
    });

    return (
        <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            stroke={segment.color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDashoffset={0}
            rotation={segment.angle}
            origin={`${center}, ${center}`}
            strokeLinecap="butt"
            animatedProps={animatedProps}
        />
    );
};

export const DonutChart: React.FC<DonutChartProps> = ({
    segments,
    size,
    strokeWidth,
    total,
    centerLabel,
    animateOnMount = true,
}) => {
    const center = size / 2;
    const chartRadius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * chartRadius;
    // Inner-circle diameter — bounding box for the center label.
    const innerDiameter = 2 * (chartRadius - strokeWidth / 2);

    const denom = useMemo(
        () => (total !== undefined ? total : segments.reduce((sum, s) => sum + s.value, 0)),
        [total, segments],
    );

    // Precompute segment geometry (continuous clockwise from 12 o'clock).
    const computed = useMemo<ComputedSegment[]>(() => {
        let startAngle = -90;
        let cumStart = 0;
        return segments.map((item) => {
            const percentage = denom > 0 ? item.value / denom : 0;
            const arcLength = circumference * percentage;
            const segment: ComputedSegment = {
                color: item.color,
                angle: startAngle,
                arcLength,
                cumStart,
            };
            startAngle += percentage * 360;
            cumStart += arcLength;
            return segment;
        });
    }, [segments, denom, circumference]);

    // Re-trigger the draw-in only on mount and when the data set changes.
    const dataSignature = useMemo(
        () => `${denom}|${segments.map((s) => `${s.color}:${s.value}`).join(',')}`,
        [segments, denom],
    );

    const progress = useSharedValue(animateOnMount ? 0 : 1);
    const labelOpacity = useSharedValue(animateOnMount ? 0 : 1);

    useEffect(() => {
        if (!animateOnMount) {
            progress.value = 1;
            labelOpacity.value = 1;
            return;
        }
        let cancelled = false;
        AccessibilityInfo.isReduceMotionEnabled()
            .then((reduceMotion) => {
                if (cancelled) {
                    return;
                }
                if (reduceMotion) {
                    progress.value = 1;
                    labelOpacity.value = 1;
                    return;
                }
                progress.value = 0;
                labelOpacity.value = 0;
                progress.value = withTiming(1, {
                    duration: DRAW_DURATION_MS,
                    easing: Easing.out(Easing.cubic),
                });
                labelOpacity.value = withTiming(1, {
                    duration: DRAW_DURATION_MS,
                    easing: Easing.out(Easing.cubic),
                });
            })
            .catch(() => {
                if (cancelled) {
                    return;
                }
                // On failure, render the full donut rather than nothing.
                progress.value = 1;
                labelOpacity.value = 1;
            });
        return () => {
            cancelled = true;
        };
    }, [dataSignature, animateOnMount, progress, labelOpacity]);

    const labelAnimStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G rotation={0} origin={`${center}, ${center}`}>
                    {computed.map((segment, index) => (
                        <AnimatedSegment
                            key={index}
                            progress={progress}
                            segment={segment}
                            circumference={circumference}
                            center={center}
                            radius={chartRadius}
                            strokeWidth={strokeWidth}
                        />
                    ))}
                </G>
            </Svg>
            {centerLabel != null && (
                <Animated.View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, styles.labelLayer, labelAnimStyle]}
                >
                    <View
                        style={{
                            width: innerDiameter,
                            height: innerDiameter,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: 6,
                        }}
                    >
                        {centerLabel}
                    </View>
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    labelLayer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
