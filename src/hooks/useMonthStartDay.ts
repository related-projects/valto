/**
 * useMonthStartDay Hook
 *
 * The stored "month starts on" day (settings field monthStartDay, REGISTRE
 * C20), for the hooks and screens that compute periods through
 * src/domain/period. Read on mount and again on every 'settings' data event,
 * the one useSettings emits after a change, a restore or a reset, so a mounted
 * Dashboard or Reports tab regroups at once.
 *
 * Until the first read lands, and whenever it fails, the day is
 * DEFAULT_PERIOD_START_DAY (1): the calendar month, today's behaviour. A read
 * that finds the day already shown sets nothing, so with the default nothing
 * renders again.
 */

import { useEffect, useState } from 'react';
import { dataEvents } from '../core/events';
import { loadSettings } from '../data/services/settingsService';
import { DEFAULT_PERIOD_START_DAY, toPeriodStartDay } from '../domain/period';

/** The stored start day, 1 on any failure. Never rejects. */
function readMonthStartDay(): Promise<number> {
    return Promise.resolve()
        .then(() => loadSettings())
        .then((settings) => toPeriodStartDay(settings?.monthStartDay))
        .catch(() => DEFAULT_PERIOD_START_DAY);
}

export function useMonthStartDay(): number {
    const [startDay, setStartDay] = useState(DEFAULT_PERIOD_START_DAY);

    useEffect(() => {
        let active = true;
        const read = (): void => {
            readMonthStartDay().then((day) => {
                // The same day again is a no-op for React: no render.
                if (active) {
                    setStartDay(day);
                }
            });
        };

        read();
        const unsubscribe = dataEvents.subscribe('settings', read);
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    return startDay;
}
