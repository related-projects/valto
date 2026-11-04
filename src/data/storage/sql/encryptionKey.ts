/**
 * Database Encryption Key
 *
 * The SQLCipher key lives ONLY in the device's secure keystore
 * (expo-secure-store -> iOS Keychain / Android Keystore), never hardcoded and
 * never in JS-readable storage. Generated once with a CSPRNG (expo-crypto) on
 * first launch, then reused. Losing it makes the DB unreadable - which is the
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

/**
 * Delete the persisted DB key, so the next getOrCreateEncryptionKey() generates
 * a new one. For the recovery Reset only (resetCorruptedStore), once the
 * database files it encrypted are gone: an entry the keystore can no longer
 * decrypt throws on every read, and deleting it is the only way past that
 * (pass 82, Owner decision 2).
 */
export async function deleteEncryptionKey(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY_ALIAS);
}
