/**
 * Transfer Category Ids
 *
 * The two reserved ids a transfer's legs carry in place of a real category.
 * No Category row exists for either: transferFunds writes them straight onto
 * the ledger, and every category the app creates carries a uuid.
 *
 * Single source of truth for the question "which category ids designate a
 * transfer leg". It used to be answered in four places with four private
 * spellings - the ledger rule, the icon resolver, the row presenter and the
 * transfer writer - and the backup reader answered it nowhere at all, which is
 * how a file containing a transfer came to be refused on restore.
 *
 * Lives in the domain because the writer, the ledger rule and the backup
 * validator all need it, and the Clean Architecture dependency rule forbids
 * domain -> data imports (the same reason ledgerEffect sits beside it).
 *
 * Verified by src/data/__tests__/backupTransferRoundTrip.test.ts, which takes a
 * transfer through the production writers and the production backup builder and
 * restores the file it gets back.
 */

/** The outgoing leg: the one that debits its wallet. */
export const TRANSFER_OUT_CATEGORY_ID = 'transfer-out';

/** The incoming leg: the one that credits its wallet. */
export const TRANSFER_IN_CATEGORY_ID = 'transfer-in';

/** Both reserved ids. Persisted keys - they can never be renamed. */
export const TRANSFER_CATEGORY_IDS = [
    TRANSFER_IN_CATEGORY_ID,
    TRANSFER_OUT_CATEGORY_ID,
] as const;

/** True when the category id is one of the reserved transfer pseudo-ids. */
export function isTransferCategoryId(categoryId: string): boolean {
    return (TRANSFER_CATEGORY_IDS as readonly string[]).includes(categoryId);
}
