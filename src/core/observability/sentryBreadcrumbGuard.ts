/**
 * Sentry Privacy Guards
 *
 * Everything the app does to stop the Sentry SDK collecting data the project
 * never declared. Three hooks, all wired into the single Sentry.init in
 * app/_layout.tsx:
 *
 *   dropConsoleBreadcrumbs      - beforeBreadcrumb  (registry V-34)
 *   stripPersistentIdentifiers  - beforeSend        (registry V-33)
 *   withoutXhrBreadcrumbs       - integrations      (registry V-33)
 *
 * The file is still named sentryBreadcrumbGuard.ts because the breadcrumb
 * guard landed first; the name is historical, the scope is not.
 *
 * ===========================================================================
 * 1. dropConsoleBreadcrumbs - beforeBreadcrumb
 * ===========================================================================
 *
 * Drops every breadcrumb whose category is 'console' before it can reach a
 * Sentry event.
 *
 * WHY THIS EXISTS - do not delete it as redundant, and do not narrow it.
 *
 * This app prints financial and user data to the console in several places.
 * Each bullet gives the file and the grep that lands on the line, never a line
 * number: this list carried three stale pointers until somebody checked them,
 * and a number is repaired by editing the number, which proves nothing. A grep
 * that returns no hit is itself the signal that the line moved or went away.
 *   - src/data/migrations/v5_import_from_asyncstorage.ts - per-wallet stored
 *     balance, ledger balance and drift, with the wallet id.
 *     `grep -n 'Balance drift after v5 import' src/data/migrations/v5_import_from_asyncstorage.ts`
 *   - src/data/services/RecurringTransactionEngine.ts - the amount a skipped
 *     rule needed and the balance actually available, with the rule id; the
 *     surrounding error logs carry rule ids.
 *     `grep -n 'skipped.availableBalance' src/data/services/RecurringTransactionEngine.ts`
 *   - src/data/seed/seedService.ts - a category name.
 *     `grep -n 'Failed to create default category' src/data/seed/seedService.ts`
 *   - src/data/repositories/WalletRepository.ts,
 *     src/data/repositories/RecurringTransactionRepository.ts and
 *     src/data/repositories/TransactionRepository.ts - the entity and the field
 *     that failed validation.
 *     `grep -rn 'Validation failed: ' src/data/repositories`
 *     NOT the rejected value: an earlier version of this comment said it was,
 *     and that was wrong. ValidationError takes `value` and `message` as
 *     separate constructor parameters and hands only `message` to super
 *     (src/domain/validators/ValidationError.ts), and every construction site
 *     passes a literal or interpolates a module constant list.
 *     `grep -rn 'new ValidationError(' src` is the check; this sentence is not.
 *     The bullet stays because the line is still console traffic the guard
 *     covers, and because it is the example of why per-line judgement about
 *     which log "carries money" is not worth relying on.
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
 *
 * ===========================================================================
 * 2. stripPersistentIdentifiers - beforeSend
 * ===========================================================================
 *
 * The SDK attaches TWO persistent identifiers that nothing in this project
 * asked for, and NO SentryOptions flag turns either of them off. beforeSend is
 * the only lever.
 *
 *   event.user
 *     The per-install identifier. Both native layers inject it with the same
 *     rule - "if there is no user id, make one":
 *       - iOS:     RNSentry.mm fetchNativeDeviceContexts sets
 *                  user = { id: PrivateSentrySDKOnly.installationID }, and
 *                  SentryClient.m setUserIdIfNoUserSet does the same for
 *                  native events. The value is a UUID persisted in a file
 *                  named INSTALLATION under Library/Caches.
 *       - Android: InternalSentrySdk.serializeScope sets
 *                  User.setId(Installation.id(context)), a UUID persisted in
 *                  a file named INSTALLATION under getFilesDir().
 *     It survives launches and app updates, which is exactly what makes it a
 *     persistent identifier in the Play Data Safety sense. The app never calls
 *     Sentry.setUser, so there is no real user behind it to preserve.
 *
 *   contexts.app.device_app_hash  (iOS only)
 *     SHA1 of identifierForVendor + hw.machine + hw.model + bundle id, built
 *     by SentryCrashMonitor_System.m getDeviceAndAppHash and put on the SCOPE
 *     at hub init, so it rides on every event rather than only on crashes.
 *     identifierForVendor outlives a reinstall for as long as any other app
 *     from the same vendor is installed, so this one is MORE persistent than
 *     event.user, not less.
 *
 *   contexts.os.rooted
 *     A jailbreak / root flag. Not an identifier, but it is a security
 *     attribute of the user's device that this project has no use for: nothing
 *     here branches on it and no bug has ever been diagnosed with it.
 *
 * WHAT IS DELIBERATELY NOT STRIPPED - do not "finish the job" by removing it:
 *
 *   contexts.culture (locale, timezone, calendar, is_24_hour_format)
 *     KEEP. The app ships five locales and has produced real defects in
 *     currency formatting and in recurring-transaction date arithmetic where
 *     the reporter's timezone was the deciding fact. Removing culture blinds
 *     us to precisely the class of bug this project keeps finding.
 *
 *   Touch breadcrumbs (category 'touch', from Sentry.wrap)
 *     KEEP. They are attached to a crash, never streamed on their own, and
 *     they carry no user-visible text: the SDK reads only a `sentry-label`
 *     prop or a configured labelName, neither of which this app sets, and
 *     there is no babel.config.js so the Sentry component-annotate plugin is
 *     not active either. What ships is React component display names. That is
 *     diagnostic context, not analytics.
 *
 *   contexts.device / contexts.os / contexts.app, minus the two fields above
 *     KEEP - model, OS version, app version, memory, screen. This is the
 *     "crash logs and diagnostics" the store listing already declares.
 *
 * Losses accepted with this hook, so nobody rediscovers them as bugs: Sentry's
 * "users affected" count and the crash-free-USERS rate stop being meaningful.
 * Crash GROUPING is unaffected - it is computed from fingerprint, stack trace
 * and exception type, never from event.user.
 *
 * ===========================================================================
 * 3. withoutXhrBreadcrumbs - integrations
 * ===========================================================================
 *
 * breadcrumbsIntegration hard-defaults `xhr: true` in its React Native
 * wrapper, so every XMLHttpRequest becomes a breadcrumb carrying URL, method
 * and status. This app makes almost no network calls, and the two URLs that do
 * exist - the Metro dev server and the Sentry DSN host - are already filtered
 * by the SDK's own beforeBreadcrumb. So the option buys nothing and collects
 * request metadata nobody declared.
 *
 * It is turned off by DERIVING from the default integration list rather than
 * by handing Sentry a hand-written one. The audit confirmed the remaining
 * defaults are all wanted (device/OS/app context, native release, RN info,
 * Expo OTA context, modules loader, dedupe, inbound filters, rewrite frames),
 * and a hand-rolled list would silently lose them at the next SDK bump.
 */

