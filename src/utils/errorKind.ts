/**
 * Error Kind
 *
 * What a console line may say about an error thrown on the backup and restore
 * paths: its class, the field a validator refused, and the code a native
 * module error carries - never its message, never the refused value.
 *
 * On those paths the message is not safe to print. A file system error names
 * the file it failed on (a backup in the cache, a picked copy); a parse error
 * quotes the start of the input; a refused snapshot quotes the rows it refused,
 * amounts and notes included; and a ValidationError keeps the refused value of
 * a row from the file as a property. Console output reaches the device log, and
 * it is the raw material of a breadcrumb.
 */

import { ValidationError } from '../domain/validators';

/** A data-free description of `error`, for a console line. */
export function errorKind(error: unknown): string {
    if (error instanceof ValidationError) {
        return `${error.name} (${error.entity}.${error.field})`;
    }
    if (error instanceof Error) {
        const { code } = error as Error & { code?: unknown };
        return typeof code === 'string' ? `${error.name} (${code})` : error.name;
    }
    return typeof error;
}
