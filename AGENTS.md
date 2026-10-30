# Agent notes

This file is the rulebook for agents, and useful to humans too. Read it before
changing anything; it is short on purpose.

## The project

Messenger is a local-first Android app built with Expo SDK 57 and React Native
0.86, released as one arm64-v8a APK of about 13.7 MiB. The client is
backend-ready: screens read through one typed repository
(`src/data/messengerRepository.ts`) backed by local SQLite, and `src/domain` is
pure. Read `docs/ARCHITECTURE.md` and `docs/PERFORMANCE.md` before touching code;
`docs/RELAY.md` holds the live relay scope, phase order and decision log;
`CONTRIBUTING.md` has setup, code rules and pull-request expectations.

The standing bias is smaller and faster: when two designs are close, pick the
one that ships fewer bytes and starts faster.

Expo uses Continuous Native Generation: change native configuration through
`app.json` plugins, never in the generated `android/` files. `app.config.js`
wraps `app.json` so `APP_VARIANT=dev` can build the separate development app;
with the variable unset the production config is unchanged.

## Release rule

A release is a version bump plus a tag; the Release workflow builds and
publishes. Nothing ships until all of this holds:

1. `npm run check` passes. It runs the typecheck and Expo's dependency
   alignment check.
2. `npm test` passes. The suite includes the architecture tests, and it fails
   if a `*.test.*` file under `scripts/`, `src/` or `modules/` is missing from
   the `test` script in `package.json` — a test that is not listed never runs.
3. The built APK passes the slim-build gate: run `npm run release:check` after
   `npm run android:build`, or point it at any APK you want inspected
   (`npm run release:check -- android/app/build/outputs/apk/release/app-release.apk`).
   The gate fails on:
   - `app.json` and `package.json` disagreeing about the version;
   - an APK over the 16 MiB budget (v0.0.3 published at 14.23 MiB);
   - native libraries beyond `arm64-v8a`;
   - the MLKit barcode library that 0.0.2 deliberately removed;
   - a compressed `assets/index.android.bundle` (it must stay stored so
     Android can mmap it at startup);
   - locale-specific resources creeping back in, or a `versionName` that does
     not match `app.json` (both need aapt2, which the gate finds by itself).
4. If the APK is bigger than the previous release, either slim it down first or
   record what grew, by how much and why in `CHANGELOG.md` and
   `docs/PERFORMANCE.md`. Size numbers in the docs must come from the real APK,
   never estimates.
5. Update the documentation your change touches, bump `expo.version` in
   `app.json` and `version` in `package.json`, commit, and tag `vX.Y.Z`. The
   release workflow fails when tag and `app.json` disagree, re-runs the
   typecheck, the tests and the gate on a fresh CI build, and only then
   publishes.

The workflow (`.github/workflows/release.yml`) also compares the CI APK against
the previous release, so a bloated build cannot slip out through a tag.

## Development channel

`npm run android:dev:build` creates `Messenger Dev`
(`com.yashraj.messenger.dev`) beside the production app, using the development
Convex deployment and its own update feed. `npm run dev:ship` publishes a
GitHub prerelease tagged `dev-<versionCode>` and writes the manifest to that
development deployment.

- Never publish a dev manifest with `--prod`, and never point
  `EXPO_PUBLIC_DEV_UPDATE_FEED_URL` at the production feed. `app.config.js` and
  `scripts/android.mjs` refuse both; `scripts/dev-release.mjs` additionally
  refuses a non-dev `CONVEX_DEPLOYMENT`.
- Dev releases are prereleases. The production workflow ignores them when it
  chooses its baseline.
- The first dev APK is installed by hand. Later builds update through the
  in-app updater, so keep the signing key in
  `artifacts/messenger-dev-debug.keystore` intact.
- A dev build does not need a production version bump or a `CHANGELOG.md`
  release section.

### Agent delivery default

When an agent completes a user-visible app change, the default delivery target
is the **development release**, not a local APK. After the focused checks pass,
the agent should commit the intended source and documentation changes, push the
containing branch, and publish the development APK so an already-installed
`Messenger Dev` can update through its in-app updater. Do this in the same task;
do not leave the user to sideload a locally built APK.

Use this order:

1. Run `npm run check` and `npm test`.
2. Review `git status`, `git diff --check` and the staged diff; commit only the
   intended files with a concise conventional message.
3. Push the commit to its remote branch. This repository currently has no
   separate `development` branch; use the branch that contains the change
   (normally `master` for direct integration work).
4. Run `npm run dev:ship -- --notes "<what changed and what was checked>"`.
   This builds the dev variant, runs the dev APK gate, creates or replaces the
   GitHub `dev-<versionCode>` prerelease, uploads the APK and publishes the
   manifest only to the development Convex deployment.
5. Verify the returned GitHub release, the APK digest/size and
   `GET <dev-feed>/updates/manifest?versionCode=0` before reporting completion.

If the APK was already built from the exact pushed commit, use
`npm run dev:publish -- --notes "..."` instead, then perform the same
verification. The installed phone must already have one dev APK installed with
the preserved `artifacts/messenger-dev-debug.keystore`; the first install is
still manual, but later builds must arrive through the updater.

Production releases remain explicit: never turn a development task into a
production tag or production-feed publish. If `gh` authentication, the dev
Convex deployment, or the development feed configuration is missing, report the
specific blocker and ask for that setup rather than claiming the release was
delivered.

## Reference documentation

Prefer live documentation over memory. Both projects publish LLM-oriented
indexes, and their pages are fetchable as Markdown:

- Expo: <https://docs.expo.dev/llms.txt> is the index. Pages are Markdown too,
  e.g. <https://docs.expo.dev/develop/user-interface/color-themes.md>.
- React Native: <https://reactnative.dev/llms.txt> is the index. Its links
  point at Markdown pages, e.g.
  <https://reactnative.dev/docs/getting-started.md>.

Keep dependencies lean: every package must earn its place in the APK.
