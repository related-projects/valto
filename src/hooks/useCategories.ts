/**
 * useCategories Hook
 * 
 * React hook for managing categories with the repository layer.
 * Provides category operations and filtering for UI components.
 */

import { useCallback, useEffect, useState } from 'react';
import { getCategoryRepository } from '../core/di';
import { Category, CategoryType } from '../domain/entities';

interface UseCategoriesResult {
    categories: Category[];
    expenseCategories: Category[];
    incomeCategories: Category[];
    loading: boolean;
    error: string | null;
    refreshCategories: () => Promise<void>;
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
     * Get expense categories
     */
    const expenseCategories = categories.filter(
        cat => cat.type === CategoryType.EXPENSE
    );

    /**
     * Get income categories
     */
    const incomeCategories = categories.filter(
        cat => cat.type === CategoryType.INCOME
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
    }, [loadCategories]);

    return {
        categories,
        expenseCategories,
        incomeCategories,
        loading,
        error,
        refreshCategories,
    };
}
