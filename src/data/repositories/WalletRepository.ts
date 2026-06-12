/**
 * Wallet Repository
 *
 * Repository for managing Wallet entities, backed by relational SQLite.
 * Handles CRUD, balance management, and ledger-based balance auditing.
 *
 * Data Integrity:
 * - Validates all entities before persistence via WalletValidator
 * - Retains validateWalletBalance as an additional business rule check
 * - `balance` is stored for fast reads but is always recomputable from the
 *   ledger via recomputeBalanceFromLedger() (anchored by `opening_balance`)
 */

import { v4 as uuidv4 } from 'uuid';
import {
    CreateWalletDTO,
    UpdateWalletDTO,
    validateWalletBalance,
    Wallet,
    WalletType,
} from '../../domain/entities/Wallet';
import { ValidationError } from '../../domain/validators/ValidationError';
import { validateWallet } from '../../domain/validators/WalletValidator';
import type { BalanceReconciliation, IWalletRepository } from '../../domain/repositories';
import { walletMapper, sqlDelete, sqlGetAll, sqlGetById, sqlExists, sqlUpdate } from '../storage/sql/mappers';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { RepositoryError, RepositoryErrorType } from './IRepository';
import { ledgerEffect } from './ledger';

// Re-exported for backward compatibility; the canonical type lives in the domain.
export type { BalanceReconciliation } from '../../domain/repositories';

export class WalletRepository implements IWalletRepository {
    constructor(private db: SqlDatabase) { }

    async getAll(): Promise<Wallet[]> {
        try {
            return await sqlGetAll(this.db, walletMapper);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to get all wallets', error as Error);
        }
    }

    async getById(id: string): Promise<Wallet | null> {
        try {
            return await sqlGetById(this.db, walletMapper, id);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, `Failed to get wallet with id: ${id}`, error as Error);
        }
    }

    async save(wallet: Wallet): Promise<Wallet> {
        try {
            try {
                validateWallet(wallet);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[WalletRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            if (!validateWalletBalance(wallet)) {
                throw new RepositoryError(
                    RepositoryErrorType.VALIDATION_ERROR,
                    `${wallet.type} wallets cannot have negative balance`,
                );
            }

            if (await sqlExists(this.db, walletMapper, wallet.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Wallet with id ${wallet.id} already exists`,
                );
            }

            // opening_balance (ledger anchor) is set once here = initial balance.
            await this.db.execute(
                `INSERT INTO wallets (id, name, balance, opening_balance, type, color, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    wallet.id,
                    wallet.name,
                    wallet.balance,
                    wallet.balance,
                    wallet.type,
                    wallet.color ?? null,
                    wallet.createdAt.toISOString(),
                ],
            );

            return wallet;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[WalletRepository] Unexpected save failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to save wallet', error as Error);
        }
    }

    async update(wallet: Wallet): Promise<Wallet> {
        try {
            try {
                validateWallet(wallet);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[WalletRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            if (!validateWalletBalance(wallet)) {
                throw new RepositoryError(
                    RepositoryErrorType.VALIDATION_ERROR,
                    `${wallet.type} wallets cannot have negative balance`,
                );
            }

            // sqlUpdate does not touch opening_balance (not in the mapper).
            const affected = await sqlUpdate(this.db, walletMapper, wallet);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Wallet with id ${wallet.id} not found`);
            }

            return wallet;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[WalletRepository] Unexpected update failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to update wallet', error as Error);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const affected = await sqlDelete(this.db, walletMapper, id);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Wallet with id ${id} not found`);
            }
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to delete wallet', error as Error);
        }
    }

    async create(dto: CreateWalletDTO): Promise<Wallet> {
        const wallet: Wallet = {
            id: uuidv4(),
            name: dto.name,
            balance: dto.balance,
            type: dto.type,
            color: dto.color,
            createdAt: new Date(),
        };
        return this.save(wallet);
    }

    async updateFromDTO(dto: UpdateWalletDTO): Promise<Wallet> {
        const existing = await this.getById(dto.id);
        if (!existing) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Wallet with id ${dto.id} not found`);
        }

        const updated: Wallet = {
            ...existing,
            name: dto.name ?? existing.name,
            balance: dto.balance ?? existing.balance,
            type: dto.type ?? existing.type,
            color: dto.color !== undefined ? dto.color : existing.color,
        };

        return this.update(updated);
    }

    // ─── Domain-specific methods ────────────────────────────────────────

    /**
     * Atomically add `amount` (signed) to the stored balance.
     * Single UPDATE statement — no read-modify-write race.
     */
    async updateBalance(id: string, amount: number): Promise<Wallet> {
        const { rowsAffected } = await this.db.execute(
            `UPDATE wallets SET balance = balance + ? WHERE id = ?`,
            [amount, id],
        );
        if (rowsAffected === 0) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Wallet with id ${id} not found`);
        }
        // Non-null: the row exists (we just updated it).
        return (await this.getById(id))!;
    }

    async getByType(type: WalletType): Promise<Wallet[]> {
        const wallets = await this.getAll();
        return wallets.filter((w) => w.type === type);
    }

    async getTotalBalance(): Promise<number> {
        const wallets = await this.getAll();
        return wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
    }

    // ─── Balance auditing ───────────────────────────────────────────────

    /**
     * Recompute a wallet's balance purely from its ledger:
     *   opening_balance + Σ ledgerEffect(transactions of the wallet).
     * The stored balance should always equal this value.
     */
    async recomputeBalanceFromLedger(walletId: string): Promise<number> {
        const { rows: walletRows } = await this.db.execute(
            `SELECT opening_balance FROM wallets WHERE id = ? LIMIT 1`,
            [walletId],
        );
        if (walletRows.length === 0) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Wallet with id ${walletId} not found`);
        }
        const opening = Number(walletRows[0].opening_balance);

        const { rows: txRows } = await this.db.execute(
            `SELECT type, amount, category_id FROM transactions WHERE wallet_id = ?`,
            [walletId],
        );
        const ledgerSum = txRows.reduce(
            (sum, r) =>
                sum +
                ledgerEffect({
                    type: String(r.type) as never,
                    amount: Number(r.amount),
                    categoryId: String(r.category_id),
                }),
            0,
        );

        return opening + ledgerSum;
    }

    /**
     * Compare every wallet's stored balance against its recomputed ledger
     * value. A non-zero `drift` flags a corrupted stored balance.
     */
    async reconcile(): Promise<BalanceReconciliation[]> {
        const wallets = await this.getAll();
        const results: BalanceReconciliation[] = [];
        for (const w of wallets) {
            const computed = await this.recomputeBalanceFromLedger(w.id);
            results.push({ walletId: w.id, stored: w.balance, computed, drift: w.balance - computed });
        }
        return results;
    }
}
