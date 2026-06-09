/**
 * Row ↔ Entity Mappers + Generic SQL CRUD
 *
 * Each mapper is the single definition of how a domain entity maps to its
 * table row (column names, date↔ISO, boolean↔0/1, undefined↔NULL). The
 * generic helpers below build INSERT/UPDATE/SELECT/DELETE from a mapper so
 * every repository shares identical, consistent persistence logic.
 */

import { Budget } from '../../../domain/entities/Budget';
import { Category, CategoryType } from '../../../domain/entities/Category';
import {
    RecurrenceFrequency,
    RecurringTransaction,
} from '../../../domain/entities/RecurringTransaction';
import { Transaction, TransactionType } from '../../../domain/entities/Transaction';
import { Wallet, WalletType } from '../../../domain/entities/Wallet';
import type { SqlDatabase } from './SqlDatabase';

type Row = Record<string, unknown>;

/** Maps a domain entity <T> to/from its SQL row. */
export interface EntityMapper<T> {
    table: string;
    toRow(entity: T): Row;
    fromRow(row: Row): T;
}

// ─── Small coercion helpers (SQLite is loosely typed) ───────────────────

const str = (v: unknown): string => String(v);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
const optStr = (v: unknown): string | undefined =>
    v === null || v === undefined ? undefined : String(v);
const nullable = (v: unknown): unknown => (v === undefined ? null : v);

// ─── Mappers ────────────────────────────────────────────────────────────

export const walletMapper: EntityMapper<Wallet> = {
    table: 'wallets',
    toRow(w) {
        // Note: `opening_balance` (ledger anchor) is intentionally NOT mapped
        // here — it is a persistence-only column set once on INSERT and never
        // overwritten by an UPDATE. WalletRepository manages it explicitly.
        return {
            id: w.id,
            name: w.name,
            balance: w.balance,
            type: w.type,
            color: nullable(w.color),
            created_at: w.createdAt.toISOString(),
        };
    },
    fromRow(r) {
        return {
            id: str(r.id),
            name: str(r.name),
            balance: num(r.balance),
            type: str(r.type) as WalletType,
            color: optStr(r.color),
            createdAt: new Date(str(r.created_at)),
        };
    },
};

export const transactionMapper: EntityMapper<Transaction> = {
    table: 'transactions',
    toRow(t) {
        return {
            id: t.id,
            type: t.type,
            amount: t.amount,
            category_id: t.categoryId,
            wallet_id: t.walletId,
            date: t.date.toISOString(),
            note: nullable(t.note),
            created_at: t.createdAt.toISOString(),
        };
    },
    fromRow(r) {
        return {
            id: str(r.id),
            type: str(r.type) as TransactionType,
            amount: num(r.amount),
            categoryId: str(r.category_id),
            walletId: str(r.wallet_id),
            date: new Date(str(r.date)),
            note: optStr(r.note),
            createdAt: new Date(str(r.created_at)),
        };
    },
};

export const categoryMapper: EntityMapper<Category> = {
    table: 'categories',
    toRow(c) {
        return {
            id: c.id,
            name: c.name,
            type: c.type,
            icon: nullable(c.icon),
            color: nullable(c.color),
        };
    },
    fromRow(r) {
        return {
            id: str(r.id),
            name: str(r.name),
            type: str(r.type) as CategoryType,
            icon: optStr(r.icon),
            color: optStr(r.color),
        };
    },
};

export const budgetMapper: EntityMapper<Budget> = {
    table: 'budgets',
    toRow(b) {
        return {
            id: b.id,
            category_id: b.categoryId,
            month: b.month,
            limit_amount: b.limitAmount,
            created_at: b.createdAt.toISOString(),
            updated_at: b.updatedAt.toISOString(),
        };
    },
    fromRow(r) {
        return {
            id: str(r.id),
            categoryId: str(r.category_id),
            month: str(r.month),
            limitAmount: num(r.limit_amount),
            createdAt: new Date(str(r.created_at)),
            updatedAt: new Date(str(r.updated_at)),
        };
    },
};

