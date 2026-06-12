/**
 * Domain Repository Interfaces — Barrel Export
 *
 * Abstractions the domain layer depends on. Concrete implementations live in
 * src/data/repositories and must never be imported from the domain.
 */

export type { IRepository } from './IRepository';
export type { BalanceReconciliation, IWalletRepository } from './IWalletRepository';
export type { ITransactionRepository } from './ITransactionRepository';
export type { ICategoryRepository } from './ICategoryRepository';
