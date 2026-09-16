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

/**
 * Raised when deleting a category would break a recurring rule.
 *
 * Past data may lose its link; a future instruction may not. An orphaned
 * transaction is a past fact that remains true - it happened, in that category,
 * whatever the category set looks like today. An orphaned recurring rule is a
 * standing order that will never execute: the engine refuses it on every run,
 * and the user sees nothing but an occurrence that stops arriving.
 *
 * `ruleCount` counts EVERY rule on the category, paused and expired ones
 * included. `is_paused` records when a rule runs, not whether it exists, so a
 * paused rule is still a standing order and pausing must not become a way to
 * orphan one. This is a wider scope than the engine's getActiveRules on purpose.
 *
 * The count travels on the error so the UI can say how many rules are in the
 * way without re-querying, and no rule id is carried: the message the user sees
 * must never name an internal identifier.
 */
export class CategoryHasRecurringRulesError extends Error {
    readonly code = 'CATEGORY_HAS_RECURRING_RULES' as const;

    constructor(readonly ruleCount: number) {
        super(`Cannot delete category. ${ruleCount} recurring rule(s) still use it.`);
        this.name = 'CategoryHasRecurringRulesError';
    }
}

/**
 * Raised when deleting a wallet would break a recurring rule.
 *
 * The wallet twin of CategoryHasRecurringRulesError, same counting scope, and
 * deliberately NOT symmetric with the transaction rule: a wallet holding
 * transactions stays deletable behind its existing consent dialog, because
 * those transactions are past facts. Only a standing order blocks. See
 * deleteWallet.
 */
export class WalletHasRecurringRulesError extends Error {
    readonly code = 'WALLET_HAS_RECURRING_RULES' as const;

    constructor(readonly ruleCount: number) {
        super(`Cannot delete wallet. ${ruleCount} recurring rule(s) still use it.`);
        this.name = 'WalletHasRecurringRulesError';
    }
}
