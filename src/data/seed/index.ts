/**
 * Seed Layer Exports
 * 
 * Central export point for seed data and initialization service.
 */

export { defaultCategories, defaultWallets } from './seedData';
export {
    initializeSeedData,
    resetSeedFlag, type SeedResult
} from './seedService';

