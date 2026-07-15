/**
 * Store Recovery Screen
 *
 * Shown INSTEAD of the authenticated app when boot detects an unreadable store
 * (DB init / migration failure, or the fast health-check read throwing). It is a
 * dead-end recovery surface — no navigation, no data hooks — so the corrupted
 * store is never queried in a retry loop.
 *
 * Two actions:
 *  - "Try again" re-runs the boot sequence (transient failure may clear).
 *  - "Reset data" performs a filesystem-level wipe behind an explicit, nested
 *    confirmation. There is no backend backup, so the wipe is unrecoverable.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/theme';

interface StoreRecoveryScreenProps {
    /** Re-run the boot/init sequence. */
    onRetry: () => void;
    /** Erase the local store and rebuild a fresh encrypted DB. */
    onReset: () => void | Promise<void>;
    /** True while a reset is in progress (disables actions, shows spinner). */
    busy?: boolean;
}

export const StoreRecoveryScreen: React.FC<StoreRecoveryScreenProps> = ({
    onRetry,
    onReset,
    busy = false,
}) => {
    const { t } = useTranslation();
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();

    const confirmReset = () => {
        Alert.alert(
            t('storeRecovery.confirmTitle'),
            t('storeRecovery.confirmBody'),
            [
                { text: t('storeRecovery.cancel'), style: 'cancel' },
                {
                    text: t('storeRecovery.confirmCta'),
                    style: 'destructive',
                    onPress: () => {
                        void onReset();
                    },
                },
            ],
        );
    };

    return (
        <View
            testID="store-recovery-screen"
            style={[
                styles.container,
                {
                    backgroundColor: colors.background,
                    paddingTop: insets.top + spacing['2xl'],
                    paddingBottom: insets.bottom + spacing.xl,
                    paddingHorizontal: spacing.xl,
                },
            ]}
        >
            <View style={styles.content}>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes['2xl'],
                        fontWeight: typography.weights.bold,
                        marginBottom: spacing.md,
                    }}
                >
                    {t('storeRecovery.title')}
                </Text>
                <Text
                    style={{
                        color: colors.mutedForeground,
                        fontSize: typography.sizes.md,
                        lineHeight: typography.sizes.md * 1.5,
                    }}
                >
                    {t('storeRecovery.body')}
                </Text>
            </View>

            <View style={{ gap: spacing.sm }}>
                <Button
                    title={t('storeRecovery.reset')}
                    onPress={confirmReset}
                    variant="destructive"
                    size="lg"
                    loading={busy}
                    testID="store-recovery-reset"
                />
                <Button
                    title={t('storeRecovery.tryAgain')}
                    onPress={onRetry}
                    variant="outline"
                    size="lg"
                    disabled={busy}
                    testID="store-recovery-retry"
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
});
