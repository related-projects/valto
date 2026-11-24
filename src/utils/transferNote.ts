/**
 * Transfer Note Display (REGISTRE C38, Owner decisions 24/11, decision 1, option A)
 *
 * transferFunds stores each transfer leg's note with an English prefix that
 * names the other wallet, whatever the app language:
 *   outgoing leg (transfer-out): "Transfer to <wallet>"   (+ " - <typed note>")
 *   incoming leg (transfer-in):  "Transfer from <wallet>" (+ " - <typed note>")
 * (src/domain/useCases/transferFunds.ts; the " - <typed note>" tail is V-129,
 * Owner decision 17/11.) Storage stays as it is - existing rows, backups and
 * what transferFunds writes are unchanged. Only the display translates the
 * prefix, here, for every place that shows a note: the detail screen, the CSV,
 * the PDF and the transactions search.
 *
 * A note is recognised as a transfer note only when all three hold: the row is
 * a transfer, its reserved category is one of the two legs, and the note starts
 * with that leg's own stored prefix. Anything else - an expense the user noted
 * "Transfer to Mum", a leg whose note was edited to something else - is
 * returned exactly as stored. Only the prefix is replaced; the wallet name and
 * the typed note that follow it are kept byte for byte.
 *
 * The translated prefix comes from transactions.transferNote.to / .from. An
 * incomplete bundle has no such keys, so i18next falls back to English, which
 * is the stored prefix itself.
 */

import type { TFunction } from 'i18next';
import { TransactionType, type Transaction } from '../domain/entities/Transaction';
import { TRANSFER_IN_CATEGORY_ID, TRANSFER_OUT_CATEGORY_ID } from '../domain/ledger/transferCategories';

interface TransferPrefix {
    /** Exactly what transferFunds writes before the wallet name, space included. */
    readonly stored: string;
    /** The translated prefix, without the space that separates it from the rest. */
    readonly key: string;
}

/** Keyed by the leg's reserved category id: each leg has its own prefix. */
const TRANSFER_PREFIXES: Readonly<Record<string, TransferPrefix>> = {
    [TRANSFER_OUT_CATEGORY_ID]: { stored: 'Transfer to ', key: 'transactions.transferNote.to' },
    [TRANSFER_IN_CATEGORY_ID]: { stored: 'Transfer from ', key: 'transactions.transferNote.from' },
};

/**
 * The note as the user should read it: a transfer leg's stored English prefix
 * replaced by the one in the language of `t`, any other note unchanged. An
 * absent note is ''.
 *
 * @example displayTransactionNote({ type: 'transfer', categoryId: 'transfer-out', note: 'Transfer to Bank - rent' }, tFr)
 *          -> "Transfert vers Bank - rent"
 */
export function displayTransactionNote(
    transaction: Pick<Transaction, 'type' | 'categoryId' | 'note'>,
    t: TFunction,
): string {
    const note = transaction.note ?? '';
    if (transaction.type !== TransactionType.TRANSFER) return note;

    const prefix = Object.prototype.hasOwnProperty.call(TRANSFER_PREFIXES, transaction.categoryId)
        ? TRANSFER_PREFIXES[transaction.categoryId]
        : undefined;
    if (!prefix || !note.startsWith(prefix.stored)) return note;

    return `${t(prefix.key)} ${note.slice(prefix.stored.length)}`;
}
