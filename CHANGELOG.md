# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-10-19

The theme now follows the device by default and can be pinned to Light or
Dark, and both system bars, native dialogs and the root background follow the
choice. The release APK also drops the library translations: 15,680,467 bytes
(14.95 MiB) to 14,926,279 bytes (14.23 MiB).

### Added

- System theme support. Settings offers **System**, **Light** and **Dark**;
  System follows the Android setting, including changes while the app is
  running. The choice is stored in the typed repository, and records written
  before the option existed (`{ dark: true/false }`) keep their pinned theme.
- `expo-system-ui` with `userInterfaceStyle: "automatic"`, which is what makes
  Android follow the device theme, and `expo-navigation-bar` (with
  `enforceContrast` off, so the bar stays transparent like the status bar),
  which keeps the navigation-bar buttons on the same light/dark rule as the
  status bar. `src/ui/useSystemAppearance.ts` also gives native dialogs and
  the root view background the active theme, and remembers the background for
  the next launch.
- Unit tests for `resolveDark` and for the `{ dark }` to `{ theme }`
  appearance migration.

### Changed

- The Settings "Dark mode" switch is now a System / Light / Dark control. The
  full-screen call UI keeps light system-bar icons because its chrome is
  always dark.
- Only English resources are packaged. `plugins/withEnglishOnlyResources.js`
  adds `resConfigs "en"` to `defaultConfig`, which removes around a hundred
  locales of strings that AndroidX, Material and Play Services libraries ship:
  754,188 bytes against the published v0.0.2 APK. Density, night mode, screen
  size and layout-direction resources are untouched.

Device testing was not performed for this release. The theme control, the
navigation-bar styling and the trimmed resource table should be checked on a
physical Android device, especially with the system in Dark mode and the app
pinned to Light; the camera note from v0.0.2 still applies.

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

[Unreleased]: https://github.com/rajofearth/messenger/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/rajofearth/messenger/releases/tag/v0.0.3
[0.0.2]: https://github.com/rajofearth/messenger/releases/tag/v0.0.2
[0.0.1]: https://github.com/rajofearth/messenger/releases/tag/v0.0.1
