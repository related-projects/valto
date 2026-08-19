/**
 * Sentry Breadcrumb Guard
 *
 * Drops every breadcrumb whose category is 'console' before it can reach a
 * Sentry event. Wired into the single Sentry.init in app/_layout.tsx.
 *
 * WHY THIS EXISTS - do not delete it as redundant, and do not narrow it.
 *
 * This app prints financial and user data to the console in several places:
 *   - src/data/migrations/v5_import_from_asyncstorage.ts:110 - per-wallet
 *     stored balance, ledger balance and drift, with the wallet id
 *   - src/data/services/RecurringTransactionEngine.ts:111 - instalment and
 *     rule detail; the surrounding error logs carry rule ids
 *   - src/data/seed/seedService.ts:78 - a category name
 *   - src/data/repositories/WalletRepository.ts:58 and
 *     src/data/repositories/RecurringTransactionRepository.ts:60 - the
 *     ValidationError message, which embeds the value that was rejected
 * Roughly 60 further console calls in src/ and app/ are unguarded, and nothing
 * stops the next one from being added.
 *
 * @sentry/react-native 7.2.0 turns every one of those calls into a breadcrumb
 * BY DEFAULT. getDefaultIntegrations() always installs breadcrumbsIntegration(),
 * whose React Native wrapper hard-defaults 'console: true' - it is not gated on
 * platform, on __DEV__, or on anything else. The resulting breadcrumb carries
 * the joined text in .message AND the raw argument list in .data.arguments, and
 * scopeSync mirrors it into the native SDK's scope, so a native crash reports it
 * too. So this is not defence against a future SDK change: without this guard,
 * balances ship with the next captured event today.
 *
 * The drop is deliberately blanket. It is NOT a content filter: deciding which
 * log lines happen to carry money is a losing game, and it would have to be
 * re-decided every time somebody adds a console call. Categories other than
 * 'console' - navigation, ui.click, http, device events, Sentry's own
 * breadcrumbs - pass through untouched, because those are the ones that make a
 * crash report worth reading.
 *
 * Note this guard has no effect on the device system log. Sentry's console
 * instrumentation always calls the original console method; this filter runs
 * strictly downstream of that, inside Sentry's own pipeline. Everything logged
 * here is still readable via adb logcat / Console.app. That is a separate
 * problem and is not addressed by anything in this file.
 */

import type { Breadcrumb } from '@sentry/react-native';

/**
 * Sentry beforeBreadcrumb hook. Returns null for console breadcrumbs, which
 * discards them; returns every other breadcrumb unchanged.
 */
export function dropConsoleBreadcrumbs(breadcrumb: Breadcrumb): Breadcrumb | null {
    if (breadcrumb.category === 'console') {
        return null;
    }
    return breadcrumb;
}
