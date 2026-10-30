# Contributing

Thanks for looking at Messenger. It is an Android messenger with a Convex backend for accounts, conversation metadata and message relay, local SQLite history on the phone, and Android system notifications while the app is running. Bug reports, feature requests and pull requests are welcome.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Report security issues privately as described in [SECURITY.md](SECURITY.md), not
in a public issue.

## Before you start

- Node 22.18 or newer, or Node 24. `npm test` uses `node --test` with built-in
  TypeScript stripping, which older Node releases do not provide.
- npm; install with `npm ci` so the lockfile is respected.
- For Android work: Windows, a JDK 17 install, the Android SDK, and an ARM64
  Android phone running Android 7.0 or newer. [README.md](README.md) records the
  exact tools this project was set up with.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/PERFORMANCE.md](docs/PERFORMANCE.md) before changing code. The module
READMEs, `modules/system-notifications/README.md` and
`modules/keyboard-media/README.md`, document the native behaviour and the device
checks that are still outstanding.

## Set up

```sh
npm ci
npm run check
npm test
npx convex dev
```

`npm run check` runs `tsc --noEmit` and `expo install --check`. `npm test` runs
the Node test suite. Both must pass before you open a pull request. `npx convex
dev` runs the backend against your development deployment, regenerates
`convex/_generated/`, and fills `EXPO_PUBLIC_CONVEX_URL` in `.env.local`; the
Convex Auth setup also needs `JWT_PRIVATE_KEY` and `JWKS` on the deployment, as
described in [convex/README.md](convex/README.md).

The app reads `EXPO_PUBLIC_CONVEX_URL` at build time. A build without it fails
during startup, before cached chats can render; a build with the URL still
shows the cached inbox and threads when the device is offline and syncs when a
connection returns. `EXPO_PUBLIC_CONVEX_SITE_URL` is the deployment's
`.convex.site` origin and is used by the auth HTTP routes.

## Build and install the Android APK

The helper scripts are Windows-only.

```sh
npm run android:build
npm run android:install
```

`android:build` prebuilds `android/` if it is missing, builds the release
variant for `arm64-v8a` and copies the APK to `artifacts/messenger-local.apk`.
First builds take several minutes. There is no hot reload, so rebuild after
every change you want to see on the phone.

`android:install` installs and opens `com.yashraj.messenger` through adb. Set
`ANDROID_SERIAL` when more than one device is connected. `ANDROID_HOME`,
`ANDROID_SDK_ROOT` and `JAVA_HOME` are respected.

For a development build that installs beside production and updates itself:

```sh
npm run android:dev:build    # Messenger Dev -> artifacts/messenger-dev.apk
npm run android:dev:install  # first install only
npm run dev:ship             # build, publish a prerelease, update the dev feed
```

The dev build reads the development Convex URLs from `.env.local` and refuses
to use the production feed. `dev:ship` needs `gh` authentication and writes
only to the development deployment; it also refuses a non-dev
`CONVEX_DEPLOYMENT`. The first APK is installed by hand, and later builds are
offered by the app's updater. Keep `artifacts/messenger-dev-debug.keystore`
intact: Android only installs an update signed by the same key. See
[README.md](README.md) for the full command list.

Two rules for the native side:

- `android/` is generated and ignored by Git. Make native configuration changes
  in `app.json` plugins, never in generated files. `android:build` regenerates
  `android/` when the package, version or build variant changes; run
  `npm run android:prebuild` after a config change you want to apply without a
  full build.
- The APK is signed with Expo's generated debug key. It is a local test build
  and must not be published to a store.

The local modules, `modules/system-notifications` and `modules/keyboard-media`,
are Android-only and need a native rebuild. They do not work in Expo Go.

## Code rules

`npm test` includes `scripts/architecture.test.mjs`, which enforces the
following:

- Application source files stay under 500 lines. That covers `App.tsx`, every
  `.ts`/`.tsx` file under `src/`, and the Kotlin sources under
  `modules/*/android/src`. Extract a focused module rather than growing a file
  past the limit.
