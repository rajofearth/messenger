# Agent notes

This file is the rulebook for agents, and useful to humans too. Read it before
changing anything; it is short on purpose.

## The project

Messenger is a local-first Android app built with Expo SDK 57 and React Native
0.86, released as one arm64-v8a APK of about 14.2 MiB. The client is
backend-ready: screens read through one typed repository
(`src/data/messengerRepository.ts`) and one cache, and `src/domain` is pure.
Read `docs/ARCHITECTURE.md` and `docs/PERFORMANCE.md` before touching code;
`CONTRIBUTING.md` has setup, code rules and pull-request expectations.

The standing bias is smaller and faster: when two designs are close, pick the
one that ships fewer bytes and starts faster.

Expo uses Continuous Native Generation: change native configuration through
`app.json` plugins, never in the generated `android/` files.

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

## Reference documentation

Prefer live documentation over memory. Both projects publish LLM-oriented
indexes, and their pages are fetchable as Markdown:

- Expo: <https://docs.expo.dev/llms.txt> is the index. Pages are Markdown too,
  e.g. <https://docs.expo.dev/develop/user-interface/color-themes.md>.
- React Native: <https://reactnative.dev/llms.txt> is the index. Its links
  point at Markdown pages, e.g.
  <https://reactnative.dev/docs/getting-started.md>.

Keep dependencies lean: every package must earn its place in the APK.
