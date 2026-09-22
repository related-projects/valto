/**
 * Missing Category
 *
 * A transaction, budget or rule can point at a categoryId that no longer
 * resolves to a Category row - the audit calls these phantoms. They are legacy
 * data: the shipped app refuses to delete a referenced category
 * (domain/useCases/deleteCategory.ts), so nothing here creates one.
 *
 * Two constants, so the six call sites that meet a phantom agree with each
 * other. Each site still chooses the key and calls its own `t` - this module
 * deliberately does not translate, so nothing outside the render layer needs a
 * translator, and the domain layer keeps its independence.
 */

/**
 * The label shown wherever a category cannot be resolved.
 *
 * Reuses the key the transaction list has always used
 * (TransactionPresenter.tsx), rather than minting a second one: the same
 * situation deserves the same word, and every locale already carries it.
 */
export const MISSING_CATEGORY_LABEL_KEY = 'components.transactionList.unknown';

/**
 * Stands in for the id of the single merged row that represents every
 * unresolved category in one breakdown.
 *
 * A view-model value only. It is never written to storage, never compared
 * against a stored categoryId, and never reaches a repository - it exists
 * because CategoryBreakdownItem.categoryId is a required string and the merged
 * row is not any one of the ids it replaces.
 */
export const UNRESOLVED_CATEGORY_ID = 'unresolved-category';
