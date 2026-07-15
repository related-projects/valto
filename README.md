# Valto

[![CI](https://github.com/related-projects/valto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/related-projects/valto/actions/workflows/ci.yml)

Valto is a local-first personal finance app for iOS and Android. All financial data lives on the device in an **encrypted SQLite database** — there is no backend, no account, and no sync server. The focus of the project is correctness and data integrity rather than feature count: money writes are transactional, balances are auditable against their own ledger, and the database is encrypted at rest.

Built with React Native (Expo) and TypeScript.

> This is a portfolio project. It is functional, tested, and runnable on both platforms, but it is maintained for demonstration and learning rather than as a commercial product.

---

## Decisions & tradeoffs

The interesting part of Valto is how a few problems were solved, not the feature list. Each choice below was deliberate and has a cost.

**Encrypted SQLite (op-sqlite + SQLCipher), not AsyncStorage.** A finance app needs atomic multi-row writes, real queries, schema migrations, and encryption at rest — none of which a key-value JSON store provides. The cost: op-sqlite is a native module, so the app requires a development or production build and can no longer run in Expo Go (see [DEV_BUILD.md](DEV_BUILD.md)).

**Atomicity through a single connection and a serializing mutex.** All financial writes that touch a balance — transfers, expense creation, deletion — run inside one `BEGIN/COMMIT/ROLLBACK` on a shared connection, so a failure mid-write rolls back entirely instead of leaving a wallet debited but the counter-entry missing. Because the driver is async, a mutex serializes transactions so two concurrent operations can't interleave on the same connection. This is the guarantee, not a `try/catch` wrapped around sequential writes.

**Balances are stored _and_ recomputable.** The stored balance gives fast reads; `recomputeBalanceFromLedger` derives the same value from the transactions, so any drift is detectable (`auditBalances`). The audit deliberately stops at detection: atomic writes should make drift impossible, so silently rewriting a stored balance would hide the bug that caused it. A dev-only boot assertion recomputes on startup and warns if the stored balance ever disagrees with the ledger.

**Transfers are bounded by the source balance; expenses may overdraw.** This asymmetry is intentional, not an oversight: a transfer _moves tracked funds_ between your own wallets, so it cannot exceed what's there; an expense _records a real-world outflow_, which may legitimately push a wallet negative. Blocking it would force the app to misrepresent reality.

**Money is integer cents, converted in one place.** Amounts are stored as integers (cents); user input is converted to cents through a single function (`normalizeAmount`) so floating-point money errors can't enter from scattered call sites.

**The dependency rule is enforced, not just intended.** The domain layer has no imports from the data layer, and an ESLint boundary rule fails the build (and CI) if that is ever violated. "Clean Architecture" here is a constraint the tooling protects, not a label.

**Tiered storage.** The financial ledger lives in the encrypted, transactional SQLite store; trivial UI preferences (theme, locale, onboarding flags) stay in lightweight key-value storage. Sensitive data gets the strong store; ephemeral settings don't need it.

**The PIN gates interactive access — and nothing more.** The app lock uses a hashed PIN with an exponential-backoff lockout that survives app restart, which defeats interactive brute force. It does **not** protect against offline extraction (a 4-digit PIN hash is trivial to brute force off-device), and it is not meant to: protection at rest comes from the encrypted database and the key held in the device keystore.

---

## Architecture

Clean Architecture with a feature-based layout.

- **Domain** — entities, repository _interfaces_, use cases, validators. It has zero dependency on the data layer, enforced by an ESLint boundary rule.
- **Data** — SQL implementations of the domain repository interfaces, the storage layer, services, and versioned migrations.
- **Core** — the DI container (composition root, the only place that knows concrete implementations), security, error handling, events.
- **UI** — screens, components, and hooks. Hooks expose data access; business rules (e.g. balance sufficiency) live in use cases, not components.

Versioned, idempotent migrations run at boot: `v4` creates the relational schema, `v5` performs a one-time import of any pre-existing key-value data into SQLite. Existing data is preserved on upgrade.

---

## Data integrity & security

- **Atomic writes.** Transfers, expense creation, and deletion are all-or-nothing.
- **Auditable balances.** Stored for speed, recomputable from the ledger for verification; audited on demand and asserted in development at boot. Drift is reported, never silently corrected.
- **Encryption at rest.** SQLCipher encrypts the database file; the key is generated on first launch and stored only in the device keystore (`expo-secure-store`). This was verified manually: a standard `sqlite3` cannot open the on-disk file without the key (it reports "file is not a database", and the file header is not the plaintext SQLite magic).
- **App lock.** Hashed PIN with exponential-backoff lockout (durable across restart and backgrounding). The authenticated UI is rendered only when unlocked, so financial data is not loaded into memory before authentication.

---

## Tech stack

- **React Native / Expo** (SDK 54), **TypeScript**, **Expo Router**
- **op-sqlite + SQLCipher** for the encrypted database; **expo-secure-store** for the key
- **i18n** across 10 locales
- **Sentry** for crash reporting; **ErrorBoundary** for render-error recovery
- **Jest** (unit/integration, running on `better-sqlite3` behind the same SQL port) and **Maestro** (end-to-end)

---

## Privacy

Your financial data never leaves the device: there is no backend, no account, and no data sync. The app does make limited network calls for crash reporting (Sentry) and over-the-air update checks (expo-updates); neither transmits your financial data. This is deliberately stated precisely — "your data stays on device" is true; "the app makes zero network calls" would not be.

---

## Getting started

This app uses a native module (op-sqlite), so **Expo Go will not work** — a development build is required.

```bash
npm install
npx expo prebuild        # generates the native ios/ and android/ projects
npx expo run:ios         # build + launch on iOS simulator/device
# or: npx expo run:android
```

Full build instructions, EAS profiles, and how to verify the database is actually encrypted are in [DEV_BUILD.md](DEV_BUILD.md).

Run the tests (no native build needed — they use in-memory SQLite):

```bash
npm test
```

---

## Testing & CI

- ~700 tests concentrated on the domain and data layers, plus end-to-end flows in Maestro. Unit tests run on Node via `better-sqlite3` behind the same `SqlDatabase` port the app uses, so the rollback and concurrency tests exercise real SQLite transaction semantics.
- **CI** (GitHub Actions, on every PR and on `develop`/`main`): lint — including the domain dependency barrier — type-check, the full test suite with a coverage ratchet on the domain and data layers, and `expo-doctor` to catch Expo SDK version drift before it breaks a native build.

---

## Project structure

```
src/
├── core/
│   ├── di/            # Composition root (container)
│   ├── security/      # App lock, PIN, lockout state
│   ├── error/         # ErrorBoundary, error types
│   └── events/        # Event bus
├── domain/
│   ├── entities/      # Transaction, Wallet, Category, Budget, Settings…
│   ├── repositories/  # Repository interfaces (the layer boundary)
│   ├── useCases/      # transferFunds, createTransaction, verifyFinancialIntegrity…
│   ├── validators/
│   └── security/      # Lockout policy
├── data/
│   ├── storage/
│   │   └── sql/       # SqlDatabase port, op-sqlite + SQLCipher, schema
│   ├── repositories/  # SQL implementations of the domain interfaces
│   ├── services/      # Backup, seed, security
│   └── migrations/    # Versioned, idempotent (v1…v5)
├── hooks/             # useWallets, useTransactions, … (data access)
├── screens/
├── components/
│   └── security/      # SecurityGate, AuthGate, PinPad
└── localization/      # i18n (10 locales)
app/
├── _layout.tsx        # Boot: migrations, seed, security gate
└── (tabs)/            # Navigation
```

---

## Roadmap

Genuinely future work (not yet implemented):

- Complete i18n coverage for the most recent strings (a few currently fall back to English).
- EAS production release and store submission.
- Optional move to a newer Expo SDK.
- Local-first sync: the data layer (encrypted store, transactional writes, recomputable balances) is structured to support a sync engine with explicit conflict resolution, which is the natural next step beyond local-only.

---

## License

Personal, educational, and experimental use. All rights reserved.
