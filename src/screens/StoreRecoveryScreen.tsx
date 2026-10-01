/**
 * Store Recovery Screen
 *
 * Shown INSTEAD of the authenticated app when boot detects an unreadable store
 * (DB init / migration failure, or the fast health-check read throwing). It is a
 * dead-end recovery surface - no navigation, no data hooks - so the corrupted
 * store is never queried in a retry loop.
 *
 * Two actions:
 *  - "Try again" re-runs the boot sequence (transient failure may clear).
 *  - "Reset data" performs a filesystem-level wipe behind an explicit, nested
 *    confirmation. There is no backend backup, so the wipe is unrecoverable.
 */

import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/ui/Button';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { useTheme } from '../theme/theme';

interface StoreRecoveryScreenProps {
    /** Re-run the boot/init sequence. */
    onRetry: () => void | Promise<void>;
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

    // One lock for both buttons (REGISTRE V-109, W12; Owner decision of 01/10,
    // pass 69). Both actions run the boot migrations, which write outside the
    // runner queue, so each must run alone. `busy` covers only a confirmed
    // reset, and like any state-driven `disabled` it reaches the buttons only
    // once React has committed: a second press in the same event batch got
    // through (REGISTRE V-112). The first press on either button takes the
    // lock and holds it until its action settles - the boot sequence has
    // ended, or the confirmation was cancelled or closed, or the confirmed
    // reset has ended. Every press made meanwhile, on either button, is
    // ignored. `pressed` is read once, by the press that takes the lock; an
    // ignored press never runs what it wrote there. Verified by
    // storeRecoveryLock.test.tsx - "V-109 W12 a", "V-109 W12 b", "V-109 W12 c"
    // and the controls.
    const pressed = useRef<() => Promise<void>>(async () => undefined);
    const runExclusive = useSubmitLock(() => pressed.current());
    const press = (action: () => Promise<void>) => () => {
        pressed.current = action;
        void runExclusive();
    };

    const retry = async () => {
        await onRetry();
    };

    const reset = async () => {
        await onReset();
    };

    // Settles once the confirmation is closed: at once when it is cancelled or
    // closed without a choice; when it is confirmed, once the reset has
    // settled. onReset is still called inside the confirm callback. Android
    // reports a dialog closed without a button as a dismissal, which only
    // onDismiss receives.
    const confirmReset = () =>
        new Promise<void>((resolve) => {
            Alert.alert(
                t('storeRecovery.confirmTitle'),
                t('storeRecovery.confirmBody'),
                [
                    { text: t('storeRecovery.cancel'), style: 'cancel', onPress: () => resolve() },
                    {
                        text: t('storeRecovery.confirmCta'),
                        style: 'destructive',
                        onPress: () => resolve(reset()),
                    },
                ],
                { onDismiss: () => resolve() },
            );
        });

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
                    onPress={press(confirmReset)}
                    variant="destructive"
                    size="lg"
                    loading={busy}
                    testID="store-recovery-reset"
                />
                <Button
                    title={t('storeRecovery.tryAgain')}
                    onPress={press(retry)}
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
