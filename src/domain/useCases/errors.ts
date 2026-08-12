/**
 * Domain Use Case Errors
 *
 * Typed errors raised by use cases so the UI can react to a specific business
 * outcome (via `instanceof` / `code`) instead of matching on message strings.
 */

/**
 * Raised when a transaction/transfer would spend more than the authoritative
 * wallet balance. The decision is made inside the use case (within the same DB
 * transaction as the write) to avoid TOCTOU races.
 */
export class InsufficientFundsError extends Error {
    readonly code = 'INSUFFICIENT_FUNDS' as const;

    constructor(message = 'Insufficient balance in source wallet') {
        super(message);
        this.name = 'InsufficientFundsError';
    }
}

/**
 * Raised when a caller tries to delete one leg of a transfer.
 *
 * A transfer is two rows in two wallets, and no column links them. Deleting one
 * leg would leave the other orphaned: each wallet still audits clean on its own
 * ledger, so the resulting imbalance between the pair is invisible to
 * verifyFinancialIntegrity. Deleting transfers is not supported, and the refusal
 * lives here rather than only in the UI so no future caller can reintroduce it.
 */
export class TransferDeletionNotSupportedError extends Error {
    readonly code = 'TRANSFER_DELETION_NOT_SUPPORTED' as const;

    constructor(message = 'Transfers cannot be deleted one leg at a time') {
        super(message);
        this.name = 'TransferDeletionNotSupportedError';
    }
}
