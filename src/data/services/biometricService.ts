/**
 * Biometric Service
 *
 * Abstraction over expo-local-authentication.
 * Handles device capability checks and authentication prompts.
 * Never coupled to UI components directly.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import type { BiometricCapability } from '../../domain/security/types';

/**
 * Check if the device supports biometric authentication
 * and whether the user has enrolled biometric data.
 */
export async function checkBiometricCapability(): Promise<BiometricCapability> {
    try {
        const available = await LocalAuthentication.hasHardwareAsync();
        const enrolled = available ? await LocalAuthentication.isEnrolledAsync() : false;
        const types = available
            ? await LocalAuthentication.supportedAuthenticationTypesAsync()
            : [];

        const typeLabels = types.map(t => {
            switch (t) {
                case LocalAuthentication.AuthenticationType.FINGERPRINT:
                    return 'Fingerprint';
                case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
                    return 'Face ID';
                case LocalAuthentication.AuthenticationType.IRIS:
                    return 'Iris';
                default:
                    return 'Unknown';
            }
        });

        return {
            available,
            enrolled,
            biometricTypes: typeLabels,
        };
    } catch {
        return {
            available: false,
            enrolled: false,
            biometricTypes: [],
        };
    }
}

/**
 * Prompt the user for biometric authentication.
 *
 * @returns true if authentication succeeded, false if failed or cancelled
 */
export async function authenticateWithBiometrics(
    promptMessage = 'Authenticate to access Valto',
): Promise<boolean> {
    try {
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage,
            fallbackLabel: 'Use PIN',
            disableDeviceFallback: true, // We handle PIN fallback ourselves
            cancelLabel: 'Cancel',
        });
        return result.success;
    } catch {
        return false;
    }
}
