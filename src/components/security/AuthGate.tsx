/**
 * AuthGate Component
 *
 * The lock screen rendered (by SecurityGate) IN PLACE OF the authenticated app
 * subtree while the session is locked — not as an overlay on top of it. Renders
 * the PinPad with a biometric shortcut and, during a brute-force lock-out,
 * disables input and shows a live countdown.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSecurity } from '../../core/security/SecurityContext';
import { useTheme } from '../../theme/theme';
import { PinPad } from './PinPad';

export const AuthGate: React.FC = () => {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const {
        securityConfig,
        biometrics,
        unlockWithPin,
        unlockWithBiometrics,
        lockedUntil,
    } = useSecurity();
    const [error, setError] = useState(false);
    const [subtitle, setSubtitle] = useState<string | undefined>();

    // Live "now" ticking each second while a lock-out is active, so the
    // countdown updates and input re-enables the moment it expires.
    const [now, setNow] = useState(() => Date.now());
    const locked = lockedUntil !== null && now < lockedUntil;

    useEffect(() => {
        if (lockedUntil === null) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [lockedUntil]);

    // While locked, surface the countdown as the subtitle.
    useEffect(() => {
        if (!locked || lockedUntil === null) return;
        const seconds = Math.ceil((lockedUntil - now) / 1000);
        setSubtitle(t('security.lockedFor', { seconds }));
    }, [locked, lockedUntil, now, t]);

    const showBiometric = securityConfig?.biometricsEnabled
        && biometrics.available
        && biometrics.enrolled;

    const handlePinComplete = async (pin: string) => {
        const result = await unlockWithPin(pin);
        if (result.ok) return;

        setError(true);
        if (result.locked) {
            // Countdown subtitle is driven by the effect above.
        } else {
            setSubtitle(t('security.wrongPin', { remaining: result.attemptsRemaining }));
        }
        setTimeout(() => setError(false), 600);
    };

    const handleBiometric = async () => {
        await unlockWithBiometrics();
    };

    return (
        <View style={[
            styles.overlay,
            {
                backgroundColor: colors.background,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
            },
        ]}>
            <PinPad
                onComplete={handlePinComplete}
                showBiometricButton={showBiometric && !locked}
                onBiometricPress={handleBiometric}
                title={t('security.enterPin')}
                subtitle={subtitle}
                error={error}
                disabled={locked}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
    },
});
