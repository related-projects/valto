/**
 * ExportScreen
 *
 * Allows users to export transaction data as CSV or generate
 * a monthly PDF report and share via the native share sheet.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExport } from '../hooks/useExport';
import { useTheme } from '../theme/theme';
import { getButtonA11y } from '../utils/accessibility';

// ─── Month Keys (i18n) ────────────────────────────────────────────────

const MONTH_KEYS = [
    'export.months.january', 'export.months.february', 'export.months.march',
    'export.months.april', 'export.months.may', 'export.months.june',
    'export.months.july', 'export.months.august', 'export.months.september',
    'export.months.october', 'export.months.november', 'export.months.december',
];

// ─── Component ────────────────────────────────────────────────────────

export const ExportScreen: React.FC = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { exportCSV, exportMonthlyPDF, loading } = useExport();

    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

    const handleExportCSV = useCallback(async () => {
        try {
            await exportCSV();
        } catch (error) {
            Alert.alert(t('export.exportFailed'), error instanceof Error ? error.message : t('export.exportFailedMessage'));
        }
    }, [exportCSV, t]);

    const handleExportPDF = useCallback(async () => {
        try {
            await exportMonthlyPDF(selectedYear, selectedMonth);
        } catch (error) {
            Alert.alert(t('export.exportFailed'), error instanceof Error ? error.message : t('export.exportFailedMessage'));
        }
    }, [exportMonthlyPDF, selectedYear, selectedMonth, t]);

    const adjustMonth = (delta: number) => {
        let m = selectedMonth + delta;
        let y = selectedYear;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        setSelectedMonth(m);
        setSelectedYear(y);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={{
                paddingTop: insets.top,
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.md,
                backgroundColor: colors.card,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={{ marginRight: spacing.md }}
                        {...getButtonA11y(t('a11y.backButton'))}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{
                        color: colors.foreground,
                        fontSize: typography.sizes.xl,
                        fontWeight: typography.weights.bold,
                    }}>
                        {t('export.title')}
                    </Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{
                    paddingTop: spacing.md,
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing.xl * 2,
                }}
                showsVerticalScrollIndicator={false}
            >

            {/* Loading */}
            {loading && (
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: spacing.sm,
                    marginBottom: spacing.md,
                    backgroundColor: colors.accent,
                    borderRadius: radius.md,
                }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginLeft: spacing.sm }}>
                        {t('export.generating')}
                    </Text>
                </View>
            )}

            {/* CSV Export Card */}
            <Pressable
                onPress={handleExportCSV}
                disabled={loading}
                style={{
                    backgroundColor: colors.card,
                    borderRadius: radius.lg,
                    padding: spacing.lg,
                    marginBottom: spacing.lg,
                    ...shadows.card,
                    opacity: loading ? 0.6 : 1,
                }}
                {...getButtonA11y(t('export.csvTitle'))}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                    <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: colors.accent,
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: spacing.md,
                    }}>
                        <Ionicons name="document-text-outline" size={24} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: '600' }}>
                            {t('export.csvTitle')}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                            {t('export.csvDescription')}
                        </Text>
                    </View>
                    <Ionicons name="share-outline" size={22} color={colors.primary} />
                </View>
            </Pressable>

            {/* PDF Export Section */}
            <View style={{
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                padding: spacing.lg,
                ...shadows.card,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                    <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: colors.accent,
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: spacing.md,
                    }}>
                        <Ionicons name="document-outline" size={24} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: '600' }}>
                            {t('export.pdfTitle')}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                            {t('export.pdfDescription')}
                        </Text>
                    </View>
                </View>

                {/* Month Selector */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.background,
                    borderRadius: radius.md,
                    padding: spacing.sm,
                    marginBottom: spacing.md,
                }}>
                    <Pressable
                        onPress={() => adjustMonth(-1)}
                        hitSlop={12}
                        {...getButtonA11y(t('a11y.previousMonth'))}
                    >
                        <Ionicons name="chevron-back" size={24} color={colors.primary} />
                    </Pressable>
                    <Text style={{
                        color: colors.foreground,
                        fontSize: typography.sizes.md,
                        fontWeight: '600',
                        marginHorizontal: spacing.lg,
                        minWidth: 140,
                        textAlign: 'center',
                    }}>
                        {t(MONTH_KEYS[selectedMonth - 1])} {selectedYear}
                    </Text>
                    <Pressable
                        onPress={() => adjustMonth(1)}
                        hitSlop={12}
                        {...getButtonA11y(t('a11y.nextMonth'))}
                    >
                        <Ionicons name="chevron-forward" size={24} color={colors.primary} />
                    </Pressable>
                </View>

                {/* Generate Button */}
                <Pressable
                    onPress={handleExportPDF}
                    disabled={loading}
                    style={{
                        backgroundColor: colors.primary,
                        borderRadius: radius.md,
                        padding: spacing.sm + 2,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        opacity: loading ? 0.6 : 1,
                    }}
                    {...getButtonA11y(t('export.generatePdf'))}
                >
                    <Ionicons name="share-outline" size={18} color="#fff" style={{ marginRight: spacing.xs }} />
                    <Text style={{ color: '#fff', fontSize: typography.sizes.md, fontWeight: '600' }}>
                        {t('export.generatePdf')}
                    </Text>
                </Pressable>
            </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
