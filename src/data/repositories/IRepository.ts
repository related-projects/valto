/**
 * Repository Interface
 * 
 * Generic repository interface defining CRUD operations for domain entities.
 * This follows the Repository Pattern from Domain-Driven Design.
 * 
 * Architecture Note:
 * Repositories act as a collection-like interface for accessing domain objects.
 * They encapsulate the logic for retrieving and persisting data, keeping the
 * domain layer free from persistence concerns.
 */

// The generic repository contract is declared in the domain layer (the
// abstraction use cases depend on). Re-exported here so existing data-layer
// imports keep working without reaching across the boundary.
export type { IRepository } from '../../domain/repositories/IRepository';

/**
 * Repository error types
 */
export enum RepositoryErrorType {
    NOT_FOUND = 'NOT_FOUND',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    STORAGE_ERROR = 'STORAGE_ERROR',
    DUPLICATE_ERROR = 'DUPLICATE_ERROR',
}

/**
 * Custom error class for repository operations
 */
export class RepositoryError extends Error {
    constructor(
        public type: RepositoryErrorType,
        message: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'RepositoryError';
    }
}
