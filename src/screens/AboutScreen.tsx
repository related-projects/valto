/**
 * About Valto Screen
 *
 * Displays app information: name, version, description, and contact.
 * Reads version dynamically from expo config.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';

// ─── Static Data ──────────────────────────────────────────────────────

const APP_NAME = 'Valto';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const BUILD_NUMBER = Constants.expoConfig?.ios?.buildNumber
    ?? Constants.expoConfig?.android?.versionCode?.toString()
    ?? '1';
const CONTACT_EMAIL = 'renkakpo@gmail.com';
const SDK_VERSION = Constants.expoConfig?.sdkVersion ?? 'N/A';

// ─── Info Row Component ───────────────────────────────────────────────

interface InfoRowProps {
    label: string;
    value: string;
}

const InfoRow: React.FC<InfoRowProps> = React.memo(({ label, value }) => {
    const { colors, spacing, typography } = useTheme();
    return (
        <View
            style={[
                styles.infoRow,
                {
                    paddingVertical: spacing.sm + 2,
                    borderBottomColor: colors.border,
                },
            ]}
        >
            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>{label}</Text>
            <Text style={{ color: colors.foreground, fontSize: typography.sizes.sm, fontWeight: '500' }}>{value}</Text>
        </View>
    );
});

// ─── Screen ───────────────────────────────────────────────────────────

export const AboutScreen = () => {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const handleEmailPress = () => {
        Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {
            // Silently fail — email client may not be configured
        });
    };

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingTop: insets.top + spacing.md,
                paddingBottom: spacing.tabBarOffset,
                paddingHorizontal: spacing.md,
            }}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes['2xl'],
                        fontWeight: 'bold',
                        marginLeft: spacing.sm,
                    }}
                >
                    About Valto
                </Text>
            </View>

            {/* App Identity */}
            <View style={[styles.identityCard, {
                backgroundColor: colors.accent,
                borderRadius: radius.xl,
                padding: spacing.lg,
                marginBottom: spacing.lg,
                ...shadows.card,
            }]}>
                <View style={[styles.logoCircle, {
                    backgroundColor: colors.accentForeground + '22',
                    borderRadius: radius.full,
                }]}>
                    <Text style={{ fontSize: 32 }}>💰</Text>
                </View>
                <Text style={{
                    color: colors.accentForeground,
                    fontSize: typography.sizes['2xl'],
                    fontWeight: 'bold',
                    marginTop: spacing.md,
                }}>
                    {APP_NAME}
                </Text>
                <Text style={{
                    color: colors.accentForeground,
                    fontSize: typography.sizes.sm,
                    opacity: 0.8,
                    marginTop: 2,
                }}>
                    Version {APP_VERSION}
                </Text>
            </View>

            {/* Description */}
            <View style={[styles.section, {
                backgroundColor: colors.card,
                borderRadius: radius.md,
                padding: spacing.md,
                marginBottom: spacing.lg,
                ...shadows.card,
            }]}>
                <Text style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.md,
                    fontWeight: '600',
                    marginBottom: spacing.sm,
                }}>
                    About
                </Text>
                <Text style={{
                    color: colors.mutedForeground,
                    fontSize: typography.sizes.sm,
                    lineHeight: 22,
                }}>
                    Valto is an offline-first personal budget tracking app designed for simplicity and privacy.
                    All your financial data stays on your device, no accounts, no cloud sync, no tracking.
                    Take control of your spending with wallets, budgets, categories, and intelligent financial insights.
                </Text>
            </View>

            {/* App Info */}
            <View style={[styles.section, {
                backgroundColor: colors.card,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                marginBottom: spacing.lg,
                ...shadows.card,
            }]}>
                <InfoRow label="App Version" value={APP_VERSION} />
                <InfoRow label="Build Number" value={BUILD_NUMBER} />
                <InfoRow label="SDK Version" value={SDK_VERSION} />
                <InfoRow label="Architecture" value="Offline-first, Clean Architecture" />
                <InfoRow label="Storage" value="On-device only" />
            </View>

            {/* Contact */}
            <View style={[styles.section, {
                backgroundColor: colors.card,
                borderRadius: radius.md,
                padding: spacing.md,
                marginBottom: spacing.lg,
                ...shadows.card,
            }]}>
                <Text style={{
                    color: colors.foreground,
                    fontSize: typography.sizes.md,
                    fontWeight: '600',
                    marginBottom: spacing.sm,
                }}>
                    Contact
                </Text>
                <TouchableOpacity onPress={handleEmailPress} style={styles.emailRow}>
                    <Ionicons name="mail-outline" size={18} color={colors.primary} />
                    <Text style={{
                        color: colors.primary,
                        fontSize: typography.sizes.sm,
                        marginLeft: spacing.sm,
                    }}>
                        {CONTACT_EMAIL}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Footer */}
            <Text style={{
                color: colors.mutedForeground,
                fontSize: typography.sizes.xs,
                textAlign: 'center',
                marginTop: spacing.md,
                opacity: 0.6,
            }}>
                Made with ❤️ for people who value financial awareness.
            </Text>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    identityCard: {
        alignItems: 'center',
    },
    logoCircle: {
        width: 72,
        height: 72,
        alignItems: 'center',
        justifyContent: 'center',
    },
    section: {},
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    emailRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
