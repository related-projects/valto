/**
 * ExportScreen
 *
 * Allows users to export transaction data as CSV or generate
 * a monthly PDF report and share via the native share sheet.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExport } from '../hooks/useExport';
import { useTheme } from '../theme/theme';

// ─── Month Picker ─────────────────────────────────────────────────────

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Component ────────────────────────────────────────────────────────

export const ExportScreen: React.FC = () => {
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
            Alert.alert('Export Failed', error instanceof Error ? error.message : 'Could not export CSV');
        }
    }, [exportCSV]);

    const handleExportPDF = useCallback(async () => {
        try {
            await exportMonthlyPDF(selectedYear, selectedMonth);
        } catch (error) {
            Alert.alert('Export Failed', error instanceof Error ? error.message : 'Could not generate PDF');
        }
    }, [exportMonthlyPDF, selectedYear, selectedMonth]);

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
                    <TouchableOpacity onPress={() => router.back()} style={{ marginRight: spacing.md }}>
                        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{
                        color: colors.foreground,
                        fontSize: typography.sizes.xl,
                        fontWeight: typography.weights.bold,
                    }}>
                        Export Data
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
                        Generating export...
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
                            Export CSV
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                            All transactions as spreadsheet
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
                            Monthly PDF Report
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                            Income, expenses & transaction table
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
                    <Pressable onPress={() => adjustMonth(-1)} hitSlop={12}>
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
                        {MONTHS[selectedMonth - 1]} {selectedYear}
                    </Text>
                    <Pressable onPress={() => adjustMonth(1)} hitSlop={12}>
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
                >
                    <Ionicons name="share-outline" size={18} color="#fff" style={{ marginRight: spacing.xs }} />
                    <Text style={{ color: '#fff', fontSize: typography.sizes.md, fontWeight: '600' }}>
                        Generate & Share PDF
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
