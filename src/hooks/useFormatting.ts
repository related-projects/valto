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
import { formatAmountCompact as formatAmountCompactUtil, formatAmount as formatAmountUtil, formatAmountWhole as formatAmountWholeUtil } from '../utils/formatAmount';
import { formatDate as formatDateUtil } from '../utils/formatDate';
import { centsToMajor as centsToMajorUtil, normalizeAmount as normalizeAmountUtil, parseAmountInput as parseAmountInputUtil, parseAndNormalizeAmount as parseAndNormalizeAmountUtil } from '../utils/normalizeAmount';

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

    const separator = settings?.decimalSeparator ?? 'dot';
    const dateFormat = settings?.dateFormat ?? 'MM/DD/YYYY';

    const formatAmount = useCallback(
        (amountMinor: number) => formatAmountUtil(amountMinor, currencySymbol, separator, decimals),
        [currencySymbol, separator, decimals],
    );

    const formatAmountCompact = useCallback(
        (amountMinor: number) => formatAmountCompactUtil(amountMinor, currencySymbol, separator, decimals),
        [currencySymbol, separator, decimals],
    );

    const formatAmountWhole = useCallback(
        (amountMinor: number) => formatAmountWholeUtil(amountMinor, currencySymbol, separator, decimals),
        [currencySymbol, separator, decimals],
    );

    const formatDate = useCallback(
        (date: Date) => formatDateUtil(date, dateFormat),
        [dateFormat],
    );

    /** Parse a typed amount to major units, or null if invalid. Caller applies its own zero/sign policy. */
    const parseAmount = useCallback(
        (input: string) => parseAmountInputUtil(input, separator, decimals),
        [separator, decimals],
    );

    /** Parse a typed amount straight to integer minor units, or null if invalid or not positive. */
    const parseAmountToCents = useCallback(
        (input: string) => parseAndNormalizeAmountUtil(input, separator, decimals),
        [separator, decimals],
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

    return {
        formatAmount,
        formatAmountCompact,
        formatAmountWhole,
        formatDate,
        parseAmount,
        parseAmountToCents,
        normalizeAmount,
        centsToMajor,
        decimals,
        settings,
    };
}