import { breadcrumbsIntegration } from '@sentry/react-native';
import type { Breadcrumb, Event } from '@sentry/react-native';

/**
 * The SDK's Integration type, taken from a factory it already exports, so this
 * module does not have to reach past @sentry/react-native into @sentry/core.
 */
type SentryIntegration = ReturnType<typeof breadcrumbsIntegration>;

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

/**
 * Sentry beforeSend hook. Removes the two persistent identifiers and the
 * jailbreak flag from an outgoing event, then returns the event.
 *
 * Mutate-and-return is the SDK contract for beforeSend: return the event to
 * send it, or null to drop it. This guard NEVER drops - a crash report with
 * the identifiers removed is still worth having.
 *
 * Every lookup is defensive on purpose. `contexts` and each individual context
 * are absent on some platforms and some event types - device_app_hash is iOS
 * only, and a JS-only event captured before the native scope is read has no
 * app context at all - so a missing key must be a no-op, never a throw. An
 * exception here would be raised inside Sentry's own pipeline, where the SDK
 * would swallow it and send the event UNSTRIPPED.
 */
export function stripPersistentIdentifiers<T extends Event>(event: T): T {
    // The whole user object, not just .id: the SDK only ever populates it with
    // the installation identifier, so there is nothing else in there to keep.
    delete event.user;

    const contexts = event.contexts;
    if (contexts) {
        const app = contexts.app;
        if (app) {
            delete app.device_app_hash;
        }

        const os = contexts.os;
        if (os) {
            delete os.rooted;
        }
    }

    return event;
}

/**
 * Sentry `integrations` resolver. Receives the SDK's default integration list
 * and returns it with the breadcrumbs integration swapped for one that has XHR
 * breadcrumbs disabled.
 *
 * Matching is done against the replacement's OWN name rather than a hard-coded
 * 'Breadcrumbs' string, so the swap cannot silently degrade into an append if
 * the SDK ever renames the integration.
 */
export function withoutXhrBreadcrumbs(
    defaultIntegrations: SentryIntegration[],
): SentryIntegration[] {
    // console stays true: console breadcrumbs are killed downstream by
    // dropConsoleBreadcrumbs, and leaving the flag alone keeps this a
    // single-purpose change.
    const replacement = breadcrumbsIntegration({ xhr: false });

    return [
        ...defaultIntegrations.filter((integration) => integration.name !== replacement.name),
        replacement,
    ];
}
