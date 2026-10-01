/**
 * useRecurringRules Hook
 *
 * Provides reactive access to recurring transaction rules.
 * Subscribes to 'recurringRules' EventBus events for auto-refresh.
 *
 * Also derives one status per rule. A rule could be listed as active and
 * produce nothing, with no user-facing signal; the status is what the row
 * shows instead. It is recomputed on every render from data already in memory
 * and is never persisted.
 *
 * The wallets and categories the derivation needs come from useWallets and
 * useCategories, which already hold them. No query is duplicated here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { container, getUseCaseDeps } from '../core/di/container';
import { dataEvents } from '../core/events/dataEvents';
import type { RecurringEngineDeps } from '../data/services/RecurringTransactionEngine';
import { editRecurringRule, pauseRecurringRule, type PauseOutcome } from '../data/services/recurringRuleChanges';
import type { RecurringTransaction, CreateRecurringTransactionDTO, UpdateRecurringTransactionDTO } from '../domain/entities/RecurringTransaction';
import {
    RecurringRuleStatus,
    deriveRecurringRuleStatus,
    deriveScheduleStatus,
} from '../domain/recurring';
import { useCategories } from './useCategories';
import { useWallets } from './useWallets';

/** The engine's dependencies, assembled as the rules screen assembles them for a create. */
function engineDeps(): RecurringEngineDeps {
    return {
        recurringRepo: container.recurringTransactionRepository,
        transactionRepo: container.transactionRepository,
        walletRepo: container.walletRepository,
        categoryRepo: container.categoryRepository,
        eventBus: dataEvents,
        runInTransaction: getUseCaseDeps().runInTransaction,
    };
}

export function useRecurringRules() {
    const [rules, setRules] = useState<RecurringTransaction[]>([]);
    const [loading, setLoading] = useState(true);

    const { wallets, loading: walletsLoading } = useWallets();
    const { categories, loading: categoriesLoading } = useCategories();

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

    // An edit and a pause first record what is due under the stored rule
    // (REGISTRE V-105); see recurringRuleChanges. A refusal is thrown to the
    // screen, which names it.
    const updateRule = useCallback(
        async (dto: UpdateRecurringTransactionDTO) => {
            const rule = await editRecurringRule(engineDeps(), dto);
            dataEvents.emit('recurringRules');
            return rule;
        },
        [],
    );

    const deleteRule = useCallback(
        async (id: string) => {
            await repo.delete(id);
            dataEvents.emit('recurringRules');
        },
        [repo],
    );

    const pauseRule = useCallback(
        async (id: string): Promise<PauseOutcome> => {
            const outcome = await pauseRecurringRule(engineDeps(), id);
            dataEvents.emit('recurringRules');
            return outcome;
        },
        [],
    );

    const resumeRule = useCallback(
        async (id: string) => {
            await repo.resumeRule(id);
            dataEvents.emit('recurringRules');
        },
        [repo],
    );

    // Both reference sets have to be loaded before an unresolved id means
    // "gone" rather than "not read yet". Until then the rule's own schedule is
    // all that can honestly be shown: flashing a fault badge for the width of
    // one load would be a lie, and PAUSED and EXPIRED need no reference at all.
    const referencesReady = !walletsLoading && !categoriesLoading;

    const statuses = useMemo(() => {
        const today = new Date();
        const walletById = new Map(wallets.map((w) => [w.id, w]));
        const categoryById = new Map(categories.map((c) => [c.id, c]));

        const byRuleId: Record<string, RecurringRuleStatus> = {};
        for (const rule of rules) {
            byRuleId[rule.id] = referencesReady
                ? deriveRecurringRuleStatus(
                    rule,
                    {
                        wallet: walletById.get(rule.walletId) ?? null,
                        category: categoryById.get(rule.categoryId) ?? null,
                    },
                    today,
                )
                : deriveScheduleStatus(rule, today) ?? RecurringRuleStatus.ACTIVE;
        }
        return byRuleId;
    }, [rules, wallets, categories, referencesReady]);

    return {
        rules,
        statuses,
        loading,
        createRule,
        updateRule,
        deleteRule,
        pauseRule,
        resumeRule,
        refresh: loadRules,
    };
}
