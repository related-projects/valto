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

    /** Key for storing recurring transaction rules */
    RECURRING_RULES: '@valto:recurring_rules',

    /** Key for tracking the current data schema version (migration runner) */
    SCHEMA_VERSION: '@valto:schema_version',
} as const;

export type StorageKey = typeof StorageKeys[keyof typeof StorageKeys];

/**
 * The legacy key-value copies of the financial entities, every one of which is
 * now owned by SQLite.
 *
 * Two callers must agree on this list exactly: migration v6 purges it once the
 * import flag proves the data reached SQLite, and resetCorruptedStore removes it
 * alongside the rebuild pointers. They used to hold a literal copy each, bound
 * by nothing but a comment. A key added to one and forgotten in the other leaves
 * a cleartext copy of financial data on disk after an operation that claimed to
 * remove it, so the list lives here and both consumers import it.
 */
export const LEGACY_KV_FINANCIAL_KEYS = [
    StorageKeys.WALLETS,
    StorageKeys.TRANSACTIONS,
    StorageKeys.CATEGORIES,
    StorageKeys.BUDGETS,
    StorageKeys.RECURRING_RULES,
] as const;

export type LegacyKvFinancialKey = typeof LEGACY_KV_FINANCIAL_KEYS[number];
