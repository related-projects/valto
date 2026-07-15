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
import { parseAmountInput as parseAmountInputUtil, parseAndNormalizeAmount as parseAndNormalizeAmountUtil } from '../utils/normalizeAmount';

export function useFormatting() {
    const [settings, setSettings] = useState<AppSettings | null>(null);

    useEffect(() => {
        loadSettings().then(setSettings);
        const unsub = dataEvents.subscribe('settings', () => {
            loadSettings().then(setSettings);
        });
        return unsub;
    }, []);

    const currencySymbol = settings
        ? getCurrencyByCode(settings.currency).symbol
        : '$';

    const separator = settings?.decimalSeparator ?? 'dot';
    const dateFormat = settings?.dateFormat ?? 'MM/DD/YYYY';

    const formatAmount = useCallback(
        (amountMinor: number) => formatAmountUtil(amountMinor, currencySymbol, separator),
        [currencySymbol, separator],
    );

    const formatAmountCompact = useCallback(
        (amountMinor: number) => formatAmountCompactUtil(amountMinor, currencySymbol, separator),
        [currencySymbol, separator],
    );

    const formatAmountWhole = useCallback(
        (amountMinor: number) => formatAmountWholeUtil(amountMinor, currencySymbol, separator),
        [currencySymbol, separator],
    );

    const formatDate = useCallback(
        (date: Date) => formatDateUtil(date, dateFormat),
        [dateFormat],
    );

    /** Parse a typed amount to major units, or null if invalid. Caller applies its own zero/sign policy. */
    const parseAmount = useCallback(
        (input: string) => parseAmountInputUtil(input, separator),
        [separator],
    );

    /** Parse a typed amount straight to integer cents, or null if invalid or not positive. */
    const parseAmountToCents = useCallback(
        (input: string) => parseAndNormalizeAmountUtil(input, separator),
        [separator],
    );

    return {
        formatAmount,
        formatAmountCompact,
        formatAmountWhole,
        formatDate,
        parseAmount,
        parseAmountToCents,
        settings,
    };
}
