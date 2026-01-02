/**
 * Wallet Entity
 * 
 * Pure domain model representing a financial wallet/account.
 * This entity is UI-agnostic and contains only business logic.
 */

/**
 * Type of wallet
 */
export enum WalletType {
    CASH = 'cash',
    BANK = 'bank',
    MOBILE = 'mobile',
    SAVINGS = 'savings',
}

/**
 * Wallet entity interface
 * Represents a financial account or wallet in the system
 */
export interface Wallet {
    /** Unique identifier for the wallet */
    readonly id: string;

    /** Display name of the wallet */
    readonly name: string;

    /** Current balance in the wallet (can be negative for bank accounts with overdraft) */
    readonly balance: number;

    /** Type of wallet */
    readonly type: WalletType;

    /** Optional color for UI representation (hex color code) */
    readonly color?: string;

    /** Timestamp when this wallet was created in the system */
    readonly createdAt: Date;
}

/**
 * Data Transfer Object for creating a new wallet
 */
export interface CreateWalletDTO {
    name: string;
    balance: number;
    type: WalletType;
    color?: string;
}

/**
 * Data Transfer Object for updating an existing wallet
 * All fields are optional except id
 */
export interface UpdateWalletDTO {
    id: string;
    name?: string;
    balance?: number;
    type?: WalletType;
    color?: string;
}

/**
 * Serializable version of Wallet for storage
 * Dates are converted to ISO strings for JSON serialization
 */
export interface SerializableWallet {
    id: string;
    name: string;
    balance: number;
    type: WalletType;
    color?: string;
    createdAt: string; // ISO string
}

/**
 * Convert Wallet to serializable format
 */
export function serializeWallet(wallet: Wallet): SerializableWallet {
    return {
        ...wallet,
        createdAt: wallet.createdAt.toISOString(),
    };
}

/**
 * Convert serializable format back to Wallet
 */
export function deserializeWallet(data: SerializableWallet): Wallet {
    return {
        ...data,
        createdAt: new Date(data.createdAt),
    };
}

/**
 * Validate wallet balance constraints
 * Cash and mobile wallets cannot have negative balance
 */
export function validateWalletBalance(wallet: Wallet): boolean {
    if (wallet.type === WalletType.CASH || wallet.type === WalletType.MOBILE) {
        return wallet.balance >= 0;
    }
    return true; // Bank and savings can have negative balance (overdraft)
}
