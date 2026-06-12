# Development Build — Valto

Valto now stores all financial data in an **encrypted SQLite database**
(op-sqlite + SQLCipher). op-sqlite is a **native module**, so the app can no
longer run in **Expo Go**. You must run a **development build** (custom native
runtime) on a simulator/emulator or a physical device.

## What changed

- New native dependency: `@op-engineering/op-sqlite` (with SQLCipher).
- SQLCipher is enabled via the `op-sqlite` key in `package.json`:
  ```json
  "op-sqlite": { "sqlcipher": true }
  ```
- The DB encryption key lives in the device secure keystore via
  `expo-secure-store` (config plugin already registered in `app.json`).

## One-time setup

```bash
npm install            # pulls op-sqlite + expo-secure-store
npx expo prebuild      # generates native ios/ + android/ projects
```

`expo prebuild` reads the `op-sqlite` config and wires SQLCipher into the
native build.

## Run the app

Local native build (requires Xcode / Android Studio toolchains):

```bash
npx expo run:ios       # build + launch on iOS simulator/device
npx expo run:android   # build + launch on Android emulator/device
```

Or build a development client in the cloud with EAS (no local toolchain):

```bash
npx eas build --profile development --platform ios      # or android
# install the resulting build, then:
npx expo start --dev-client
```

## Build profiles (EAS)

Build configuration lives in [`eas.json`](eas.json). Three profiles:

| Profile        | What it produces                                  | Command                                            |
| -------------- | ------------------------------------------------- | -------------------------------------------------- |
| `development`  | Dev client (`developmentClient: true`) — the op-sqlite native runtime needed for local development; pair with `expo start --dev-client`. Internal distribution. | `npx eas build --profile development --platform ios\|android` |
| `preview`      | Standalone build for internal testers (no dev menu, no Metro). Internal distribution. | `npx eas build --profile preview --platform ios\|android` |
| `production`   | Store-ready build (`autoIncrement` bumps the build number). | `npx eas build --profile production --platform ios\|android` |

> EAS builds require an Expo account and `EXPO_TOKEN` / `eas login`. There is no
> CI build workflow — builds are run on demand from a machine with EAS access.

> **Expo Go will not work** — it lacks the op-sqlite native module. Use the
> dev build / dev client instead.

## Verifying the database is actually encrypted

`sqlcipher: true` in `package.json` only builds the SQLCipher binary. What
actually encrypts the file is the keystore key being passed to `open()` — see
`src/data/storage/sql/OpSQLiteDatabase.ts` (`open({ name, encryptionKey })`).

Two layers prove it:

1. **Runtime fail-fast guard.** Right after opening, the app runs
   `PRAGMA cipher_version`. On a real SQLCipher handle this returns a version
   string; on a plain SQLite binary it returns nothing. An empty result throws
   and aborts boot, so the app can never silently run on an unencrypted file.
   (This guard cannot run under Jest — op-sqlite is a native module that does
   not load in Node — so it is only exercised in the dev build.)

2. **Manual check on the raw file.** After a first launch, pull the DB file off
   the device/simulator and open it with a *standard* `sqlite3` (no SQLCipher,
   no key). It must FAIL — encrypted bytes, not a readable schema:

   ```bash
   # iOS simulator example — path varies; find valto.db under the app container.
   # Android: adb exec-out run-as <pkg> cat databases/valto.db > valto.db
   sqlite3 valto.db ".tables"
   # Expected: "Error: file is not a database" (or garbage), NOT a table list.

   # Confirm the leading bytes are NOT the plaintext SQLite header:
   head -c 16 valto.db | xxd
   # Plain SQLite would start with "SQLite format 3\000". SQLCipher must not.
   ```

   A standard `sqlite3` opening it WITHOUT the key must never list tables or dump
   rows. (With the SQLCipher CLI you could read it via `PRAGMA key = '<hex>'`.)

## First launch behaviour

On first boot after upgrading, the migration runner:

1. opens the encrypted SQLite database (generating the keystore key if absent),
2. creates the relational schema (migration **v4**), and
3. performs a **one-time, idempotent import** of any existing AsyncStorage data
   into SQLite (migration **v5**).

Existing data is preserved. Subsequent launches skip the import.

## Tests

Tests run on Node via Jest and do **not** require a native build — they use an
in-memory SQLite (better-sqlite3) behind the same `SqlDatabase` port:

```bash
npm test
```
