/**
 * SQLite Schema
 *
 * Single source of truth for the relational financial schema.
 * Consumed by:
 *  - migration v4 (creates the schema in the app's encrypted DB),
 *  - migrations v5 and v7 (applyOccurrenceKeySchema only), and
 *  - tests/helpers/createTestDb (creates the same schema in-memory).
 *
 * Conventions:
 *  - Monetary amounts are INTEGER minor units of the install's currency, at
 *    10^decimals minor units per major unit, NOT a fixed 100 (the domain
 *    already stores the same integers). At 2 decimals, balance 100000 == 1000.00.
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

/**
 * The recurring occurrence key (REGISTRE V-98), added by migration v7.
 *
 * A rule records the number of its last generated occurrence, and each
 * transaction it generates carries (rule, schedule version, occurrence number)
 * under a partial unique index: the database itself refuses a second row for
 * the same occurrence, whatever zone wrote the first one. Rows that no rule
 * generated keep a NULL key and are not constrained. Verified by
 * recurringOccurrenceKey.test.ts - "unique key: the database refuses a second
 * row..." and "control: rows without a recurring key are not constrained...".
 *
 * Kept apart from SCHEMA_STATEMENTS, which stays the v4..v6 baseline, and
 * idempotent: it is applied by migration v7 to existing databases, and by
 * applySchema - so by v4 - to new ones, whose v5 import already writes these
 * columns through the mappers.
 */
const OCCURRENCE_KEY_COLUMNS: readonly { table: string; column: string; definition: string }[] = [
    { table: 'recurring_rules', column: 'last_generated_index', definition: 'INTEGER' },
    { table: 'recurring_rules', column: 'schedule_version', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'transactions', column: 'recurring_rule_id', definition: 'TEXT' },
    { table: 'transactions', column: 'recurring_schedule_version', definition: 'INTEGER' },
    { table: 'transactions', column: 'recurring_occurrence_index', definition: 'INTEGER' },
];

/** Add the occurrence-key columns that are missing, then the unique index. Idempotent. */
export async function applyOccurrenceKeySchema(db: SqlDatabase): Promise<void> {
    for (const { table, column, definition } of OCCURRENCE_KEY_COLUMNS) {
        const { rows } = await db.execute(`PRAGMA table_info(${table})`);
        if (!rows.some((row) => row.name === column)) {
            await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
    }
    await db.execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_occurrence
            ON transactions (recurring_rule_id, recurring_schedule_version, recurring_occurrence_index)
            WHERE recurring_rule_id IS NOT NULL`,
    );
}

/**
 * The number of a rule's last occurrence (REGISTRE V-114, V-103), added by
 * migration v8. NULL when the rule has no end.
 *
 * Applied the same way as the occurrence key: by migration v8 to existing
 * databases, and by applySchema - so by v4 - to new ones, whose v5 import
 * already writes this column through the mappers. Idempotent.
 */
export async function applyEndOccurrenceSchema(db: SqlDatabase): Promise<void> {
    const { rows } = await db.execute('PRAGMA table_info(recurring_rules)');
    if (!rows.some((row) => row.name === 'end_occurrence_index')) {
        await db.execute('ALTER TABLE recurring_rules ADD COLUMN end_occurrence_index INTEGER');
    }
}

/** Apply the full schema to a database (idempotent). */
export async function applySchema(db: SqlDatabase): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) {
        await db.execute(stmt);
    }
    await applyOccurrenceKeySchema(db);
    await applyEndOccurrenceSchema(db);
}
