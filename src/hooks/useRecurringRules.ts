/**
 * useRecurringRules Hook
 *
 * Provides reactive access to recurring transaction rules.
 * Subscribes to 'recurringRules' EventBus events for auto-refresh.
 */

import { useCallback, useEffect, useState } from 'react';
import { container } from '../core/di/container';
import { dataEvents } from '../core/events/dataEvents';
import type { RecurringTransaction, CreateRecurringTransactionDTO, UpdateRecurringTransactionDTO } from '../domain/entities/RecurringTransaction';

export function useRecurringRules() {
    const [rules, setRules] = useState<RecurringTransaction[]>([]);
    const [loading, setLoading] = useState(true);

    const repo = container.recurringTransactionRepository;

    const loadRules = useCallback(async () => {
        try {
            const data = await repo.getAll();
            setRules(data);
        } catch (error) {
            console.error('[useRecurringRules] Failed to load rules:', error);
        } finally {
            setLoading(false);
        }
    }, [repo]);

    useEffect(() => {
        loadRules();
        const unsub = dataEvents.subscribe('recurringRules', loadRules);
        return unsub;
    }, [loadRules]);

    const createRule = useCallback(
        async (dto: CreateRecurringTransactionDTO) => {
            const rule = await repo.create(dto);
            dataEvents.emit('recurringRules');
            return rule;
        },
        [repo],
    );

    const updateRule = useCallback(
        async (dto: UpdateRecurringTransactionDTO) => {
            const rule = await repo.updateFromDTO(dto);
            dataEvents.emit('recurringRules');
            return rule;
        },
        [repo],
    );

    const deleteRule = useCallback(
        async (id: string) => {
            await repo.delete(id);
            dataEvents.emit('recurringRules');
        },
        [repo],
    );

    const pauseRule = useCallback(
        async (id: string) => {
            await repo.pauseRule(id);
            dataEvents.emit('recurringRules');
        },
        [repo],
    );

    const resumeRule = useCallback(
        async (id: string) => {
            await repo.resumeRule(id);
            dataEvents.emit('recurringRules');
        },
        [repo],
    );

    return {
        rules,
        loading,
        createRule,
        updateRule,
        deleteRule,
        pauseRule,
        resumeRule,
        refresh: loadRules,
    };
}
