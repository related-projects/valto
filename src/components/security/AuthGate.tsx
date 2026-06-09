/**
 * AuthGate Component
 *
 * Full-screen overlay shown when the app is locked.
 * Renders PinPad with biometric shortcut.
 * Blocks all interaction until user authenticates.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSecurity } from '../../core/security/SecurityContext';
import { MAX_PIN_ATTEMPTS } from '../../domain/security/types';
import { useTheme } from '../../theme/theme';
import { PinPad } from './PinPad';

export const AuthGate: React.FC = () => {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const {
        isUnlocked,
        isSecurityEnabled,
        securityConfig,
        biometrics,
        unlockWithPin,
        unlockWithBiometrics,
        failedAttempts,
        loading,
    } = useSecurity();
    const [error, setError] = useState(false);
    const [subtitle, setSubtitle] = useState<string | undefined>();

    // Don't render if unlocked, not enabled, or still loading
    if (isUnlocked || !isSecurityEnabled || loading) {
        return null;
    }

    const showBiometric = securityConfig?.biometricsEnabled
        && biometrics.available
        && biometrics.enrolled;

    const handlePinComplete = async (pin: string) => {
        const success = await unlockWithPin(pin);
        if (!success) {
            setError(true);
            const remaining = MAX_PIN_ATTEMPTS - (failedAttempts + 1);
            if (remaining > 0) {
                setSubtitle(t('security.wrongPin', { remaining }));
            } else {
                setSubtitle(t('security.tooManyAttempts'));
            }
            setTimeout(() => setError(false), 600);
        }
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
                showBiometricButton={showBiometric}
                onBiometricPress={handleBiometric}
                title={t('security.enterPin')}
                subtitle={subtitle}
                error={error}
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
