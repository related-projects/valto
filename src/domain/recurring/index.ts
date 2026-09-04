/**
 * Recurring rule domain helpers - barrel export.
 *
 * Pure and stateless. Nothing here reads a repository, holds a clock, or writes.
 */

export {
    RecurringRuleStatus,
    checkInsufficientFunds,
    deriveRecurringRuleStatus,
    deriveScheduleStatus,
    isFaultStatus,
    type FundsShortfall,
    type RuleReferences,
} from './recurringStatus';
