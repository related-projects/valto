/**
 * Storage Keys
 * 
 * Centralized constants for all AsyncStorage keys.
 * Keys are namespaced with @valto: to avoid collisions with other apps or libraries.
 */

export const StorageKeys = {
    /** Key for storing all transactions */
    TRANSACTIONS: '@valto:transactions',

    /** Key for storing all wallets */
    WALLETS: '@valto:wallets',

    /** Key for storing all categories */
    CATEGORIES: '@valto:categories',

    /** Key for storing all budgets */
    BUDGETS: '@valto:budgets',

    /** Key for tracking if seed data has been initialized */
    SEED_INITIALIZED: '@valto:seed_initialized',

    /** Key for storing app settings */
    SETTINGS: '@valto:settings',

    /** Key for storing security configuration (PIN hash, biometric settings) */
    SECURITY_CONFIG: '@valto:security_config',

    /** Key for tracking the current data schema version (migration runner) */
    SCHEMA_VERSION: '@valto:schema_version',
} as const;

export type StorageKey = typeof StorageKeys[keyof typeof StorageKeys];
