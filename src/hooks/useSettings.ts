/**
 * useSettings Hook
 *
 * Provides settings actions for the Settings screen.
 * Handles export, backup, restore, and reset with proper
 * confirmation dialogs for destructive operations.
 */

import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { createAndShareBackup } from '../data/services/backupService';
import { exportTransactionsToCSV } from '../data/services/exportService';
import { resetAppData } from '../data/services/resetService';

export interface UseSettingsResult {
    /** Export all transactions as CSV */
    exportCSV: () => Promise<void>;
    /** Create and share a backup file */
    createBackup: () => Promise<void>;
    /** Prompt user then restore from a backup snapshot */
    restoreBackup: () => void;
    /** Reset all data with double confirmation */
    resetAllData: () => void;
    /** Whether any setting operation is in progress */
    loading: boolean;
}

export function useSettings(): UseSettingsResult {
    const [loading, setLoading] = useState(false);

    // ── Export CSV ─────────────────────────────────────────────────────
    const exportCSV = useCallback(async () => {
        try {
            setLoading(true);
            await exportTransactionsToCSV();
        } catch (error) {
            Alert.alert('Export Failed', 'Could not export transactions. Please try again.');
            console.error('CSV export error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Backup ────────────────────────────────────────────────────────
    const createBackup = useCallback(async () => {
        try {
            setLoading(true);
            await createAndShareBackup();
        } catch (error) {
            Alert.alert('Backup Failed', 'Could not create backup. Please try again.');
            console.error('Backup error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Restore ───────────────────────────────────────────────────────
    const restoreBackup = useCallback(() => {
        // First confirmation
        Alert.alert(
            'Restore Data',
            'This will replace ALL your current data with the backup. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () => {
                        // Second confirmation
                        Alert.alert(
                            'Are you absolutely sure?',
                            'All current wallets, transactions, categories, and budgets will be permanently replaced.',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Restore Now',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            setLoading(true);
                                            // In a real app, you'd pick a file here via DocumentPicker.
                                            // For now, we show a placeholder message.
                                            Alert.alert(
                                                'Feature Note',
                                                'To restore, import a backup JSON file. File picker integration requires expo-document-picker.',
                                            );
                                        } catch (error) {
                                            Alert.alert('Restore Failed', 'Could not restore backup. Please try again.');
                                            console.error('Restore error:', error);
                                        } finally {
                                            setLoading(false);
                                        }
                                    },
                                },
                            ],
                        );
                    },
                },
            ],
        );
    }, []);

    // ── Reset ─────────────────────────────────────────────────────────
    const resetAllData = useCallback(() => {
        // First confirmation
        Alert.alert(
            'Reset All Data',
            'This will permanently delete ALL your data and reset the app to its initial state.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () => {
                        // Second confirmation
                        Alert.alert(
                            'This cannot be undone!',
                            'Are you absolutely sure you want to erase everything?',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Reset Everything',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            setLoading(true);
                                            await resetAppData();
                                            Alert.alert('Done', 'All data has been reset.');
                                        } catch (error) {
                                            Alert.alert('Reset Failed', 'Could not reset data. Please try again.');
                                            console.error('Reset error:', error);
                                        } finally {
                                            setLoading(false);
                                        }
                                    },
                                },
                            ],
                        );
                    },
                },
            ],
        );
    }, []);

    return {
        exportCSV,
        createBackup,
        restoreBackup,
        resetAllData,
        loading,
    };
}
