/**
 * About Valto Screen
 *
 * Displays app information: name, version, description, and contact.
 *
 * The version and build number are read from the RUNNING BINARY through
 * expo-application, not from expoConfig. eas.json sets
 * cli.appVersionSource: "remote", so EAS stamps the build number into the
 * native project and never into the config that ships to Constants: the old
 * `Constants.expoConfig?.ios?.buildNumber ?? ... ?? '1'` had both branches
 * undefined in every build and printed a confident "1" forever.
 *
 * expo-application returns `string | null` - null on web, and on any platform
 * that has nothing to report. A row with no value is not rendered rather than
 * filled with a placeholder: that is what removed the need for an 'N/A' key,
 * and it is also what makes InfoRow's `value: string` honest again.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';

// ─── Static Data ──────────────────────────────────────────────────────

const APP_NAME = 'Valto';
const CONTACT_EMAIL = 'renkakpo@gmail.com';

// ─── Info Row Component ───────────────────────────────────────────────

interface InfoRowProps {
    label: string;
    value: string;
}

const InfoRow: React.FC<InfoRowProps> = React.memo(function InfoRow({ label, value }: InfoRowProps) {
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
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Read at render rather than at import: these are native constants, and a
    // module-level read runs before the test harness - or a host that reports
    // nothing - can be observed.
    const appVersion = Application.nativeApplicationVersion;
    const buildNumber = Application.nativeBuildVersion;
    const sdkVersion = Constants.expoConfig?.sdkVersion ?? null;

    const handleEmailPress = () => {
        Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {
            // Silently fail - email client may not be configured
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
                    {t('about.title')}
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
                    {/* The app's own icon - the file app.json declares as `icon`,
                        so the one screen that names the app shows what the
                        launcher shows. borderRadius sits on the Image rather than
                        on overflow:'hidden' on the circle, which Android does not
                        clip reliably. No tintColor: the artwork carries its own
                        colours. Decorative on purpose - the title beside it
                        already announces the app, and a label here would be read
                        out twice. */}
                    <Image
                        source={require('../../assets/images/icon.png')}
                        style={{ width: 72, height: 72, borderRadius: radius.full }}
                        resizeMode="cover"
                        testID="about_app_logo"
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                    />
                </View>
                <Text style={{
                    color: colors.accentForeground,
                    fontSize: typography.sizes['2xl'],
                    fontWeight: 'bold',
                    marginTop: spacing.md,
                }}>
                    {APP_NAME}
                </Text>
                {appVersion !== null && (
                    <Text style={{
                        color: colors.accentForeground,
                        fontSize: typography.sizes.sm,
                        opacity: 0.8,
                        marginTop: 2,
                    }}>
                        {t('about.version', { version: appVersion })}
                    </Text>
                )}
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
                    {t('about.about')}
                </Text>
                <Text style={{
                    color: colors.mutedForeground,
                    fontSize: typography.sizes.sm,
                    lineHeight: 22,
                }}>
                    {t('about.description')}
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
                {appVersion !== null && (
                    <InfoRow label={t('about.appVersion')} value={appVersion} />
                )}
                {buildNumber !== null && (
                    <InfoRow label={t('about.buildNumber')} value={buildNumber} />
                )}
                {sdkVersion !== null && (
                    <InfoRow label={t('about.sdkVersion')} value={sdkVersion} />
                )}
                <InfoRow label={t('about.architecture')} value={t('about.architectureValue')} />
                <InfoRow label={t('about.storage')} value={t('about.storageValue')} />
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
                    {t('about.contact')}
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
                {t('about.footer')}
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
