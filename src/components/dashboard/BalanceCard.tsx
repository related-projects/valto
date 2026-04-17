import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFormatting } from '../../hooks/useFormatting';
import { useTheme } from '../../theme/theme';

interface BalanceCardProps {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
    netBalance?: number;
    incomeChange?: number | null;
    expenseChange?: number | null;
    netBalanceChange?: number | null;
    /** When true, eye toggle requires authentication before revealing */
    securityEnabled?: boolean;
    /** Called when user taps eye with security on. Return true to reveal. */
    onRequestAuth?: () => Promise<boolean>;
}

// ─── CARD SURFACE CONSTANTS ───────────────────────────────────────────
// Tuned per theme to simulate realistic plastic/metal card surface

/** Layer opacities for the multi-layer card surface */
const CARD_SURFACE = {
    light: {
        // Layer 1 — Base gradient stops (top → mid → bottom)
        gradientTopEdge: 'rgba(255, 255, 255, 0.14)',
        gradientMidBand: 'rgba(255, 255, 255, 0.04)',
        gradientBottomEdge: 'rgba(0, 0, 0, 0.10)',
        // Layer 2 — Diagonal light reflection
        lightReflectionStart: 'rgba(255, 255, 255, 0.12)',
        lightReflectionEnd: 'rgba(255, 255, 255, 0.0)',
        // Layer 3 — Inner shadow / depth (beveled edges)
        innerBorderTop: 'rgba(255, 255, 255, 0.22)',
        innerBorderLeft: 'rgba(255, 255, 255, 0.10)',
        innerBorderRight: 'rgba(0, 0, 0, 0.08)',
        innerBorderBottom: 'rgba(0, 0, 0, 0.14)',
        // Layer 4 — Noise texture simulation
        noiseOpacity: 0.03,
        // Layer 5 — Gloss strip (top edge highlight)
        glossOpacity: 0.30,
        // Layer 6 — Content depth (text shadow)
        textShadowColor: 'rgba(0, 0, 0, 0.15)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    dark: {
        // Layer 1 — Base gradient stops
        gradientTopEdge: 'rgba(255, 255, 255, 0.08)',
        gradientMidBand: 'rgba(255, 255, 255, 0.02)',
        gradientBottomEdge: 'rgba(0, 0, 0, 0.16)',
        // Layer 2 — Diagonal light reflection
        lightReflectionStart: 'rgba(255, 255, 255, 0.08)',
        lightReflectionEnd: 'rgba(255, 255, 255, 0.0)',
        // Layer 3 — Inner shadow / depth (beveled edges)
        innerBorderTop: 'rgba(255, 255, 255, 0.14)',
        innerBorderLeft: 'rgba(255, 255, 255, 0.06)',
        innerBorderRight: 'rgba(0, 0, 0, 0.12)',
        innerBorderBottom: 'rgba(0, 0, 0, 0.20)',
        // Layer 4 — Noise texture simulation
        noiseOpacity: 0.04,
        // Layer 5 — Gloss strip
        glossOpacity: 0.18,
        // Layer 6 — Content depth
        textShadowColor: 'rgba(0, 0, 0, 0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
} as const;

const BalanceCardInner: React.FC<BalanceCardProps> = ({
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    netBalance,
    incomeChange,
    expenseChange,
    netBalanceChange,
    securityEnabled = false,
    onRequestAuth,
}) => {
    const { t } = useTranslation();
    const { colors, typography, spacing, radius, shadows, isDark } = useTheme();
    const { formatAmount } = useFormatting();
    const [hidden, setHidden] = useState(false);
    const authInProgress = useRef(false);

    const handleEyePress = useCallback(async () => {
        // If currently visible, always allow hiding
        if (!hidden) {
            setHidden(true);
            return;
        }

        // If hidden and security enabled, require auth
        if (securityEnabled && onRequestAuth) {
            if (authInProgress.current) return; // Prevent rapid taps
            authInProgress.current = true;
            try {
                const authenticated = await onRequestAuth();
                if (authenticated) {
                    setHidden(false);
                }
            } finally {
                authInProgress.current = false;
            }
        } else {
            setHidden(false);
        }
    }, [hidden, securityEnabled, onRequestAuth]);

    // Helper to convert hex color to rgba with opacity
    const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    // Use centralized formatting utility; respect hidden balance mode
    const displayAmount = (amount: number) => {
        if (hidden) return '••••••';
        return formatAmount(amount);
    };

    const renderChangeBadge = (change?: number | null, isExpense?: boolean) => {
        if (change === undefined || change === null) return null;

        // For expenses, an increase is bad (red), decrease is good (green)
        // For income/net, an increase is good (green), decrease is bad (red)
        const isPositiveChange = change >= 0;
        const isGood = isExpense ? !isPositiveChange : isPositiveChange;

        const bgColor = isGood ? colors.successBackground : colors.destructiveBackground;
        const textColor = isGood ? colors.successText : colors.destructiveText;
        const iconName = isPositiveChange ? 'arrow-up' : 'arrow-down';

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bgColor, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, marginTop: 4, alignSelf: 'flex-start' }}>
                <Ionicons name={iconName} size={10} color={textColor} />
                <Text style={{ color: textColor, fontSize: typography.sizes.xs - 2, fontWeight: '600', marginLeft: 2 }}>{Math.abs(change).toFixed(1)}%</Text>
            </View>
        );
    };

    // Select theme-appropriate surface constants
    const surface = isDark ? CARD_SURFACE.dark : CARD_SURFACE.light;

    // Content text shadow for Layer 6 — visual elevation of text
    const contentTextShadow = {
        textShadowColor: surface.textShadowColor,
        textShadowOffset: surface.textShadowOffset,
        textShadowRadius: surface.textShadowRadius,
    };

    return (
        // ── LAYER 5: External Shadow Container ──
        // Dual-layer shadow: soft ambient + tight contact shadow
        <View
            style={[
                styles.shadowAmbient,
                {
                    borderRadius: radius.xl,
                    shadowColor: isDark ? '#000000' : '#2F241F',
                },
            ]}
        >
            <View
                style={[
                    styles.shadowContact,
                    {
                        borderRadius: radius.xl,
                        shadowColor: isDark ? '#000000' : '#3A2A20',
                    },
                ]}
            >
                {/* ── Card Body ── */}
                <View
                    style={[
                        styles.container,
                        {
                            backgroundColor: colors.accent,
                            borderRadius: radius.xl,
                            padding: spacing.lg,
                        },
                    ]}
                >
                    {/* ════════════════════════════════════════════
                        LAYER 1 — BASE SURFACE (3-stop gradient)
                        Darker edge → lighter center → darker edge
                        ════════════════════════════════════════════ */}

                    {/* Top edge — lighter, simulates light catching top surface */}
                    <View
                        style={[
                            styles.gradientTopEdge,
                            {
                                borderTopLeftRadius: radius.xl,
                                borderTopRightRadius: radius.xl,
                                backgroundColor: surface.gradientTopEdge,
                            },
                        ]}
                        pointerEvents="none"
                    />

                    {/* Mid band — very subtle brightness in the center */}
                    <View
                        style={[
                            styles.gradientMidBand,
                            {
                                backgroundColor: surface.gradientMidBand,
                            },
                        ]}
                        pointerEvents="none"
                    />

                    {/* Bottom edge — darker, natural shadow falloff */}
                    <View
                        style={[
                            styles.gradientBottomEdge,
                            {
                                borderBottomLeftRadius: radius.xl,
                                borderBottomRightRadius: radius.xl,
                                backgroundColor: surface.gradientBottomEdge,
                            },
                        ]}
                        pointerEvents="none"
                    />

                    {/* ════════════════════════════════════════════
                        LAYER 2 — LIGHT REFLECTION (diagonal)
                        Translucent white gradient overlay
                        positioned top-left → center, very low opacity
                        ════════════════════════════════════════════ */}
                    <View
                        style={[
                            styles.lightReflection,
                            {
                                borderTopLeftRadius: radius.xl,
                                backgroundColor: surface.lightReflectionStart,
                            },
                        ]}
                        pointerEvents="none"
                    />
                    {/* Feathered edge of the reflection */}
                    <View
                        style={[
                            styles.lightReflectionFade,
                            {
                                backgroundColor: surface.lightReflectionEnd,
                            },
                        ]}
                        pointerEvents="none"
                    />

                    {/* ════════════════════════════════════════════
                        LAYER 3 — INNER SHADOW / DEPTH
                        Beveled border illusion: light top/left,
                        dark right/bottom → inset surface feel
                        ════════════════════════════════════════════ */}
                    <View
                        style={[
                            styles.innerShadowEdge,
                            {
                                borderRadius: radius.xl,
                                borderTopColor: surface.innerBorderTop,
                                borderLeftColor: surface.innerBorderLeft,
                                borderRightColor: surface.innerBorderRight,
                                borderBottomColor: surface.innerBorderBottom,
                            },
                        ]}
                        pointerEvents="none"
                    />
                    {/* Secondary inner border — tighter, adds crispness */}
                    <View
                        style={[
                            styles.innerShadowInset,
                            {
                                borderRadius: radius.xl - 1,
                                borderTopColor: 'rgba(255, 255, 255, 0.06)',
                                borderLeftColor: 'rgba(255, 255, 255, 0.03)',
                                borderRightColor: 'rgba(0, 0, 0, 0.04)',
                                borderBottomColor: 'rgba(0, 0, 0, 0.06)',
                            },
                        ]}
                        pointerEvents="none"
                    />

                    {/* ════════════════════════════════════════════
                        LAYER 4 — NOISE / TEXTURE
                        Micro-dot pattern simulating surface grain
                        Prevents "flat digital" appearance
                        ════════════════════════════════════════════ */}
                    <View
                        style={[
                            styles.noiseTexture,
                            {
                                borderRadius: radius.xl,
                                opacity: surface.noiseOpacity,
                            },
                        ]}
                        pointerEvents="none"
                    >
                        {/* Simulated noise via alternating micro-dots */}
                        {Array.from({ length: 8 }).map((_, row) => (
                            <View key={row} style={styles.noiseRow}>
                                {Array.from({ length: 16 }).map((_, col) => (
                                    <View
                                        key={col}
                                        style={[
                                            styles.noiseDot,
                                            {
                                                opacity: (row + col) % 3 === 0 ? 0.8 : (row + col) % 2 === 0 ? 0.4 : 0.1,
                                                backgroundColor: (row + col) % 2 === 0 ? '#FFFFFF' : '#000000',
                                            },
                                        ]}
                                    />
                                ))}
                            </View>
                        ))}
                    </View>

                    {/* ════════════════════════════════════════════
                        LAYER 5 (bonus) — GLOSS STRIP
                        Thin highlight across the very top edge
                        Simulates edge light reflection on plastic
                        ════════════════════════════════════════════ */}
                    <View
                        style={[
                            styles.glossStrip,
                            {
                                borderTopLeftRadius: radius.xl,
                                borderTopRightRadius: radius.xl,
                                opacity: surface.glossOpacity,
                            },
                        ]}
                        pointerEvents="none"
                    />

                    {/* ════════════════════════════════════════════
                        LAYER 6 — CONTENT (with depth)
                        Text gets subtle shadow for embossed feel
                        ════════════════════════════════════════════ */}
                    <View style={styles.contentLayer}>
                        {/* Header: Balance + Eye toggle */}
                        <View style={styles.header}>
                            <View>
                                <Text
                                    style={[
                                        {
                                            color: colors.accentForeground,
                                            fontSize: typography.sizes.sm,
                                            marginBottom: spacing.xs,
                                            opacity: 0.8,
                                        },
                                        contentTextShadow,
                                    ]}
                                >
                                    {t('components.balanceCard.totalBalance')}
                                </Text>
                                <Text
                                    style={[
                                        {
                                            color: colors.accentForeground,
                                            fontSize: typography.sizes['4xl'],
                                            fontWeight: typography.weights.semibold,
                                            letterSpacing: -1,
                                        },
                                        contentTextShadow,
                                    ]}
                                >
                                    {displayAmount(totalBalance)}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleEyePress}
                                style={{
                                    padding: spacing.sm,
                                    borderRadius: radius.full,
                                    position: 'relative',
                                }}
                            >
                                <View
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        backgroundColor: colors.accentForeground,
                                        opacity: 0.1,
                                        borderRadius: radius.full,
                                    }}
                                />
                                <Ionicons
                                    name={hidden ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color={colors.accentForeground}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Stats row */}
                        <View style={[styles.statsRow, { borderTopColor: hexToRgba(colors.accentForeground, 0.2) }]}>
                            <View style={styles.statItem}>
                                <View style={styles.statLabelRow}>
                                    <View style={[styles.iconBadge, { backgroundColor: colors.successBackground }]}>
                                        <Ionicons name="trending-up" size={12} color={colors.successText} />
                                    </View>
                                    <Text style={[{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }, contentTextShadow]}>{t('components.balanceCard.income')}</Text>
                                </View>
                                <Text style={[{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }, contentTextShadow]}>
                                    {displayAmount(monthlyIncome)}
                                </Text>
                                {renderChangeBadge(incomeChange, false)}
                            </View>

                            <View style={styles.statItem}>
                                <View style={styles.statLabelRow}>
                                    <View style={[styles.iconBadge, { backgroundColor: colors.destructiveBackground }]}>
                                        <Ionicons name="trending-down" size={12} color={colors.destructiveText} />
                                    </View>
                                    <Text style={[{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }, contentTextShadow]}>{t('components.balanceCard.expenses')}</Text>
                                </View>
                                <Text style={[{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }, contentTextShadow]}>
                                    {displayAmount(monthlyExpense)}
                                </Text>
                                {renderChangeBadge(expenseChange, true)}
                            </View>

                            {netBalance !== undefined && (
                                <View style={styles.statItem}>
                                    <View style={styles.statLabelRow}>
                                        <View style={[styles.iconBadge, { backgroundColor: colors.accentForeground, opacity: 0.2 }]}>
                                            <Ionicons name="swap-vertical" size={12} color={colors.accent} />
                                        </View>
                                        <Text style={[{ color: colors.accentForeground, fontSize: typography.sizes.xs, opacity: 0.7 }, contentTextShadow]}>{t('components.balanceCard.net')}</Text>
                                    </View>
                                    <Text style={[{ color: colors.accentForeground, fontWeight: '600', fontSize: typography.sizes.md }, contentTextShadow]}>
                                        {displayAmount(netBalance)}
                                    </Text>
                                    {renderChangeBadge(netBalanceChange, false)}
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
};

/** Memoized BalanceCard — prevents re-renders from parent style changes */
export const BalanceCard = React.memo(BalanceCardInner);

// ─── STYLES ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    // ── Layer 5: External dual-shadow system ──

    /** Ambient shadow — large, soft, diffused */
    shadowAmbient: {
        width: '100%',
        ...Platform.select({
            ios: {
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.18,
                shadowRadius: 28,
            },
            android: {
                elevation: 14,
            },
        }),
    },

    /** Contact shadow — tight, sharp, close to surface */
    shadowContact: {
        width: '100%',
        ...Platform.select({
            ios: {
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.12,
                shadowRadius: 6,
            },
            android: {
                // Android only supports single elevation; already handled above
            },
        }),
    },

    // ── Card body ──

    container: {
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
    },

    // ── Layer 1: 3-stop base gradient ──

    /** Top 30% — light, simulates direct light on upper surface */
    gradientTopEdge: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '30%',
    },

    /** Middle 40% — very subtle brightness band */
    gradientMidBand: {
        position: 'absolute',
        top: '30%',
        left: 0,
        right: 0,
        height: '40%',
    },

    /** Bottom 30% — darker falloff, natural shadow */
    gradientBottomEdge: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '30%',
    },

    // ── Layer 2: Diagonal light reflection ──

    /** Main reflection — positioned top-left, angled coverage */
    lightReflection: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '65%',
        height: '55%',
        // Diagonal clip via border trick — creates triangular light falloff
        borderBottomRightRadius: 999,
    },

    /** Feathered edge — softens the reflection boundary */
    lightReflectionFade: {
        position: 'absolute',
        top: 0,
        left: '50%',
        width: '30%',
        height: '40%',
        borderBottomLeftRadius: 999,
        borderBottomRightRadius: 999,
    },

    // ── Layer 3: Inner shadow (beveled edge illusion) ──

    /** Primary bevel — outer ring */
    innerShadowEdge: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1.5,
    },

    /** Secondary bevel — inner ring for crispness */
    innerShadowInset: {
        position: 'absolute',
        top: 1.5,
        left: 1.5,
        right: 1.5,
        bottom: 1.5,
        borderWidth: 0.5,
    },

    // ── Layer 4: Noise texture ──

    noiseTexture: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        overflow: 'hidden',
    },

    noiseRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
    },

    noiseDot: {
        width: 1,
        height: 1,
        borderRadius: 0.5,
    },

    // ── Layer 5 (bonus): Gloss strip ──

    glossStrip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: '#FFFFFF',
    },

    // ── Layer 6: Content ──

    contentLayer: {
        position: 'relative',
        zIndex: 10,
    },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },

    statsRow: {
        flexDirection: 'row',
        paddingTop: 16,
        borderTopWidth: 1,
        gap: 16,
    },

    statItem: {
        flex: 1,
    },

    statLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },

    iconBadge: {
        padding: 4,
        borderRadius: 999,
    },
});
