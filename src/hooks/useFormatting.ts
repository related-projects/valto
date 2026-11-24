/**
 * useFormatting Hook
 *
 * Provides settings-aware formatting functions.
 * Re-renders when settings change via EventBus.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dataEvents } from '../core/events/dataEvents';
import { type AppSettings, loadSettings } from '../data/services/settingsService';
import { MAX_ENTRY_AMOUNT_MINOR } from '../domain/constants/amounts';
import { getCurrencyByCode } from '../domain/constants/currencies';
import { DEFAULT_LANGUAGE_CODE } from '../domain/constants/languages';
import { DEFAULT_NUMBER_FORMAT } from '../domain/constants/numberFormats';
import { amountPlaceholder as amountPlaceholderUtil } from '../utils/amountPlaceholder';
import { formatAmountCompactLarge as formatAmountCompactLargeUtil, formatAmount as formatAmountUtil, formatAmountWholeCompactLarge as formatAmountWholeCompactLargeUtil, formatAmountWhole as formatAmountWholeUtil } from '../utils/formatAmount';
import { formatDate as formatDateUtil } from '../utils/formatDate';
import { formatPercentNumber as formatPercentNumberUtil, percentLimitText, percentOutOfRange } from '../utils/formatPercent';
import { centsToMajor as centsToMajorUtil, normalizeAmount as normalizeAmountUtil, parseAmountInputResult as parseAmountInputResultUtil, parseAmountInput as parseAmountInputUtil, parseAndNormalizeAmountResult as parseAndNormalizeAmountResultUtil, parseAndNormalizeAmount as parseAndNormalizeAmountUtil } from '../utils/normalizeAmount';

export function useFormatting() {
    const { t } = useTranslation();
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
    // Picks the compact suffixes only; a language without a complete bundle gets en's.
    const language = settings?.language ?? DEFAULT_LANGUAGE_CODE;

    const formatAmount = useCallback(
        (amountMinor: number) => formatAmountUtil(amountMinor, currencySymbol, numberFormat, decimals),
        [currencySymbol, numberFormat, decimals],
    );

    /**
     * For tight places only (REGISTRE V-128): exact below 1 000 000 major units,
     * compact from there. Pair it with an accessibilityLabel from formatAmount.
     */
    const formatAmountCompactLarge = useCallback(
        (amountMinor: number) => formatAmountCompactLargeUtil(amountMinor, currencySymbol, numberFormat, decimals, language),
        [currencySymbol, numberFormat, decimals, language],
    );

    /** formatAmountCompactLarge for a place that shows whole units below 1 000 000. */
    const formatAmountWholeCompactLarge = useCallback(
        (amountMinor: number) => formatAmountWholeCompactLargeUtil(amountMinor, currencySymbol, numberFormat, decimals, language),
        [currencySymbol, numberFormat, decimals, language],
    );

    const formatAmountWhole = useCallback(
        (amountMinor: number) => formatAmountWholeUtil(amountMinor, currencySymbol, numberFormat, decimals),
        [currencySymbol, numberFormat, decimals],
    );

    /**
     * The digits of a percentage on the 0-100 scale, with the same decimal
     * character as the amounts. No "%" and no grouping: see formatPercent.ts.
     * Beyond 999 in either direction, the words "over 999" / "below -999" in
     * the app language instead (REGISTRE C28), so every site that appends "%"
     * shows "over 999%".
     */
    const formatPercentNumber = useCallback(
        (value: number, digits: number) => {
            const range = percentOutOfRange(value);
            return range ? percentLimitText(range, t) : formatPercentNumberUtil(value, digits, numberFormat);
        },
        [numberFormat, t],
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

    /**
     * The largest amount a field accepts (REGISTRE V-128), formatted like every
     * other amount in the active currency, for the too-large refusal to name.
     */
    const maxEntryAmount = formatAmountUtil(MAX_ENTRY_AMOUNT_MINOR, currencySymbol, numberFormat, decimals);

    return {
        formatAmount,
        formatAmountCompactLarge,
        formatAmountWhole,
        formatAmountWholeCompactLarge,
        formatPercentNumber,
        formatDate,
        parseAmount,
        parseAmountToCents,
        parseAmountResult,
        parseAmountToCentsResult,
        normalizeAmount,
        centsToMajor,
        amountPlaceholder,
        maxEntryAmount,
        decimals,
        settings,
    };
}
