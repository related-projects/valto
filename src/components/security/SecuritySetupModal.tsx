/**
 * SecuritySetupModal
 *
 * Multi-step flow for setting up or disabling security:
 * 1. Enter PIN
 * 2. Confirm PIN
 * 3. Optional biometric enrollment
 * 4. Success
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSecurity } from '../../core/security/SecurityContext';
import { useTheme } from '../../theme/theme';
import { PinPad } from './PinPad';

interface SecuritySetupModalProps {
    visible: boolean;
    onClose: () => void;
}

type SetupStep = 'enter' | 'confirm' | 'biometric' | 'done';

export const SecuritySetupModal: React.FC<SecuritySetupModalProps> = ({
    visible,
    onClose,
}) => {
    const { colors, spacing, typography, radius } = useTheme();
    const insets = useSafeAreaInsets();
    const { enableSecurity, biometrics } = useSecurity();

    const [step, setStep] = useState<SetupStep>('enter');
    const [firstPin, setFirstPin] = useState('');
    const [error, setError] = useState(false);
    const [subtitle, setSubtitle] = useState<string | undefined>();

    const reset = useCallback(() => {
        setStep('enter');
        setFirstPin('');
        setError(false);
        setSubtitle(undefined);
    }, []);

    const handleClose = useCallback(() => {
        reset();
        onClose();
    }, [reset, onClose]);

    // Step 1: Enter PIN
    const handleEnterPin = useCallback((pin: string) => {
        setFirstPin(pin);
        setStep('confirm');
        setSubtitle(undefined);
        setError(false);
    }, []);

    // Step 2: Confirm PIN
    const handleConfirmPin = useCallback((pin: string) => {
        if (pin !== firstPin) {
            setError(true);
            setSubtitle("PINs don't match. Try again.");
            setTimeout(() => {
                setError(false);
                setStep('enter');
                setFirstPin('');
                setSubtitle(undefined);
            }, 1000);
            return;
        }

        // PINs match — check if biometrics available
        if (biometrics.available && biometrics.enrolled) {
            setStep('biometric');
        } else {
            // No biometrics, enable with PIN only
            enableSecurity(pin, false).then(handleClose);
        }
    }, [firstPin, biometrics, enableSecurity, handleClose]);

    // Step 3: Biometric enrollment
    const handleBiometricChoice = useCallback((useBiometrics: boolean) => {
        enableSecurity(firstPin, useBiometrics).then(handleClose);
    }, [firstPin, enableSecurity, handleClose]);

    // ── Render Steps ──────────────────────────────────────────────────

    const renderContent = () => {
        switch (step) {
            case 'enter':
                return (
                    <PinPad
                        onComplete={handleEnterPin}
                        title="Create a PIN"
                        subtitle={subtitle}
                        error={error}
                    />
                );
            case 'confirm':
                return (
                    <PinPad
                        onComplete={handleConfirmPin}
                        title="Confirm your PIN"
                        subtitle={subtitle}
                        error={error}
                    />
                );
            case 'biometric':
                return (
                    <View style={styles.biometricContainer}>
                        <View style={[styles.iconCircle, { backgroundColor: colors.accent + '22' }]}>
                            <Ionicons name="finger-print-outline" size={48} color={colors.primary} />
                        </View>
                        <Text style={[styles.biometricTitle, { color: colors.foreground, fontSize: typography.sizes.xl }]}>
                            Enable {biometrics.biometricTypes.join(' / ')}?
                        </Text>
                        <Text style={[styles.biometricSubtitle, { color: colors.mutedForeground, fontSize: typography.sizes.sm }]}>
                            Use biometric authentication as a quick alternative to your PIN.
                        </Text>
                        <View style={[styles.buttonRow, { marginTop: spacing.xl }]}>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: colors.muted, borderRadius: radius.md }]}
                                onPress={() => handleBiometricChoice(false)}
                            >
                                <Text style={[styles.buttonText, { color: colors.foreground }]}>Skip</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: colors.primary, borderRadius: radius.md }]}
                                onPress={() => handleBiometricChoice(true)}
                            >
                                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Enable</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={handleClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                {/* Header */}
                <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
                    <TouchableOpacity onPress={handleClose}>
                        <Ionicons name="close" size={24} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        Set Up Security
                    </Text>
                    <View style={{ width: 24 }} />
                </View>

                {renderContent()}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
    },
    biometricContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    iconCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    biometricTitle: {
        fontWeight: '600',
        marginBottom: 8,
        textAlign: 'center',
    },
    biometricSubtitle: {
        textAlign: 'center',
        lineHeight: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 16,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
    },
    buttonText: {
        fontWeight: '600',
        fontSize: 16,
    },
});
