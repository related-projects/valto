# Valto

[![CI](https://github.com/related-projects/valto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/related-projects/valto/actions/workflows/ci.yml)

Valto is a local-first personal finance app for iOS and Android. All financial data lives on the device in an **encrypted SQLite database**. There is no backend, no account, and no sync server. The focus of the project is correctness and data integrity rather than feature count: money writes are transactional, every wallet's balance is auditable against the entries that concern it, and the database is encrypted at rest.

Built with React Native (Expo) and TypeScript.

> This is a portfolio project. It is published and in use, but it is maintained by one developer rather than as a commercial product with support commitments.

---

## Decisions & tradeoffs

The interesting part of Valto is how a few problems were solved, not the feature list. Each choice below was deliberate and has a cost.

**Encrypted SQLite (op-sqlite + SQLCipher), not AsyncStorage.** A finance app needs atomic multi-row writes, real queries, schema migrations, and encryption at rest - none of which a key-value JSON store provides. The cost: op-sqlite is a native module, so the app requires a development or production build and can no longer run in Expo Go (see [DEV_BUILD.md](DEV_BUILD.md)).

**Atomicity through a single connection and a serializing mutex.** All financial writes that touch a balance (transfers, expense creation, deletion) run inside one `BEGIN/COMMIT/ROLLBACK` on a shared connection, so a failure mid-write rolls back entirely instead of leaving a wallet debited but the counter-entry missing. Because the driver is async, a mutex serializes transactions so two concurrent operations can't interleave on the same connection. This is the guarantee, not a `try/catch` wrapped around sequential writes.

**Balances are stored _and_ recomputable.** The stored balance gives fast reads; `recomputeBalanceFromLedger` derives the same value from the transactions, so any drift is detectable (`auditBalances`). The audit deliberately stops at detection: atomic writes should make drift impossible, so silently rewriting a stored balance would hide the bug that caused it. A dev-only boot assertion recomputes on startup and warns if the stored balance ever disagrees with the ledger. The audit works one wallet at a time: it checks a wallet's stored balance against the entries that name it. It does not check that a transfer's two entries agree with each other, because no column links them. That is the limit of what the audit claims; the atomic write is what holds the pair together instead.

**Transfers are bounded by the source balance; expenses may overdraw.** This asymmetry is intentional, not an oversight: a transfer _moves tracked funds_ between your own wallets, so it cannot exceed what's there; an expense _records a real-world outflow_, which may legitimately push a wallet negative. Blocking it would force the app to misrepresent reality.

**Money is integer minor units, converted in one place.** Amounts are stored as integers in the currency's minor unit (10^decimals per major unit: 2 for most currencies, 0 for JPY/CFA, 3 for KWD/BHD, per the currency registry); user input is converted through a single function (`normalizeAmount`) so floating-point money errors can't enter from scattered call sites.

**The dependency rule is enforced, not just intended.** The domain layer has no imports from the data layer, and an ESLint boundary rule fails the build (and CI) if that is ever violated. "Clean Architecture" here is a constraint the tooling protects, not a label.

**Tiered storage.** The financial ledger lives in the encrypted, transactional SQLite store; trivial UI preferences (theme, locale, onboarding flags) stay in lightweight key-value storage. Sensitive data gets the strong store; ephemeral settings don't need it.

**The PIN gates interactive access, and nothing more.** The app lock uses a hashed PIN with an exponential-backoff lockout that survives app restart, which defeats interactive brute force. It does **not** protect against offline extraction (a 4-digit PIN hash is trivial to brute force off-device), and it is not meant to: protection at rest comes from the encrypted database and the key held in the device keystore.

**The imported key-value copies are deleted, not left behind.** `v5` moved the ledger into encrypted SQLite and deliberately kept the legacy AsyncStorage copies: they were the source, and a migration must not delete user data while the import is unproven. That left a full plaintext copy of the ledger beside the encrypted one - on Android, AsyncStorage is an unencrypted SQLite file in the app data directory, a different file from `valto.db`. `v6` removes them, and only when the flag `v5` writes after its last successful insert says the data arrived. The cost is that the encryption guarantee is whole only after two migrations, and an install whose import failed part-way keeps its plaintext copy on purpose.

**A recurring rule cannot read "Active" while producing nothing.** Three different things stop a rule quietly - a wallet or category that no longer exists, a funds refusal, and an end date that has passed - and only the first two are faults. One pure function derives five states from the rule and its two references, and the definition of "cannot be paid for" is extracted and shared, so the engine and the rules screen cannot drift apart on it. The cost is that the status is recomputed on every render and never stored, so there is no record of when a rule started failing.

**A backup whose currency the app does not recognise is refused, not guessed.** Every amount in a snapshot is an integer in minor units, and how many minor units make one major unit comes from the currency alone - 0 for XOF, 2 for most, 3 for KWD. A file that carries amounts but no usable currency code would be read under whatever the device happens to be set to, misreading every amount by a factor of 100. The restore asks the same registry the formatter asks, and refuses when the code does not resolve to itself. The cost is that a legitimate backup becomes unreadable if a currency code is ever retired from the registry.

---

## Architecture

Clean Architecture with a feature-based layout.

- **Domain**: entities, repository _interfaces_, use cases, validators. It has zero dependency on the data layer, enforced by an ESLint boundary rule.
- **Data**: SQL implementations of the domain repository interfaces, the storage layer, services, and versioned migrations.
- **Core**: the DI container (composition root, the only place that knows concrete implementations), security, error handling, events.
- **UI**: screens, components, and hooks. Hooks expose data access; business rules (e.g. balance sufficiency) live in use cases, not components.

Versioned, idempotent migrations run at boot, in version order, each one the install has not yet recorded (`v1` to `v10`): `v1` marks the baseline, `v2` and `v3` repair legacy key-value records (missing `createdAt`, negative amounts), `v4` creates the relational schema, `v5` performs a one-time import of any pre-existing key-value data into SQLite, `v6` removes those key-value copies once the import is proven, and `v7` to `v10` add the recurring-rule columns (occurrence key, end occurrence number, end day, start day), each backfilled for existing rules. Existing data is preserved on upgrade.

---

## Data integrity & security

- **Atomic writes.** Transfers, expense creation, and deletion are all-or-nothing.
- **Auditable balances.** Stored for speed, recomputable from the ledger for verification; audited on demand and asserted in development at boot. Drift is reported, never silently corrected. The check is per wallet: a stored balance against the entries that name it. It does not pair a transfer's two entries, which no column links.
- **Encryption at rest.** SQLCipher encrypts the database file; the key is generated on first launch and stored only in the device keystore (`expo-secure-store`). This was verified manually: a standard `sqlite3` cannot open the on-disk file without the key (it reports "file is not a database", and the file header is not the plaintext SQLite magic).
- **App lock.** Hashed PIN with exponential-backoff lockout (durable across restart and backgrounding). The authenticated UI is rendered only when unlocked, so financial data is not loaded into memory before authentication.

---

## Tech stack

- **React Native / Expo** (SDK 54), **TypeScript**, **Expo Router**
- **op-sqlite + SQLCipher** for the encrypted database; **expo-secure-store** for the key
- **i18n**: 5 locales complete (en, es, fr, pt, ru), 5 partial and falling back to English (zh, ar, bn, hi, ur)
- **Sentry** for crash reporting; **ErrorBoundary** for render-error recovery
- **Jest** (unit/integration, running on `better-sqlite3` behind the same SQL port) and **Maestro** (end-to-end)

---

## Privacy

Your financial data never leaves the device: there is no backend, no account, and no data sync. The app does make limited network calls for crash reporting (Sentry) and over-the-air update checks (expo-updates); neither transmits your financial data. This is deliberately stated precisely - "your data stays on device" is true; "the app makes zero network calls" would not be.

Crash reports are not the only thing sent. When scheduled recurring entries fail to run, the app reports how many rules failed, out of how many were checked - no ids, no amounts, no names, no notes.

What a report contains, and what it does not, is set out in full in the [privacy policy](https://github.com/related-projects/valto-legal). That is the single versioned source for it.

---

## Getting started

This app uses a native module (op-sqlite), so **Expo Go will not work** - a development build is required.

```bash
npm install
npx expo prebuild        # generates the native ios/ and android/ projects
npx expo run:ios         # build + launch on iOS simulator/device
# or: npx expo run:android
```

Full build instructions, EAS profiles, and how to verify the database is actually encrypted are in [DEV_BUILD.md](DEV_BUILD.md). Profiling tools and how to use them are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

Run the tests (no native build needed - they use in-memory SQLite):

```bash
npm test
```

---

## Testing & CI

- Tests concentrate on the domain and data layers. Eleven Maestro end-to-end flows are run by hand on a local Android emulator (see [End-to-end tests](#end-to-end-tests-maestro)). Unit tests run on Node via `better-sqlite3` behind the same `SqlDatabase` port the app uses, so the rollback and concurrency tests exercise real SQLite transaction semantics.
- CI enforces coverage floors per layer rather than a test count, which decays silently: `src/domain` at 96 percent statements, 93 branches, 93 functions, 96 lines; `src/data` at 66 / 56 / 77 / 66. Components and screens carry no threshold - they are deliberately not unit-tested, so a UI file can never redden the build.
- **CI** (GitHub Actions, on every PR and on `develop`/`main`): lint (including the domain dependency barrier), type-check, and the full test suite with the coverage floors above. `expo-doctor` runs too, but advisory: it compares the installed versions against a remote registry that moves on its own, so it reports SDK drift without failing the pipeline.

---

## End-to-end tests (Maestro)

Eleven Maestro flows in `.maestro/` drive the app on an Android emulator. They run locally, against the APK built by EAS with the `preview` profile; nothing is built on the local machine.

| Flow | What it checks |
| --- | --- |
| `onboarding.yaml` | First launch from a cleared state: choosing a currency, going back and choosing another, naming the first wallet. The wallet is then listed on the dashboard. |
| `create_wallet.yaml` | Adds a savings wallet from the Wallets tab. The wallet is then listed on the dashboard. |
| `create_transaction.yaml` | Adds an expense. Its row is then listed with its category and its wallet. |
| `change_settings.yaml` | Switches the theme to Dark and the date format to YYYY-MM-DD. Each row then shows the new value. |
| `backup_restore.yaml` | Creates a backup and closes the share sheet, then opens both restore confirmations and cancels the second. Nothing is restored. |
| `transaction_dates.yaml` | Adds an expense, an income and a transfer, each on a picked date that is not today. The list shows them under that date's header, each detail screen shows that date, and both transfer legs show the typed note. |
| `amount_cap_compact.yaml` | A 13-digit amount is refused with the "too large" message and nothing is saved. A saved 1999999 is then shown compact in the list ("1.9M") and exact on the detail screen. |
| `wallet_delete_anyway.yaml` | Creates a wallet with two expenses and deletes it with "Delete Anyway". Both expenses remain, labelled with an unknown wallet, and the other wallets' balances do not change. |
| `category_type_switch.yaml` | Switching the add form from expense to income replaces the expense category with an income one, and the Dashboard "Income" quick action preselects an income category. |
| `settings_reachability.yaml` | Scrolls Settings to its last row, "About Valto", which must sit above the tab bar, and taps it. The About screen then opens. |
| `month_start_day.yaml` | Sets the month start day to 20: two expenses dated the 19th and the 20th then fall in two Reports periods, each labelled with its dates. Set back to day 1, the label is a month name again. |

The flows share one app state and run in the order set in `.maestro/config.yaml`, onboarding first. Every flow runs even when an earlier one fails, so one run reports the whole suite; a flow that uses data made by an earlier one (listed in `config.yaml`) can fail because that one did, so read a failure against the earlier results first. They type synthetic data only. They select controls by testID where the app has one; native Android dialogs and some labels are matched by their text, so the emulator must be set to English. Once the app has launched, each flow answers "Wait" to an Android "isn't responding" dialog if one is up (`.maestro/subflows/dismiss_not_responding.yaml`); that step never touches the app.

Prerequisites:

- Java 17 or 21 (required by the Maestro CLI)
- The Maestro CLI, with `maestro` on the PATH
- The Android SDK platform-tools, with `adb` on the PATH
- An Android Virtual Device on API 34, 35 or 36, started, and no other device attached
- The preview APK, downloaded from the EAS build page

Start the emulator with hardware rendering, and close other applications before a run. Under software rendering on a loaded host, frames slow down, each scroll can take seconds, and Android may stop the run with a "System UI isn't responding" dialog. For the AVD `valto_e2e_api36` (`-no-snapshot` boots it cold, `-gpu host` renders with the host GPU):

```bash
emulator -avd valto_e2e_api36 -no-snapshot -gpu host
```

Run:

```bash
scripts/run-e2e.sh path/to/valto-preview.apk
```

The script checks that exactly one emulator or device is attached, then waits until Android reports that it has finished booting (`sys.boot_completed`), for up to `VALTO_E2E_BOOT_TIMEOUT` seconds (600 by default), and lets the system settle for `VALTO_E2E_SETTLE_SECONDS` seconds (120 by default) before it touches the app: a device that adb lists can still be starting up. It then uninstalls the app if it is present, installs the APK and runs every flow. Uninstalling erases the app data on that device, so run it on an emulator, never on a phone that holds real data. The JUnit report is written to `e2e-results/report.xml`, and screenshots and logs to `e2e-results/artifacts/` (git-ignored). The exit status is non-zero if any flow fails.

---

## Project structure

```
src/
|-- core/
|   |-- di/            # Composition root (container)
|   |-- security/      # App lock, PIN, lockout state
|   |-- error/         # ErrorBoundary, error types
|   `-- events/        # Event bus
|-- domain/
|   |-- entities/      # Transaction, Wallet, Category, Budget, Settings...
|   |-- repositories/  # Repository interfaces (the layer boundary)
|   |-- useCases/      # transferFunds, createTransaction, verifyFinancialIntegrity...
|   |-- validators/
|   `-- security/      # Lockout policy
|-- data/
|   |-- storage/
|   |   `-- sql/       # SqlDatabase port, op-sqlite + SQLCipher, schema
|   |-- repositories/  # SQL implementations of the domain interfaces
|   |-- services/      # Backup, export, recurring engine, notifications, security...
|   |-- seed/          # Default categories on first launch
|   `-- migrations/    # Versioned, idempotent (v1...v10)
|-- features/          # Self-contained feature modules (onboarding)
|-- hooks/             # useWallets, useTransactions, ... (data access)
|-- screens/
|-- components/
|   `-- security/      # SecurityGate, AuthGate, PinPad
|-- utils/             # normalizeAmount, formatAmount, formatDate, accessibility...
`-- localization/      # i18n (5 complete, 5 falling back to English)
app/
|-- _layout.tsx        # Boot: migrations, seed, security gate
`-- (tabs)/            # Navigation
```

This maps the main directories; it is not an exhaustive inventory.

---

## Roadmap

Genuinely future work (not yet implemented):

- Complete the five partial locales. zh, ar, bn, hi and ur carry 71-89 of the 554 keys en carries; everything else falls back to English.
- Optional move to a newer Expo SDK.
- Local-first sync: the data layer (encrypted store, transactional writes, recomputable balances) is structured to support a sync engine with explicit conflict resolution, which is the natural next step beyond local-only.

---

## License

Personal, educational, and experimental use. All rights reserved.
