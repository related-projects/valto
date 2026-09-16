/**
 * Recurring Rule Status
 *
 * One status per rule, derived from the rule and its two references. Pure: no
 * repository, no clock of its own, no write.
 *
 * Why it exists: a rule could sit in the list reading "Active" and generate
 * nothing, with no user-facing signal. Three distinct things produce that one
 * experience - a reference that no longer resolves, a funds refusal, and an
 * endDate that has passed - and only the first two are faults. The third is the
 * rule doing exactly what it was told.
 *
 * Nothing here is persisted. The status is recomputed from what is already on
 * screen; there is no record of it anywhere.
 */

import { TransactionType } from '../entities/Transaction';
import { WalletType, type Wallet } from '../entities/Wallet';
import type { Category } from '../entities/Category';
import type { RecurringTransaction } from '../entities/RecurringTransaction';
import { computeDueDates, startOfDay } from '../calculations/recurrenceDates';

/**
 * What a rule is doing right now.
 *
 * PAUSED and EXPIRED are intent and natural end. MISSING_REFERENCE and
 * INSUFFICIENT_FUNDS are faults: the rule is meant to be running and is not.
 */
export enum RecurringRuleStatus {
    PAUSED = 'PAUSED',
    EXPIRED = 'EXPIRED',
    MISSING_REFERENCE = 'MISSING_REFERENCE',
    INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
    ACTIVE = 'ACTIVE',
}

/** The two things a rule points at, either of which may be gone. */
export interface RuleReferences {
    /** The rule's wallet, or null when it no longer exists. */
    wallet: Wallet | null;
    /** The rule's category, or null when it no longer exists. */
    category: Category | null;
}

/** What a funds refusal costs and what was there instead. */
export interface FundsShortfall {
    /** Total needed to cover every pending due date, not one occurrence. */
    totalCost: number;
    /** Wallet balance at the moment of the check. */
    availableBalance: number;
}

/**
 * The single definition of "this rule cannot be paid for".
 *
 * Extracted from the engine's generateForRule, which now calls it. There must be
 * one definition of insufficient, not two that agree today: the rules screen
 * asks the same question without running the engine.
 *
 * Grain unchanged and deliberately so: the whole catch-up is priced at once and
 * refused as a unit. Making that refusal visible is this pass; changing its
 * grain is not.
 *
 * Returns null when the rule is fundable, or is not the kind of rule the guard
 * applies to. Only expense rules on wallets that cannot go negative are guarded;
 * an expense on a bank or savings wallet may overdraw, which is a real event
 * worth recording - see createTransaction.
 */
export function checkInsufficientFunds(
    rule: Pick<RecurringTransaction, 'type' | 'amount'>,
    wallet: Pick<Wallet, 'type' | 'balance'>,
    dueDates: readonly Date[],
): FundsShortfall | null {
    if (rule.type !== TransactionType.EXPENSE) return null;
    if (wallet.type !== WalletType.CASH && wallet.type !== WalletType.MOBILE) return null;

    const totalCost = rule.amount * dueDates.length;
    if (wallet.balance >= totalCost) return null;

    return { totalCost, availableBalance: wallet.balance };
}

/**
 * The part of the status decidable from the rule alone, without either
 * reference: PAUSED, EXPIRED, or null when the rule's own schedule says it
 * should be running.
 *
 * Exported because the rules screen renders before its wallets and categories
 * have loaded, and an unresolved reference at that moment is "not known yet",
 * not "missing". Showing a fault badge for the width of one load would be a lie.
 * Kept as one definition rather than two so the precedence between PAUSED and
 * EXPIRED cannot drift between the two call paths.
 *
 * A rule is active THROUGH the end of its endDate day, matching the engine's
 * whole-day arithmetic - see getActiveRules.
 */
export function deriveScheduleStatus(
    rule: RecurringTransaction,
    today: Date,
): RecurringRuleStatus.PAUSED | RecurringRuleStatus.EXPIRED | null {
    if (rule.isPaused) return RecurringRuleStatus.PAUSED;

    if (rule.endDate && startOfDay(rule.endDate).getTime() < startOfDay(today).getTime()) {
        return RecurringRuleStatus.EXPIRED;
    }

    return null;
}

/**
 * The one status for a rule.
 *
 * Precedence, highest first:
 *   PAUSED   - the user turned it off. Nothing else about it is worth saying.
 *   EXPIRED  - it reached the end it was given. Not a fault, never presented
 *              as one.
 *   MISSING_REFERENCE - its wallet or its category is gone. Checked before
 *              funds, for the same reason the engine checks it first: a rule
 *              pointing nowhere is not a funding problem, and telling the user
 *              to add money would not make it run.
 *   INSUFFICIENT_FUNDS - the pending occurrences cost more than the wallet
 *              holds. A rule with nothing due is never in this state.
 *   ACTIVE   - fallback.
 */
export function deriveRecurringRuleStatus(
    rule: RecurringTransaction,
    references: RuleReferences,
    today: Date,
): RecurringRuleStatus {
    const scheduleStatus = deriveScheduleStatus(rule, today);
    if (scheduleStatus) return scheduleStatus;

    const { wallet, category } = references;
    if (!wallet || !category) return RecurringRuleStatus.MISSING_REFERENCE;

    // Nothing due means nothing to price, so an empty wallet is not a refusal.
    // checkInsufficientFunds returns null on an empty list, but computing the
    // dues first keeps that the same early exit the engine makes.
    const dueDates = computeDueDates(rule, today);
    if (dueDates.length === 0) return RecurringRuleStatus.ACTIVE;

    if (checkInsufficientFunds(rule, wallet, dueDates)) {
        return RecurringRuleStatus.INSUFFICIENT_FUNDS;
    }

    return RecurringRuleStatus.ACTIVE;
}

/** The statuses that mean a rule is meant to be running and is not. */
const FAULT_STATUSES: readonly RecurringRuleStatus[] = [
    RecurringRuleStatus.MISSING_REFERENCE,
    RecurringRuleStatus.INSUFFICIENT_FUNDS,
];

/**
 * Whether a status is a fault the user can act on, as opposed to intent
 * (PAUSED) or a natural end (EXPIRED).
 */
export function isFaultStatus(status: RecurringRuleStatus): boolean {
    return FAULT_STATUSES.includes(status);
}
