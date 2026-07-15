/**
 * EmptyState Component
 *
 * Reusable empty state used across screens when there is no data to display.
 * Uses the app's design system and supports an optional CTA button.
 * All text props should be pre-translated via t().
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme/theme';

interface EmptyStateProps {
    /** Ionicons icon name */
    icon: keyof typeof Ionicons.glyphMap;
    /** Pre-translated title */
    title: string;
    /** Pre-translated description */
    description: string;
    /** Optional CTA button label (pre-translated) */
    actionLabel?: string;
    /** Callback for CTA button */
    onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    actionLabel,
    onAction,
}) => {
    const { colors, spacing, typography, radius, shadows } = useTheme();

    return (
        <View style={styles.container}>
            <View
                style={[
                    styles.iconCircle,
                    {
                        backgroundColor: colors.accent,
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                    },
                ]}
            >
                <Ionicons name={icon} size={40} color={colors.primary} />
            </View>
            <Text
                style={[
                    styles.title,
                    {
                        color: colors.foreground,
                        fontSize: typography.sizes.lg,
                        fontWeight: typography.weights.semibold,
                        marginBottom: spacing.xs,
                    },
                ]}
            >
                {title}
            </Text>
            <Text
                style={[
                    styles.description,
                    {
                        color: colors.mutedForeground,
                        fontSize: typography.sizes.sm,
                        paddingHorizontal: spacing.xl,
                        marginBottom: spacing.lg,
                    },
                ]}
            >
                {description}
            </Text>
            {actionLabel && onAction && (
                <TouchableOpacity
                    onPress={onAction}
                    style={[
                        styles.actionButton,
                        {
                            backgroundColor: colors.primary,
                            borderRadius: radius.md,
                            paddingHorizontal: spacing.xl,
                            paddingVertical: spacing.sm + 2,
                            ...shadows.soft,
                        },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={actionLabel}
                >
                    <Ionicons
                        name="add-circle-outline"
                        size={20}
                        color="#fff"
                        style={{ marginRight: spacing.xs }}
                    />
                    <Text
                        style={{
                            color: '#fff',
                            fontSize: typography.sizes.md,
                            fontWeight: typography.weights.semibold,
                        }}
                    >
                        {actionLabel}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    iconCircle: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        textAlign: 'center',
    },
    description: {
        textAlign: 'center',
        lineHeight: 20,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
