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

/**
 * Raised when an edit targets a budget whose month is already over.
 *
 * A budget for a past month is the record of the limit the user lived with
 * that month; rewriting it after the fact would change what the reports say
 * about that month. The current month and later months stay editable. The
 * refusal lives in the repository so no caller can bypass it by skipping the
 * UI. Deletion is not covered by this rule.
 */
export class BudgetMonthClosedError extends Error {
    readonly code = 'BUDGET_MONTH_CLOSED' as const;

    constructor(message = 'Budgets for a past month cannot be edited') {
        super(message);
        this.name = 'BudgetMonthClosedError';
    }
}

/**
 * Raised when a recurring rule edit is refused because the debits already due
 * under the stored rule could not be recorded first (REGISTRE V-105, Owner
 * decision 2): the funds guard refused the catch-up that runs before the edit.
 *
 * An edit applies going forward, so what was due before it has to be in the
 * ledger, with the old values, before the new values are saved. When the
 * wallet cannot cover that catch-up, nothing is generated and nothing is
 * saved. The dates and amounts travel on the error so the screen can name
 * the refusal; no rule or wallet id is carried. Verified by
 * recurringEditPauseForward.test.ts - "f. a funds refusal of the pre-edit
 * catch-up refuses the edit..." and RecurringRulesScreen.v105Messages.test.tsx
 * - "f. the screen names the funds refusal of an edit".
 */
export class RecurringCatchUpRefusedError extends Error {
    readonly code = 'RECURRING_CATCH_UP_REFUSED' as const;

    constructor(
        readonly dueDates: readonly Date[],
        readonly totalCost: number,
        readonly availableBalance: number,
    ) {
        super('Rule edit refused: the debits due before it could not be recorded');
        this.name = 'RecurringCatchUpRefusedError';
    }
}

/** A reference a recurring rule points at, without a constraint behind it. */
export type RecurringRuleReference = 'wallet' | 'category';

/**
 * Raised when an edit would change the schedule of a rule whose wallet or
 * category no longer exists (REGISTRE V-105, Owner decision 8).
 *
 * Such a rule cannot record what is due under its stored schedule, so an edit
 * that leaves the schedule alone is saved without a catch-up and keeps those
 * occurrences due, to be generated once the reference is repaired. Changing
 * the frequency or the interval in that state would lose them with the old
 * schedule, so it is refused and the missing reference is named: the user
 * repairs first and changes the schedule in a second edit. Verified by
 * recurringEditPauseForward.test.ts - "o. decision 8 guard..." and
 * RecurringRulesScreen.v105Messages.test.tsx - "o. the screen names the
 * missing wallet...".
 */
export class RecurringRuleReferenceMissingError extends Error {
    readonly code = 'RECURRING_RULE_REFERENCE_MISSING' as const;

    constructor(readonly missing: readonly RecurringRuleReference[]) {
        super(`Rule schedule edit refused: missing ${missing.join(' and ')}`);
        this.name = 'RecurringRuleReferenceMissingError';
    }
}

/**
 * Raised when an edit of a rule whose wallet or category no longer exists
 * would leave a debit already due out of the ledger for good (REGISTRE V-118,
 * Owner decision 3 of 01/10, pass 71, extending V-105 decision 8):
 *
 *  - the edit places the end before an occurrence that is due and not yet
 *    recorded; or
 *  - the edit reopens an ended rule (clears the end or moves it later) while
 *    an occurrence before the old end is still due (Owner answer of 01/10):
 *    reopening skips the time the rule was ended, and that cannot be done
 *    without skipping the due occurrence too.
 *
 * Such a rule cannot record what is due before the edit, so nothing is
 * generated and nothing is saved. The user repairs the reference first,
 * keeping the end, then changes the end in a second edit, which records what
 * is due before it applies. The missing references and the due dates travel
 * on the error so the screen can name the refusal. Verified by
 * recurringEndOccurrenceIndex.test.ts - "V-118 b.", "V-118 c." and
 * "Decision 4 c.", and RecurringRulesScreen.v118Messages.test.tsx.
 */
export class RecurringEndDateEditRefusedError extends Error {
    readonly code = 'RECURRING_END_DATE_EDIT_REFUSED' as const;

    constructor(
        readonly missing: readonly RecurringRuleReference[],
        readonly dueDates: readonly Date[],
    ) {
        super(`Rule end date edit refused: missing ${missing.join(' and ')}, debits still due`);
        this.name = 'RecurringEndDateEditRefusedError';
    }
}
