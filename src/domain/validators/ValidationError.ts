/**
 * Validation Error
 *
 * Custom error thrown when domain entity validation fails.
 * Carries the offending field and value for diagnostics.
 */

export class ValidationError extends Error {
    constructor(
        /** Name of the entity being validated (e.g. 'Transaction') */
        public readonly entity: string,
        /** The field that failed validation */
        public readonly field: string,
        /** The invalid value that was provided */
        public readonly value: unknown,
        message: string,
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}
