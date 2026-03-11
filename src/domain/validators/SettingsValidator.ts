/**
 * Settings Validator
 *
 * Pre-persistence validation for AppSettings objects.
 * All checks are pure and side-effect-free.
 */

import type { AppSettings } from '../../data/services/settingsService';
import { ValidationError } from './ValidationError';

const VALID_THEMES = ['light', 'dark', 'system'] as const;
const VALID_DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;
const VALID_FIRST_DAYS = ['monday', 'sunday'] as const;
const VALID_DECIMAL_SEPS = ['dot', 'comma'] as const;

/**
 * Validate an AppSettings object before persistence.
 * Throws `ValidationError` on the first invalid field.
 */
export function validateSettings(settings: AppSettings): void {
    if (!settings.language || typeof settings.language !== 'string') {
        throw new ValidationError('Settings', 'language', settings.language, 'Settings language must be a non-empty string');
    }

    if (!settings.currency || typeof settings.currency !== 'string') {
        throw new ValidationError('Settings', 'currency', settings.currency, 'Settings currency must be a non-empty string');
    }

    if (!(VALID_THEMES as readonly string[]).includes(settings.theme)) {
        throw new ValidationError('Settings', 'theme', settings.theme, `Settings theme must be one of: ${VALID_THEMES.join(', ')}`);
    }

    if (typeof settings.notificationsEnabled !== 'boolean') {
        throw new ValidationError('Settings', 'notificationsEnabled', settings.notificationsEnabled, 'Settings notificationsEnabled must be a boolean');
    }

    if (typeof settings.currencyLocked !== 'boolean') {
        throw new ValidationError('Settings', 'currencyLocked', settings.currencyLocked, 'Settings currencyLocked must be a boolean');
    }

    if (!(VALID_DATE_FORMATS as readonly string[]).includes(settings.dateFormat)) {
        throw new ValidationError('Settings', 'dateFormat', settings.dateFormat, `Settings dateFormat must be one of: ${VALID_DATE_FORMATS.join(', ')}`);
    }

    if (!(VALID_FIRST_DAYS as readonly string[]).includes(settings.firstDayOfWeek)) {
        throw new ValidationError('Settings', 'firstDayOfWeek', settings.firstDayOfWeek, `Settings firstDayOfWeek must be one of: ${VALID_FIRST_DAYS.join(', ')}`);
    }

    if (!(VALID_DECIMAL_SEPS as readonly string[]).includes(settings.decimalSeparator)) {
        throw new ValidationError('Settings', 'decimalSeparator', settings.decimalSeparator, `Settings decimalSeparator must be one of: ${VALID_DECIMAL_SEPS.join(', ')}`);
    }
}
