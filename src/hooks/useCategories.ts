/**
 * useCategories Hook
 * 
 * React hook for managing categories with the repository layer.
 * Provides category operations and filtering for UI components.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCategoryRepository, getTransactionRepository } from '../core/di';
import { dataEvents } from '../core/events';
import { Category, CategoryType, CreateCategoryDTO, UpdateCategoryDTO } from '../domain/entities';

interface UseCategoriesResult {
    categories: Category[];
    expenseCategories: Category[];
    incomeCategories: Category[];
    loading: boolean;
    error: string | null;
    refreshCategories: () => Promise<void>;
    createCategory: (dto: CreateCategoryDTO) => Promise<Category>;
    updateCategory: (dto: UpdateCategoryDTO) => Promise<Category>;
    deleteCategory: (id: string) => Promise<void>;
}

/**
 * Hook for managing categories
 */
export function useCategories(): UseCategoriesResult {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const categoryRepo = getCategoryRepository();

    /**
     * Load all categories from repository
     */
    const loadCategories = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await categoryRepo.getAll();
            setCategories(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load categories');
            console.error('Failed to load categories:', err);
        } finally {
            setLoading(false);
        }
    }, [categoryRepo]);

    /**
     * Create a new category
     */
    const createCategory = useCallback(async (dto: CreateCategoryDTO): Promise<Category> => {
        try {
            const category = await categoryRepo.create(dto);
            await loadCategories();

            // Emit event so other components (like Add Transaction Modal) update
            dataEvents.emit('categories');

            return category;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create category';
            setError(msg);
            throw new Error(msg);
        }
    }, [categoryRepo, loadCategories]);

    /**
     * Update a category
     */
    const updateCategory = useCallback(async (dto: UpdateCategoryDTO): Promise<Category> => {
        try {
            const category = await categoryRepo.updateFromDTO(dto);
            await loadCategories();

            dataEvents.emit('categories');

            return category;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to update category';
            setError(msg);
            throw new Error(msg);
        }
    }, [categoryRepo, loadCategories]);

    /**
     * Delete a category
     */
    const deleteCategory = useCallback(async (id: string): Promise<void> => {
        try {
            // Check if used in transactions
            const transactionRepo = getTransactionRepository();
            const transactions = await transactionRepo.getByCategoryId(id);

            if (transactions.length > 0) {
                throw new Error(`Cannot delete category. It is used in ${transactions.length} transactions.`);
            }

            await categoryRepo.delete(id);
            await loadCategories();

            dataEvents.emit('categories');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete category';
            // Propagate the specific error message (e.g. usage check)
            throw new Error(msg);
        }
    }, [categoryRepo, loadCategories]);

    /**
     * Get expense categories
     */
    const expenseCategories = useMemo(
        () => categories.filter(cat => cat.type === CategoryType.EXPENSE),
        [categories]
    );

    /**
     * Get income categories
     */
    const incomeCategories = useMemo(
        () => categories.filter(cat => cat.type === CategoryType.INCOME),
        [categories]
    );

    /**
     * Refresh categories from repository
     */
    const refreshCategories = useCallback(async () => {
        await loadCategories();
    }, [loadCategories]);

    // Load categories on mount
    useEffect(() => {
        loadCategories();

        // Subscribe to external changes
        const unsubscribe = dataEvents.subscribe('categories', loadCategories);
        return unsubscribe;
    }, [loadCategories]);

    return {
        categories,
        expenseCategories,
        incomeCategories,
        loading,
        error,
        refreshCategories,
        createCategory,
        updateCategory,
        deleteCategory,
    };
}
