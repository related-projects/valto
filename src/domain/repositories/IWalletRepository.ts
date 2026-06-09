/**
 * Wallet Repository Interface (domain-level)
 *
 * The contract the domain (use cases) depends on for wallet persistence and
 * balance auditing. Implemented by the concrete WalletRepository in src/data/.
 */

import type { CreateWalletDTO, UpdateWalletDTO, Wallet } from '../entities';
import type { IRepository } from './IRepository';

/** Result of comparing a wallet's stored balance against its ledger. */
export interface BalanceReconciliation {
    walletId: string;
    stored: number;
    computed: number;
    /** stored − computed; 0 means the stored balance is verified. */
    drift: number;
}

export interface IWalletRepository extends IRepository<Wallet> {
    /** Create a wallet from a DTO (generates id, sets opening balance). */
    create(dto: CreateWalletDTO): Promise<Wallet>;

    /** Update an existing wallet from a partial DTO. */
    updateFromDTO(dto: UpdateWalletDTO): Promise<Wallet>;

    /** Atomically add `amount` (signed) to the stored balance. */
    updateBalance(id: string, amount: number): Promise<Wallet>;

    /** Recompute a wallet's balance purely from its ledger (opening + Σ effects). */
    recomputeBalanceFromLedger(walletId: string): Promise<number>;

    /** Compare every wallet's stored balance against its recomputed ledger value. */
    reconcile(): Promise<BalanceReconciliation[]>;
}
