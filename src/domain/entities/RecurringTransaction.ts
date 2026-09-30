/**
 * RecurringTransaction Entity
 *
 * Pure domain model representing a recurring transaction rule.
 * Rules define templates that the RecurringTransactionEngine uses
 * to automatically generate Transaction entities over time.
 */

import { TransactionType } from './Transaction';

/**
 * Supported recurrence frequencies
 */
export enum RecurrenceFrequency {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    MONTHLY = 'monthly',
    YEARLY = 'yearly',
}

/**
 * RecurringTransaction entity interface
 * Represents a rule for automatically generating transactions
 */
export interface RecurringTransaction {
    /** Unique identifier for the rule */
    readonly id: string;

    /** Type of transactions to generate */
    readonly type: TransactionType;

    /** Amount for each generated transaction */
    readonly amount: number;

    /** Target wallet for generated transactions */
    readonly walletId: string;

    /** Category for generated transactions */
    readonly categoryId: string;

    /** Optional description attached to each generated transaction */
    readonly description?: string;

    /** Date from which to start generating transactions */
    readonly startDate: Date;

    /** Optional end date - no transactions generated after this */
    readonly endDate?: Date;

    /** How often to generate (daily, weekly, monthly, yearly) */
    readonly frequency: RecurrenceFrequency;

    /** Multiplier for frequency (e.g. interval=2 + frequency=weekly -> every 2 weeks) */
    readonly interval: number;

    /**
     * Local midnight of the last generated occurrence, in the zone that wrote
     * it. Still written with every occurrence so older readers and backups
     * keep their meaning, but no longer what decides whether an occurrence was
     * generated: see lastGeneratedIndex.
     */
    readonly lastGeneratedDate: Date;

    /**
     * Number of the last generated occurrence, counted from 0 at startDate;
     * -1 when none has been. Zone-independent, unlike lastGeneratedDate
     * (REGISTRE V-98). Absent on a rule that predates it - a file restored
     * from an older backup, or a row not yet migrated - until it is derived
     * from lastGeneratedDate; see deriveLastGeneratedIndex.
     */
    readonly lastGeneratedIndex?: number;

    /**
     * Incremented whenever an edit changes the schedule (startDate, frequency,
     * interval), so the occurrence numbers of the new schedule cannot collide
     * with those already used by the old one. Absent means 0.
     */
    readonly scheduleVersion?: number;

    /** Whether this rule is paused (engine skips paused rules) */
    readonly isPaused: boolean;

    /** Timestamp when this rule was created */
    readonly createdAt: Date;
}

/**
 * DTO for creating a new recurring transaction rule
 */
export interface CreateRecurringTransactionDTO {
    type: TransactionType;
    amount: number;
    walletId: string;
    categoryId: string;
    description?: string;
    startDate: Date;
    endDate?: Date;
    frequency: RecurrenceFrequency;
    interval: number;
}

/**
 * DTO for updating an existing recurring transaction rule
 */
export interface UpdateRecurringTransactionDTO {
    id: string;
    type?: TransactionType;
    amount?: number;
    walletId?: string;
    categoryId?: string;
    description?: string;
    endDate?: Date | null;
    frequency?: RecurrenceFrequency;
    interval?: number;
}

/**
 * Serializable version for storage (dates -> ISO strings)
 */
export interface SerializableRecurringTransaction {
    id: string;
    type: TransactionType;
    amount: number;
    walletId: string;
    categoryId: string;
    description?: string;
    startDate: string;
    endDate?: string;
    frequency: RecurrenceFrequency;
    interval: number;
    lastGeneratedDate: string;
    /** Absent in files written before REGISTRE V-98. */
    lastGeneratedIndex?: number;
    /** Absent in files written before REGISTRE V-98. */
    scheduleVersion?: number;
    isPaused: boolean;
    createdAt: string;
}

/**
 * Convert RecurringTransaction to serializable format
 */
export function serializeRecurringTransaction(
    rule: RecurringTransaction,
): SerializableRecurringTransaction {
    return {
        ...rule,
        startDate: rule.startDate.toISOString(),
        endDate: rule.endDate?.toISOString(),
        lastGeneratedDate: rule.lastGeneratedDate.toISOString(),
        createdAt: rule.createdAt.toISOString(),
    };
}

/**
 * Convert serializable format back to RecurringTransaction
 */
export function deserializeRecurringTransaction(
    data: SerializableRecurringTransaction,
): RecurringTransaction {
    return {
        ...data,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        lastGeneratedDate: new Date(data.lastGeneratedDate),
        createdAt: new Date(data.createdAt),
    };
}
