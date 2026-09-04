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

/**
 * Raised when deleting a wallet would leave the install with none.
 *
 * A wallet is the only object a transaction can be attached to, so an install
 * with zero wallets cannot record anything and offers no way back in place: the
 * add-transaction flow refuses to submit, and onboarding - the one flow that
 * creates a wallet unprompted - never runs again for a user who has already
 * completed it. The floor is a business rule, not a storage constraint, so it
 * lives in the use case rather than in the repository: WalletRepository.delete
 * stays a primitive that deletes exactly the row it was given.
 *
 * Typed rather than a message string so the UI can tell "you cannot delete your
 * last wallet" from a genuine storage failure.
 */
export class LastWalletError extends Error {
    readonly code = 'LAST_WALLET' as const;

    constructor(message = 'Cannot delete the last wallet. Create another wallet first.') {
        super(message);
        this.name = 'LastWalletError';
    }
}
