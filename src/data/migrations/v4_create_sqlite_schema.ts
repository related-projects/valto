/**
 * v4 — Create SQLite Schema
 *
 * Creates the relational financial schema (wallets, transactions, categories,
 * budgets, recurring_rules) in the encrypted SqlDatabase. Idempotent — every
 * statement uses `IF NOT EXISTS`.
 */

import { applySchema } from '../storage/sql/schema';
import type { Migration } from './migrationRunner';

export const v4_create_sqlite_schema: Migration = {
    version: 4,
    name: 'create_sqlite_schema',
    up: async ({ db }) => {
        await applySchema(db);
    },
};
