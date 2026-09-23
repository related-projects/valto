/**
 * useFormatting Hook
 *
 * Provides settings-aware formatting functions.
 * Re-renders when settings change via EventBus.
 */

import { useCallback, useEffect, useState } from 'react';
import { dataEvents } from '../core/events/dataEvents';
import { type AppSettings, loadSettings } from '../data/services/settingsService';
import { getCurrencyByCode } from '../domain/constants/currencies';
import { DEFAULT_NUMBER_FORMAT } from '../domain/constants/numberFormats';
import { amountPlaceholder as amountPlaceholderUtil } from '../utils/amountPlaceholder';
import { formatAmountCompact as formatAmountCompactUtil, formatAmount as formatAmountUtil, formatAmountWhole as formatAmountWholeUtil } from '../utils/formatAmount';
import { formatDate as formatDateUtil } from '../utils/formatDate';
import { centsToMajor as centsToMajorUtil, normalizeAmount as normalizeAmountUtil, parseAmountInputResult as parseAmountInputResultUtil, parseAmountInput as parseAmountInputUtil, parseAndNormalizeAmountResult as parseAndNormalizeAmountResultUtil, parseAndNormalizeAmount as parseAndNormalizeAmountUtil } from '../utils/normalizeAmount';

export function useFormatting() {
    const [settings, setSettings] = useState<AppSettings | null>(null);

    useEffect(() => {
        loadSettings().then(setSettings);
        const unsub = dataEvents.subscribe('settings', () => {
            loadSettings().then(setSettings);
        });
        return unsub;
    }, []);

    // Symbol and exponent come from the SAME currency definition, so they can never disagree.
    const currency = settings ? getCurrencyByCode(settings.currency) : null;
    const currencySymbol = currency?.symbol ?? '$';
    const decimals = currency?.decimals ?? 2;

    // The persisted key is still `decimalSeparator`, but its value now selects a
    // whole number-format profile: grouping, decimal, symbol side and symbol gap.
    const numberFormat = settings?.decimalSeparator ?? DEFAULT_NUMBER_FORMAT;
    const dateFormat = settings?.dateFormat ?? 'MM/DD/YYYY';

    const formatAmount = useCallback(
        (amountMinor: number) => formatAmountUtil(amountMinor, currencySymbol, numberFormat, decimals),
        [currencySymbol, numberFormat, decimals],
    );

    const formatAmountCompact = useCallback(
        (amountMinor: number) => formatAmountCompactUtil(amountMinor, currencySymbol, numberFormat, decimals),
        [currencySymbol, numberFormat, decimals],
    );

    const formatAmountWhole = useCallback(
        (amountMinor: number) => formatAmountWholeUtil(amountMinor, currencySymbol, numberFormat, decimals),
        [currencySymbol, numberFormat, decimals],
    );

    const formatDate = useCallback(
        (date: Date) => formatDateUtil(date, dateFormat),
        [dateFormat],
    );

    /** Parse a typed amount to major units, or null if invalid. Caller applies its own zero/sign policy. */
    const parseAmount = useCallback(
        (input: string) => parseAmountInputUtil(input, numberFormat, decimals),
        [numberFormat, decimals],
    );

    /** Parse a typed amount straight to integer minor units, or null if invalid or not positive. */
    const parseAmountToCents = useCallback(
        (input: string) => parseAndNormalizeAmountUtil(input, numberFormat, decimals),
        [numberFormat, decimals],
    );

    /** Convert a major-unit amount to integer minor units for the active currency. */
    const normalizeAmount = useCallback(
        (majorUnits: number) => normalizeAmountUtil(majorUnits, decimals),
        [decimals],
    );

    /** Convert stored minor units back to major units for seeding input fields. */
    const centsToMajor = useCallback(
        (minorUnits: number) => centsToMajorUtil(minorUnits, decimals),
        [decimals],
    );

    /**
     * Same acceptance rule as parseAmount, but a refusal names its cause so the
     * caller can say WHY rather than guessing. See normalizeAmount.ts.
     */
    const parseAmountResult = useCallback(
        (input: string) => parseAmountInputResultUtil(input, numberFormat, decimals),
        [numberFormat, decimals],
    );

    /** Same acceptance rule as parseAmountToCents; a refusal names its cause. */
    const parseAmountToCentsResult = useCallback(
        (input: string) => parseAndNormalizeAmountResultUtil(input, numberFormat, decimals),
        [numberFormat, decimals],
    );

    /**
     * The hint for an empty amount field: derived from the currency's exponent
     * and the user's decimal character, never a translated literal.
     */
    const amountPlaceholder = amountPlaceholderUtil(decimals, numberFormat);

    return {
        formatAmount,
        formatAmountCompact,
        formatAmountWhole,
        formatDate,
        parseAmount,
        parseAmountToCents,
        parseAmountResult,
        parseAmountToCentsResult,
        normalizeAmount,
        centsToMajor,
        amountPlaceholder,
        decimals,
        settings,
    };
}
