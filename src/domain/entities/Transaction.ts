/**
 * Transaction Entity
 * 
 * Pure domain model representing a financial transaction.
 * This entity is UI-agnostic and contains only business logic.
 */

/**
 * Type of transaction: expense or income
 */
export enum TransactionType {
    EXPENSE = 'expense',
    INCOME = 'income',
}

/**
 * Transaction entity interface
 * Represents a single financial transaction in the system
 */
export interface Transaction {
    /** Unique identifier for the transaction */
    readonly id: string;

    /** Type of transaction (expense or income) */
    readonly type: TransactionType;

    /** Transaction amount (always positive, type determines if it's added or subtracted) */
    readonly amount: number;

    /** ID of the category this transaction belongs to */
    readonly categoryId: string;

    /** ID of the wallet this transaction is associated with */
    readonly walletId: string;

    /** Date when the transaction occurred */
    readonly date: Date;

    /** Optional note/description for the transaction */
    readonly note?: string;

    /** Timestamp when this transaction was created in the system */
    readonly createdAt: Date;
}

/**
 * Data Transfer Object for creating a new transaction
 * Used when creating transactions without system-generated fields
 */
export interface CreateTransactionDTO {
    type: TransactionType;
    amount: number;
    categoryId: string;
    walletId: string;
    date: Date;
    note?: string;
}

/**
 * Data Transfer Object for updating an existing transaction
 * All fields are optional except id
 */
export interface UpdateTransactionDTO {
    id: string;
    type?: TransactionType;
    amount?: number;
    categoryId?: string;
    walletId?: string;
    date?: Date;
    note?: string;
}

/**
 * Serializable version of Transaction for storage
 * Dates are converted to ISO strings for JSON serialization
 */
export interface SerializableTransaction {
    id: string;
    type: TransactionType;
    amount: number;
    categoryId: string;
    walletId: string;
    date: string; // ISO string
    note?: string;
    createdAt: string; // ISO string
}

/**
 * Convert Transaction to serializable format
 */
export function serializeTransaction(transaction: Transaction): SerializableTransaction {
    return {
        ...transaction,
        date: transaction.date.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
    };
}

/**
 * Convert serializable format back to Transaction
 */
export function deserializeTransaction(data: SerializableTransaction): Transaction {
    return {
        ...data,
        date: new Date(data.date),
        createdAt: new Date(data.createdAt),
    };
}
