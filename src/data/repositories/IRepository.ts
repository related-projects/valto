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

/**
 * Generic repository interface for CRUD operations
 * @template T The entity type this repository manages
 */
export interface IRepository<T> {
    /**
     * Get all entities
     * @returns Promise resolving to array of all entities
     */
    getAll(): Promise<T[]>;

    /**
     * Get a single entity by ID
     * @param id Entity ID
     * @returns Promise resolving to the entity or null if not found
     */
    getById(id: string): Promise<T | null>;

    /**
     * Save a new entity
     * @param entity Entity to save
     * @returns Promise resolving to the saved entity (with generated ID if applicable)
     */
    save(entity: T): Promise<T>;

    /**
     * Update an existing entity
     * @param entity Entity to update
     * @returns Promise resolving to the updated entity
     */
    update(entity: T): Promise<T>;

    /**
     * Delete an entity by ID
     * @param id Entity ID
     * @returns Promise resolving when deletion is complete
     */
    delete(id: string): Promise<void>;
}

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
