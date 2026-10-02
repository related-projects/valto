/**
 * Restore Wait Screen (REGISTRE V-119, V-106; Owner decision 1, pass 74)
 *
 * One full-screen, blocking wait screen shown while a restore runs, from the
 * confirmed start until the restore call settles, post-restore catch-up
 * included (see restoringState.ts).
 *
 * A restore replaces the whole ledger and then runs the recurring engine.
 * Anything the user could start meanwhile - a backup, an entry, an edit -
 * either read the restore's uncommitted rows or waited behind it and then ran
 * against data it was never shown. So nothing is left reachable:
 *  - a Modal is its own window, above the navigator, the tab bar and its add
 *    button, and above the lock screen;
 *  - it is mounted by the root layout above SecurityProvider, so it stays up
 *    when the app locks itself and unmounts the navigator mid-restore;
 *  - onRequestClose does nothing, so the Android back button cannot dismiss
 *    it. It has no other control.
 * Verified by restoreWaitScreen.test.tsx - "V-119/V-106 a" to "f".
 *
 * The copy reuses the settings keys the restore item and its old progress
 * banner already show.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useRestoring } from '../../core/restore/restoringState';
import { useTheme } from '../../theme/theme';

/** The Android back button must not dismiss the wait screen. */
const ignoreBackButton = () => undefined;

export const RestoreWaitScreen: React.FC = () => {
    const restoring = useRestoring();
    const { colors, spacing, typography } = useTheme();
    const { t } = useTranslation();

    return (
        <Modal
            visible={restoring}
            transparent={false}
            animationType="fade"
            statusBarTranslucent
            onRequestClose={ignoreBackButton}
        >
            <View
                testID="restore-wait-screen"
                accessibilityViewIsModal
                accessibilityLiveRegion="polite"
                style={[styles.container, { backgroundColor: colors.background, padding: spacing.xl }]}
            >
                <ActivityIndicator size="large" color={colors.primary} />
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes.xl,
                        fontWeight: typography.weights.bold,
                        marginTop: spacing.lg,
                        textAlign: 'center',
                    }}
                >
                    {t('settings.restoreData')}
                </Text>
                <Text
                    style={{
                        color: colors.mutedForeground,
                        fontSize: typography.sizes.md,
                        marginTop: spacing.sm,
                        textAlign: 'center',
                    }}
                >
                    {t('settings.processing')}
                </Text>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