export const recurringMapper: EntityMapper<RecurringTransaction> = {
    table: 'recurring_rules',
    toRow(r) {
        return {
            id: r.id,
            type: r.type,
            amount: r.amount,
            wallet_id: r.walletId,
            category_id: r.categoryId,
            description: nullable(r.description),
            start_date: r.startDate.toISOString(),
            end_date: r.endDate ? r.endDate.toISOString() : null,
            frequency: r.frequency,
            interval_count: r.interval,
            last_generated_date: r.lastGeneratedDate.toISOString(),
            is_paused: r.isPaused ? 1 : 0,
            created_at: r.createdAt.toISOString(),
        };
    },
    fromRow(row) {
        return {
            id: str(row.id),
            type: str(row.type) as TransactionType,
            amount: num(row.amount),
            walletId: str(row.wallet_id),
            categoryId: str(row.category_id),
            description: optStr(row.description),
            startDate: new Date(str(row.start_date)),
            endDate: row.end_date ? new Date(str(row.end_date)) : undefined,
            frequency: str(row.frequency) as RecurrenceFrequency,
            interval: num(row.interval_count),
            lastGeneratedDate: new Date(str(row.last_generated_date)),
            isPaused: num(row.is_paused) === 1,
            createdAt: new Date(str(row.created_at)),
        };
    },
};

// ─── Generic CRUD over a mapper ─────────────────────────────────────────

/** SELECT * FROM table → entities. */
export async function sqlGetAll<T>(db: SqlDatabase, m: EntityMapper<T>): Promise<T[]> {
    const { rows } = await db.execute(`SELECT * FROM ${m.table}`);
    return rows.map(m.fromRow);
}

/** SELECT one row by id → entity or null. */
export async function sqlGetById<T>(
    db: SqlDatabase,
    m: EntityMapper<T>,
    id: string,
): Promise<T | null> {
    const { rows } = await db.execute(`SELECT * FROM ${m.table} WHERE id = ? LIMIT 1`, [id]);
    return rows.length ? m.fromRow(rows[0]) : null;
}

/** True if a row with this id exists. */
export async function sqlExists<T>(
    db: SqlDatabase,
    m: EntityMapper<T>,
    id: string,
): Promise<boolean> {
    const { rows } = await db.execute(`SELECT 1 FROM ${m.table} WHERE id = ? LIMIT 1`, [id]);
    return rows.length > 0;
}

/** INSERT (optionally OR IGNORE for idempotent imports). */
export async function sqlInsert<T>(
    db: SqlDatabase,
    m: EntityMapper<T>,
    entity: T,
    orIgnore = false,
): Promise<void> {
    const row = m.toRow(entity);
    const cols = Object.keys(row);
    const placeholders = cols.map(() => '?').join(', ');
    const verb = orIgnore ? 'INSERT OR IGNORE' : 'INSERT';
    await db.execute(
        `${verb} INTO ${m.table} (${cols.join(', ')}) VALUES (${placeholders})`,
        cols.map((c) => row[c]),
    );
}

/** UPDATE all columns by id. Returns rows affected. */
export async function sqlUpdate<T>(
    db: SqlDatabase,
    m: EntityMapper<T>,
    entity: T,
): Promise<number> {
    const row = m.toRow(entity);
    const cols = Object.keys(row).filter((c) => c !== 'id');
    const assignments = cols.map((c) => `${c} = ?`).join(', ');
    const { rowsAffected } = await db.execute(
        `UPDATE ${m.table} SET ${assignments} WHERE id = ?`,
        [...cols.map((c) => row[c]), row.id],
    );
    return rowsAffected;
}

/** DELETE by id. Returns rows affected. */
export async function sqlDelete<T>(
    db: SqlDatabase,
    m: EntityMapper<T>,
    id: string,
): Promise<number> {
    const { rowsAffected } = await db.execute(`DELETE FROM ${m.table} WHERE id = ?`, [id]);
    return rowsAffected;
}