- No file imports back into `App.tsx`. `App.tsx` composes screens and
  navigation only; features never depend on it.
- `src/domain` stays pure: no React, React Native, Expo, storage, state hook or
  screen imports.
- Every `*.test.*` file under `scripts/`, `src/` or `modules/` is listed in the
  `test` script in `package.json`; an unregistered test never runs.
- Application sources (`App.tsx` and `src/`) contain no `any`, no
  `@ts-ignore`/`@ts-nocheck` and no `console.log`.

In practice, features depend on `src/domain` and the shared modules under
`src/ui`, and `src/domain` depends on nothing but itself. Keep React Native and
Expo package versions aligned when you upgrade.

Convex functions live in `convex/`. `conversations.ts` owns conversation rows and
membership; `relay.ts` and `lib/relayStore.ts` own the queue, the membership and
block checks, sequencing, and release of acknowledged attachments. The client
talks to them only through `src/state/useRemoteMessenger.ts` and its focused
helpers (`useRemoteCache`, `conversationSync`, `useRelayDrain`, `remoteMessenger*`).
Screens must not call Convex directly; add a mutation or query to the state layer
and keep the screen props the same. Run `npx convex dev --once` after changing
backend functions so the generated types stay in sync.

Messages are different from every other row: they are never a Convex table. A
message exists on the server only as a `relayQueue` envelope waiting for one
recipient, and it is deleted when that recipient acknowledges its local commit.
Do not add a server-side message read or a "history" query; the contract and the
invariants are in [docs/RELAY.md](docs/RELAY.md). The local schema has one
version and resets on a mismatch, so a schema change means bumping
`SCHEMA_VERSION` rather than writing a migration.

## Adding a test

`npm test` runs `node --test` over an explicit list of files in the `test`
script in `package.json`. If you add a test file and forget to register it, the
architecture test fails: a test that never runs cannot be merged. Name it after
the code it covers
(`src/data/cache.test.mjs`) or put it in `scripts/` if it exercises the whole
model. Use `node:test` and `node:assert/strict`, as the existing tests do.

Kotlin tests for the keyboard module run from `android/`:

```sh
gradlew.bat :keyboard-media:testDebugUnitTest --console=plain --max-workers=2
```

Write tests at the level of the logic you changed. The suite covers the
conversation model, message actions, media albums, stories, notification
payloads and the persistence cache. It does not drive a device.

## Releasing

Every release runs through the same gate as CI. [AGENTS.md](AGENTS.md) is the
full checklist; the short version:

```sh
npm run android:build   # writes artifacts/messenger-local.apk
npm run release:check   # typecheck, tests and the slim-build gate
```

Then bump `expo.version` in `app.json` and `version` in `package.json`, update
`CHANGELOG.md` and `docs/PERFORMANCE.md` with the real numbers, commit, and tag
`vX.Y.Z`. The release workflow re-runs everything on a fresh CI build, compares
the APK against the previous release, and refuses to publish if the tag, the
version or the size budget is off.

## Commit messages

The history uses short, imperative summary lines with no type prefixes:

```text
Set up Expo app with standalone Android builds
Build and refine the messenger prototype
Fix incoming call banner layout
```

Keep the summary under about 70 characters and write it as an instruction
("Fix ...", "Add ...", "Remove ..."). If the change needs explanation, add a
blank line and a short body covering what and why, not how. Keep unrelated
changes in separate commits.

## Pull requests

- Run `npm run check` and `npm test` first. CI runs them for every pull request.
- Say what changed and why.
- State whether you tested on a physical Android device. If you did, note the
  device, the Android version and whether you installed a release APK or a local
  build. If you did not test on a device, say so plainly; this project documents
  what remains unverified rather than assuming it works.
- Attach screenshots or a short recording for user-visible changes.
- Note whether the change needs a native rebuild. Anything under `modules/` or
  in `app.json` does, and it will not work in Expo Go.
- Update the documentation when behaviour changes: `README.md`, a module README,
  or a note under `docs/`.

Keep pull requests focused. If a change mixes a refactor with a bug fix, split
it into two.
