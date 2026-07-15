/**
 * Generic Repository Interface (domain-level)
 *
 * Base contract for persisting domain entities. Declared in the domain layer so
 * use cases depend on this abstraction — never on concrete data-layer classes.
 * Concrete repositories in `src/data/` implement entity-specific interfaces that
 * extend this base (see IWalletRepository, ITransactionRepository, ...).
 *
 * @template T The entity type this repository manages
 */
export interface IRepository<T> {
    /** Get all entities */
    getAll(): Promise<T[]>;

    /** Get a single entity by ID, or null if not found */
    getById(id: string): Promise<T | null>;

    /** Save a new entity */
    save(entity: T): Promise<T>;

    /** Update an existing entity */
    update(entity: T): Promise<T>;

    /** Delete an entity by ID */
    delete(id: string): Promise<void>;
}
