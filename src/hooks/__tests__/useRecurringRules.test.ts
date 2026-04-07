/**
 * useRecurringRules Hook Tests
 *
 * Tests CRUD operations, pause/resume, event emission,
 * and error handling for recurring transaction rules.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { RecurringTransactionRepository } from '../../data/repositories/RecurringTransactionRepository';
import { TransactionType, RecurrenceFrequency } from '../../domain/entities';

let mockStorage: InMemoryStorage;
let mockRecurringRepo: RecurringTransactionRepository;

const mockEmit = jest.fn();
const mockSubscribe = jest.fn(() => jest.fn());

jest.mock('../../core/di/container', () => ({
    container: {
        get recurringTransactionRepository() {
            return mockRecurringRepo;
        },
    },
}));

jest.mock('../../core/events/dataEvents', () => ({
    dataEvents: {
        subscribe: (...args: any[]) => mockSubscribe(...args),
        emit: (...args: any[]) => mockEmit(...args),
        emitMultiple: jest.fn(),
    },
}));

import { useRecurringRules } from '../useRecurringRules';

describe('useRecurringRules', () => {
    beforeEach(() => {
        mockStorage = new InMemoryStorage();
        mockRecurringRepo = new RecurringTransactionRepository(mockStorage);
        mockEmit.mockClear();
        mockSubscribe.mockClear();
        mockSubscribe.mockReturnValue(jest.fn());
    });

    const sampleDTO = {
        type: TransactionType.EXPENSE,
        amount: 50000,
        walletId: 'w-1',
        categoryId: 'cat-food',
        description: 'Monthly groceries',
        startDate: new Date('2026-01-01'),
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
    };

    it('loads rules on mount', async () => {
        await mockRecurringRepo.create(sampleDTO);

        const { result } = renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.rules).toHaveLength(1);
        expect(result.current.rules[0].amount).toBe(50000);
    });

    it('starts with loading true and sets to false after load', async () => {
        const { result } = renderHook(() => useRecurringRules());

        // Initially loading
        expect(result.current.loading).toBe(true);

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.rules).toEqual([]);
    });

    it('createRule creates a rule and emits event', async () => {
        const { result } = renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let createdRule: any;
        await act(async () => {
            createdRule = await result.current.createRule(sampleDTO);
        });

        expect(createdRule).toBeDefined();
        expect(createdRule.amount).toBe(50000);
        expect(mockEmit).toHaveBeenCalledWith('recurringRules');
    });

    it('updateRule updates and emits event', async () => {
        const rule = await mockRecurringRepo.create(sampleDTO);

        const { result } = renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.updateRule({
                id: rule.id,
                amount: 75000,
            });
        });

        expect(mockEmit).toHaveBeenCalledWith('recurringRules');
    });

    it('deleteRule deletes and emits event', async () => {
        const rule = await mockRecurringRepo.create(sampleDTO);

        const { result } = renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.rules).toHaveLength(1);
        });

        await act(async () => {
            await result.current.deleteRule(rule.id);
        });

        expect(mockEmit).toHaveBeenCalledWith('recurringRules');
    });

    it('pauseRule calls repo.pauseRule and emits event', async () => {
        const rule = await mockRecurringRepo.create(sampleDTO);

        const { result } = renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.pauseRule(rule.id);
        });

        expect(mockEmit).toHaveBeenCalledWith('recurringRules');
    });

    it('resumeRule calls repo.resumeRule and emits event', async () => {
        const rule = await mockRecurringRepo.create(sampleDTO);
        await mockRecurringRepo.pauseRule(rule.id);

        const { result } = renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.resumeRule(rule.id);
        });

        expect(mockEmit).toHaveBeenCalledWith('recurringRules');
    });

    it('subscribes to recurringRules events on mount', async () => {
        renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(mockSubscribe).toHaveBeenCalledWith('recurringRules', expect.any(Function));
        });
    });

    it('refresh reloads rules from repository', async () => {
        const { result } = renderHook(() => useRecurringRules());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Add a rule directly to repo
        await mockRecurringRepo.create(sampleDTO);

        // Manually refresh
        await act(async () => {
            await result.current.refresh();
        });

        expect(result.current.rules).toHaveLength(1);
    });
});
