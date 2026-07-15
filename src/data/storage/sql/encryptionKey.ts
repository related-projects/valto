/**
 * Database Encryption Key
 *
 * The SQLCipher key lives ONLY in the device's secure keystore
 * (expo-secure-store → iOS Keychain / Android Keystore), never hardcoded and
 * never in JS-readable storage. Generated once with a CSPRNG (expo-crypto) on
 * first launch, then reused. Losing it makes the DB unreadable — which is the
 * point: data at rest is useless without the keystore-held key.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_ALIAS = 'valto.db.encryption_key';

/** Return the persisted DB key, generating and storing one on first run. */
export async function getOrCreateEncryptionKey(): Promise<string> {
    const existing = await SecureStore.getItemAsync(KEY_ALIAS);
    if (existing) {
        return existing;
    }

    const bytes = await Crypto.getRandomBytesAsync(32); // 256-bit key
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    await SecureStore.setItemAsync(KEY_ALIAS, hex, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });

    return hex;
}
