/**
 * Transaction Repository Interface (domain-level)
 *
 * The contract the domain (use cases) depends on for transaction persistence.
 * Implemented by the concrete TransactionRepository in src/data/.
 */

import type { CreateTransactionDTO, Transaction } from '../entities';
import type { IRepository } from './IRepository';

export interface ITransactionRepository extends IRepository<Transaction> {
    /** Create a transaction from a DTO (generates id). */
    create(dto: CreateTransactionDTO): Promise<Transaction>;

    /** All transactions referencing a given category. */
    getByCategoryId(categoryId: string): Promise<Transaction[]>;

    /** All transactions belonging to a given wallet. */
    getByWalletId(walletId: string): Promise<Transaction[]>;
}
