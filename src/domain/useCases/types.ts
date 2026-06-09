/**
 * Use Case Shared Types
 *
 * Dependency types for domain use cases.
 * Use cases receive their dependencies via injection — no React, no singletons.
 */

import type { CategoryRepository } from '../../data/repositories/CategoryRepository';
import type { TransactionRepository } from '../../data/repositories/TransactionRepository';
import type { WalletRepository } from '../../data/repositories/WalletRepository';

/** Event emitter interface — matches DataEventEmitter shape without importing it */
export interface EventBus {
    emit(event: string): void;
    emitMultiple(events: string[]): void;
}

/** Standard dependency bundle passed to all use cases */
export interface UseCaseDeps {
    transactionRepo: TransactionRepository;
    walletRepo: WalletRepository;
    categoryRepo: CategoryRepository;
    eventBus: EventBus;
}
