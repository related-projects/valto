/**
 * SQLite Schema
 *
 * Single source of truth for the relational financial schema.
 * Consumed by:
 *  - migration v4 (creates the schema in the app's encrypted DB), and
 *  - tests/helpers/createTestDb (creates the same schema in-memory).
 *
 * Conventions:
 *  - Monetary amounts are INTEGER cents (the domain already uses integer
 *    cents; e.g. balance 100000 == 1000.00).
 *  - Dates are stored as ISO-8601 TEXT (UTC, sortable lexicographically),
 *    mirroring the previous serialize / deserialize behaviour.
 *  - `wallets.opening_balance` is the ledger anchor:
 *    recompute = opening_balance + Σ ledgerEffect(transactions of the wallet).
 */

import type { SqlDatabase } from './SqlDatabase';

/** The financial tables, in dependency order. Used for reset/clear. */
export const FINANCIAL_TABLES = [
    'transactions',
    'budgets',
    'recurring_rules',
    'wallets',
    'categories',
] as const;

/** Ordered DDL statements. All idempotent (`IF NOT EXISTS`). */
export const SCHEMA_STATEMENTS: string[] = [
    `CREATE TABLE IF NOT EXISTS wallets (
        id              TEXT PRIMARY KEY NOT NULL,
        name            TEXT NOT NULL,
        balance         INTEGER NOT NULL,
        opening_balance INTEGER NOT NULL,
        type            TEXT NOT NULL,
        color           TEXT,
        created_at      TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
        id    TEXT PRIMARY KEY NOT NULL,
        name  TEXT NOT NULL,
        type  TEXT NOT NULL,
        icon  TEXT,
        color TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
        id          TEXT PRIMARY KEY NOT NULL,
        type        TEXT NOT NULL,
        amount      INTEGER NOT NULL,
        category_id TEXT NOT NULL,
        wallet_id   TEXT NOT NULL,
        date        TEXT NOT NULL,
        note        TEXT,
        created_at  TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS budgets (
        id           TEXT PRIMARY KEY NOT NULL,
        category_id  TEXT NOT NULL,
        month        TEXT NOT NULL,
        limit_amount INTEGER NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS recurring_rules (
        id                  TEXT PRIMARY KEY NOT NULL,
        type                TEXT NOT NULL,
        amount              INTEGER NOT NULL,
        wallet_id           TEXT NOT NULL,
        category_id         TEXT NOT NULL,
        description         TEXT,
        start_date          TEXT NOT NULL,
        end_date            TEXT,
        frequency           TEXT NOT NULL,
        interval_count      INTEGER NOT NULL,
        last_generated_date TEXT NOT NULL,
        is_paused           INTEGER NOT NULL,
        created_at          TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_wallet   ON transactions (wallet_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions (date)`,
    `CREATE INDEX IF NOT EXISTS idx_budgets_month         ON budgets (month)`,
];

/** Apply the full schema to a database (idempotent). */
export async function applySchema(db: SqlDatabase): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) {
        await db.execute(stmt);
    }
}
