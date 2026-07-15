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
