/**
 * Use Case Shared Types
 *
 * Dependency types for domain use cases.
 * Use cases receive their dependencies via injection — no React, no singletons.
 */

import type { ICategoryRepository, ITransactionRepository, IWalletRepository } from '../repositories';

/** Event emitter interface — matches DataEventEmitter shape without importing it */
export interface EventBus {
    emit(event: string): void;
    emitMultiple(events: string[]): void;
}

/**
 * Atomic transaction boundary. Runs `work` inside a single DB transaction:
 * COMMIT on success, ROLLBACK (and rethrow) on any error. Provided by the
 * data layer (the shared SqlDatabase connection) so a use case can make
 * several repo writes all-or-nothing.
 */
export type RunInTransaction = <T>(work: () => Promise<T>) => Promise<T>;

/** Standard dependency bundle passed to all use cases */
export interface UseCaseDeps {
    transactionRepo: ITransactionRepository;
    walletRepo: IWalletRepository;
    categoryRepo: ICategoryRepository;
    eventBus: EventBus;
    runInTransaction: RunInTransaction;
}
