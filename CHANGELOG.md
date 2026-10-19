# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-10-19

No features were removed. The Android (`arm64-v8a`) release APK falls from
35,632,330 bytes (33.98 MiB) to 15,680,467 bytes (14.95 MiB): 56% smaller than
v0.0.1 and 64% smaller than the first builds.

### Changed

- Release APKs now store native libraries compressed (`useLegacyPackaging`).
  This is the largest single saving; the trade is a slower install and first
  launch, when Android extracts the libraries. `docs/PERFORMANCE.md` records
  the measurements and the reasoning.
- `App.tsx` loads the three DM Sans weights it uses through direct imports and
  takes `useFonts` from `expo-font`; it previously pulled in all eighteen
  weights. Bundled font files drop from 38 to 5.
- Icon imports load the Ionicons module directly instead of the
  `@expo/vector-icons` package root, which bundled every icon family's glyph
  map and font. Ionicons is the only family the UI uses.
- `expo-camera` is built from source
  (`expo.autolinking.android.buildFromSource`), and
  `plugins/withBarcodeScannerDisabled.js` plus `app.json` rules remove the
  barcode scanner the module would otherwise link.

### Removed

- The unused barcode scanner that `expo-camera` ships with: MLKit's
  `libbarhopper_v3.so` (4,946,720 bytes), 880,888 bytes of TensorFlow Lite
  models and their Java classes. The app has no barcode feature; the live
  camera preview, photo capture and video recording are unchanged, and
  `android.permission.CAMERA` is still declared.

The camera path changed at native build time, so a physical-device pass over
video calls is still required; the other device-test limitations from v0.0.1
stand.

## [0.0.1] - 2026-10-18

The first public release, for Android (`arm64-v8a`).

### Added

- Native Android system notifications for calls and messages. Message
  notifications support quick reply, mark as read and mute; call notifications
  support answer, decline, hang up, mute and speaker.
- Rich-media keyboard insertion on Android through the local
  `modules/keyboard-media` module: GIFs, images and MP4 clips sent from a
  compatible keyboard land in the composer. Files are capped at 25 MiB and
  copied into app-owned storage.
- A live front camera preview in video calls, with camera permission handled at
  the point of use.
- A typed data layer under `src/data`: namespaced, versioned persistence with
  ordered writes, plus a cache with TTL expiry, LRU eviction and single-flight
  loading.
- R8 minification and resource shrinking for release builds, with keep rules for
  the two local native modules. The arm64-v8a release APK shrinks from
  43,537,847 bytes (41.52 MiB) to 35,628,346 bytes (33.98 MiB), 18.2% smaller;
  almost all of it comes from collapsing four dex files into two.
- A GitHub Actions CI workflow that typechecks, runs the tests, checks Expo
  dependency compatibility and exports the Android bundle.
- A GitHub Actions release workflow that builds the `arm64-v8a` APK from a
  version tag, inspects the signature and contents, writes a checksum and
  publishes a GitHub release.
- Open-source documentation: this changelog, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, the architecture and performance notes
  under `docs/`, GitHub issue templates and a pull request template.
- A Dependabot configuration for npm and GitHub Actions updates.

### Changed

- The chat list and the conversation message list now use `FlatList`.
- Profile settings were reorganised. Personal details are edited on the profile
  page, and the settings page no longer repeats them. Notification preferences
  now reflect the real Android notification channels instead of saved demo
  switches.

### Fixed

- A crash when a keyboard inserted rich media before the composer input had
  finished mounting.
- The mute and block toggles on chat profiles now save and display their state
  correctly.

Device testing was not performed for this release. Installation, notification
behaviour, keyboard insertion and the camera preview still need a physical
Android device; see the limitations in `README.md`.

[Unreleased]: https://github.com/rajofearth/messenger/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/rajofearth/messenger/releases/tag/v0.0.2
[0.0.1]: https://github.com/rajofearth/messenger/releases/tag/v0.0.1
