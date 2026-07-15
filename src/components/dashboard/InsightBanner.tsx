/**
 * InsightBanner
 *
 * A small, themed text block that displays a single financial insight.
 * Designed to blend subtly with existing dashboard cards — no layout break.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';

export type InsightVariant = 'success' | 'warning' | 'destructive' | 'neutral';

interface InsightBannerProps {
    message: string;
    icon?: keyof typeof Ionicons.glyphMap;
    variant?: InsightVariant;
}

const VARIANT_CONFIG: Record<InsightVariant, { bgKey: string; textKey: string; defaultIcon: keyof typeof Ionicons.glyphMap }> = {
    success: { bgKey: 'successBackground', textKey: 'successText', defaultIcon: 'checkmark-circle-outline' },
    warning: { bgKey: 'warningBackground', textKey: 'warningText', defaultIcon: 'alert-circle-outline' },
    destructive: { bgKey: 'destructiveBackground', textKey: 'destructiveText', defaultIcon: 'warning-outline' },
    neutral: { bgKey: 'iconBadgeBackground', textKey: 'mutedForeground', defaultIcon: 'information-circle-outline' },
};

export const InsightBanner: React.FC<InsightBannerProps> = ({
    message,
    icon,
    variant = 'neutral',
}) => {
    const { colors, typography, spacing, radius } = useTheme();
    const config = VARIANT_CONFIG[variant];

    const bgColor = (colors as any)[config.bgKey] ?? colors.muted;
    const textColor = (colors as any)[config.textKey] ?? colors.mutedForeground;
    const iconName = icon ?? config.defaultIcon;

    return (
        <View style={[styles.container, { backgroundColor: bgColor, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
            <Ionicons name={iconName} size={16} color={textColor} style={styles.icon} />
            <Text style={[styles.text, { color: textColor, fontSize: typography.sizes.xs }]}>
                {message}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    icon: {
        marginRight: 8,
    },
    text: {
        flex: 1,
        lineHeight: 18,
    },
});
