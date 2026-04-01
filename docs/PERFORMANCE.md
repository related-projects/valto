# Performance Profiling Guide — Valto

## Overview

This guide documents how to profile and identify performance issues in Valto using tools compatible with the Expo managed workflow.

> **Note:** Flipper is not compatible with Expo managed workflow. Use the tools documented below instead.

---

## 1. React DevTools Profiler

### Setup

React DevTools is available out of the box with Expo. Launch it via:

```bash
# Start Expo with DevTools
npx expo start

# In the terminal, press Shift+M to open DevTools
# Or press 'j' to open Chrome DevTools
```

### Profiling Workflow

1. Open React DevTools in the browser
2. Navigate to the **Profiler** tab
3. Click **Record** (⏺)
4. Interact with the app (e.g., navigate to Reports screen, add a transaction)
5. Click **Stop** (⏹)
6. Analyze the flame chart for expensive renders

### What to Look For

| Signal | Meaning |
|--------|---------|
| Long bars in flame chart | Expensive component renders |
| Components rendering without props changing | Missing `React.memo` or unstable references |
| Frequent re-renders of list items | Missing key optimization or parent state changes |

---

## 2. Known Performance Hotspots

### Reports Screen (`useReports`)
- **Monthly aggregation** iterates all transactions on every render cycle
- **Category breakdown** computes percentages for donut chart
- **Mitigation**: Already uses `useMemo` — verify memo dependencies are stable

### Transaction List (`TransactionList`)
- Uses FlatList with pagination
- **Risk**: Large datasets (1000+ transactions) could cause scroll jank
- **Mitigation**: `getTransactionsPage()` pagination is implemented in the repository layer

### Dashboard (`useDashboard`)
- Aggregates data from multiple hooks (wallets, transactions, budgets)
- **Risk**: Cascade re-renders when any data source changes
- **Mitigation**: Each sub-hook uses `useMemo` for derived computations

### Budget Summaries (`useBudgets`)
- Computes spending per category by iterating monthly transactions
- **Risk**: O(n * m) where n = transactions, m = budgets
- **Mitigation**: Acceptable for typical dataset sizes (< 1000 transactions/month)

---

## 3. Performance Best Practices

### Do
- Use `useMemo` for expensive computations over transaction/budget data
- Use `useCallback` for handler functions passed as props
- Use `React.memo` for pure presentational components
- Use FlatList (not ScrollView) for lists > 20 items
- Use `getItemLayout` for fixed-height list items

### Don't
- Don't use inline arrow functions in JSX props (creates new references)
- Don't compute derived state in render without memoization
- Don't pass entire entity objects as dependencies when only IDs are needed
- Don't use `useEffect` for synchronous derived state (use `useMemo` instead)

---

## 4. AsyncStorage Performance

### Current State
- All repositories use AsyncStorage via `IStorage` adapter
- Each read deserializes the entire entity array from JSON
- Each write serializes the entire array back

### Future Optimization Path
- Storage adapters for MMKV or SQLite are stubbed (`MMKVAdapter.ts`, `SQLiteAdapter.ts`)
- MMKV provides ~10x faster sync read/write vs AsyncStorage
- SQLite enables indexed queries without full-array deserialization

### When to Migrate
- When transaction count exceeds 5,000
- When getAll() latency exceeds 100ms (measure with console.time)
- When FlatList scroll drops below 55fps consistently

---

## 5. Measuring Performance

### Console Timing

```typescript
// Add to any function to measure execution time
console.time('[Perf] loadTransactions');
const transactions = await repo.getAll();
console.timeEnd('[Perf] loadTransactions');
```

### React Native Performance Monitor

```bash
# In the Expo dev client, shake device or press Ctrl+M (Android) / Cmd+D (iOS)
# Select "Performance Monitor" to see FPS overlay
```

### Bundle Size Analysis

```bash
# Analyze bundle size with expo-doctor
npx expo-doctor
```

---

## 6. Performance Observations (Phase 15 Audit)

| Area | Status | Notes |
|------|--------|-------|
| Domain calculations | ✅ Efficient | Pure functions with O(n) complexity |
| Repository reads | ⚠️ Adequate | Full-array deserialization, OK up to ~5K entities |
| Hook memoization | ✅ Good | All expensive computations use `useMemo` |
| Event bus reactivity | ✅ Good | Targeted channel subscriptions, not global |
| FlatList usage | ✅ Good | Pagination implemented for transactions |
| Re-render hygiene | ⚠️ Review | Dashboard composes many hooks — monitor re-render cascades |
