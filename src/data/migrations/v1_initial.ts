/**
 * v1 — Initial Schema
 *
 * Baseline migration that establishes version 1.
 * No data transformation needed — this simply marks the starting point
 * for the migration system.
 */

import type { Migration } from './migrationRunner';

export const v1_initial: Migration = {
    version: 1,
    name: 'initial_schema',
    up: async () => {
        // No-op: baseline migration
        // All existing storage keys and data shapes are already in place.
        // This migration exists to establish version tracking.
    },
};
