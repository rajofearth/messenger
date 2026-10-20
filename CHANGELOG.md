# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.6] - 2026-10-19

This release hardens the local prototype around failed storage, startup
hydration, notification delivery, update prompts and conversation scrolling.
It also improves outgoing-message contrast and makes release tags describe the
source that was actually built.

### Fixed

- Failed storage writes now reject and remain retryable, and an older in-flight
  read cannot replace a newer value saved during that read.
- Empty saved chat and story collections survive restart instead of restoring
  seeded demo data. Conversation sends and forwards wait for history hydration
  rather than appending to a seed fallback.
- Notification reply writes propagate durability failures instead of being
  acknowledged as complete while only held in memory.
- Optional update prompts respect Later and remembered per-release dismissal;
  forced updates remain visible.
- Message and call notifications require an explicit native posted result,
  publish before waiting for avatar downloads, and clean up when notifications
  are disabled.
- New incoming messages no longer pull a reader out of older conversation
  history, and outgoing message text meets the normal-copy contrast target in
  both themes.
- Tag-triggered releases validate the pushed tag and build the source pointed to
  by that tag. Manual releases require an explicit tag.

### Tests

- Added storage regression coverage for failed writes and stale in-flight reads.
- Added contrast regression coverage for outgoing message text.

### Size

The arm64-v8a APK is **14,967,135 bytes (14.27 MiB)**. That is +4,136 bytes
(+0.03%) against the published v0.0.5 APK. The increase is the larger
JavaScript bundle; the regression tests do not ship in the APK.

## [0.0.5] - 2026-10-19

The app follows the device theme while it runs. Until this release, a switch
between light and dark only reached the app at the next start: React Native read
the scheme from the activity, and the activity's configuration was pinned to the
value the device had when the app was created. The device is now read directly,
and the system theme follows it live. This release also turns on Gradle build
caching for every build.

### Changed

- Gradle build caching is on for every build, and CI keeps the cache warm.
  A `Warm the Gradle cache` job runs on pushes to `master` and writes it;
  pull requests and tag builds only read it, so a release never rewrites the
  cache it restored. On the bench runs the release build step fell from
  8m 25s (v0.0.3, no cache) to 3m 42s on the first warm build and 2m 03s on
  the second; 174 of 458 tasks were restored instead of executed, including
  every Kotlin compile and the Expo and React Native Gradle plugin builds.
  An empty-cache build still takes 8m 20s, so nothing regressed. Locally, an
  unchanged rebuild takes 2s instead of about 5s. The four properties
  (`org.gradle.caching`, `org.gradle.configuration-cache`, the daemon
  `jvmargs` and the configuration-cache problem mode) are written by
  `plugins/withGradlePerformance.js`, so they survive every `expo prebuild`.
- `:keyboard-media`'s unit tests run on the release variant in the release
  build. The release variant shares its compilation with `:app:assembleRelease`,
  so the test no longer pulls the whole debug dependency graph into a build
  that only ships release artifacts.

### Fixed

- The **System** theme follows the device while the app is running, in both
  directions, without a restart. `Appearance` reported nothing because an app
  that sets a night mode — `userInterfaceStyle: "automatic"` does, through
  `expo-system-ui` — hands AppCompat a configuration that Android re-applies on
  every later configuration change, freezing the activity's scheme at the value
  it had when the activity was created. `modules/device-scheme`, a new Kotlin
  Expo module, reads the application context instead, whose resources Android
  updates in place, and `src/state/useDeviceScheme.ts` keeps that value live;
  `useColorScheme` is now only the fallback where the module is absent.
- Native surfaces follow too: for the **System** theme,
  `src/ui/useSystemAppearance.ts` now resolves the device's current scheme for
  `Appearance.setColorScheme` instead of `"unspecified"`, because AppCompat
  ignores a repeat of the night mode it already has and so could not apply a
  switch that arrived later. Pinned themes are unchanged.

### Size

The arm64-v8a APK grows by 3,756 bytes against the published v0.0.4, which is
the comparison the release check makes: **14,959,243 bytes (14.27 MiB) to
14,962,999 bytes (14.27 MiB), +0.03%**. The local v0.0.4 build is 36 bytes
larger than the published one, so against it the growth is 3,720, and that is
what the entries below are measured with. All of it is the new module: the
JavaScript bundle grows by 1,688 bytes (to 1,633,748) for the bridge, the hook
and the parser, the other three bundled assets by 11 (`assets/app.config` is 12
larger with the new keep rule, `baseline.profm` a byte smaller), and the Kotlin
module and its manifest entries add 2,021 bytes of stored dex. The native
libraries (5,896,334 bytes), `res/`, `resources.arsc` and the packaged metadata
are unchanged.

## [0.0.4] - 2026-10-19

The app can now update itself. A small release feed tells it when a newer build
exists; it downloads and verifies the APK, handles Android's "install unknown
apps" permission, and hands the file to the system installer. The feed is served
from Convex, while the APK itself stays on the GitHub release. This is also the
first release that can be signed with a project keystore, so anyone updating
from an older debug-signed APK has to install this one by hand once.

### Added

- In-app updates, with a launch prompt and an **Updates** card in Settings. The
  prompt appears over the chat list only, never over a call, story or dialog;
  a dismissed release is not offered again, while a mandatory release or one
  above the installed build's floor (`minVersionCode`) keeps asking. Both
  surfaces report download progress and offer cancel, retry, the permission
  step, and the final install.
- `modules/app-updater`, a Kotlin Expo module that reads the installed
  `versionName`/`versionCode`, downloads to `cacheDir/updates/` with streaming
  SHA-256 verification (reusing an already verified file), cancels an in-flight
  download, clears the cache, reports the "install unknown apps" state, opens
  the matching system settings, and starts Android's package installer through
  a `FileProvider` that exposes only the staged APK directory.
  `plugins/withUpdateInstaller.js` adds `REQUEST_INSTALL_PACKAGES` and that
  provider to the generated manifest.
- `src/domain/updates.ts` validates the feed as untrusted input: https-only
  download URLs, a 64-hex digest, bounded sizes and notes, and `versionCode` as
  the only ordering key. `src/data/updateFeed.ts` is the small feed client
  (10 s timeout, 256 KiB body cap), and `src/state/useAppUpdater.ts` is the
  single update controller per app run. A build without
  `EXPO_PUBLIC_UPDATE_FEED_URL` reports "no update feed" instead of pointing at
  a placeholder.
- `convex/` holds the control plane: a `releases` table, an internal
  `releases:publish` mutation, `releases:latest`, and the
  `GET /updates/manifest?versionCode=N` HTTP action. `convex/lib/manifest.ts`
  mirrors the client's checks, refuses a publish below the current version
  code, and answers `{"upToDate":true}` to a build that has caught up. The
  deploy key needs only `deployment:deploy` and
  `deployment:functions:runInternalMutations`.
- `scripts/update-manifest.mjs` hashes the built APK, reads the matching
  `CHANGELOG.md` section as the prompt notes, and prints the document
  `releases:publish` expects. The release workflow deploys the Convex functions
  and publishes the feed after the GitHub release exists, and warns instead of
  failing when `CONVEX_DEPLOY_KEY` is not set.
- The slim-build gate now checks that `expo.android.versionCode` is a positive
  integer, that the APK reports the same version code, and, when the workflow
  passed the previous release's version code, that the new one moved past it.
  Tests cover the feed round trip (server output through the app's parser),
  the changelog-to-notes conversion and the release script's argument handling.

### Changed

- The version code moves from 1 to 4, so Android will accept this build as an
  update over the previous ones. `versionName` and `package.json` say 0.0.4.
- Release builds can now be signed with a project keystore through the four
  `ANDROID_*` secrets, and the README documents generating one. Switching from
  the generated debug key is a one-time break: Android refuses to install an
  APK signed by a different key over the old one, so that install must be
  sideloaded after an uninstall, and an uninstall clears the app's local data.

### Size

The arm64-v8a APK grows by 32,964 bytes: **14,926,279 bytes (14.23 MiB) to
14,959,243 bytes (14.27 MiB), +0.2%**. Most of it is the new JavaScript: the
bundle grows by 24,940 bytes (to 1,632,060), which is the prompt, the Settings
card, the feed client and the update rules plus the feed URL inlined at build
time; the assets around it grow by 62 bytes. The Kotlin module and its manifest
entries add 7,571 bytes of stored dex, and the remaining 391 bytes are spread
across `resources.arsc` and packaged property files. The native libraries are
unchanged at 5,896,334 bytes.


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

[Unreleased]: https://github.com/rajofearth/messenger/compare/v0.0.5...HEAD
[0.0.5]: https://github.com/rajofearth/messenger/releases/tag/v0.0.5
[0.0.4]: https://github.com/rajofearth/messenger/releases/tag/v0.0.4
[0.0.3]: https://github.com/rajofearth/messenger/releases/tag/v0.0.3
[0.0.2]: https://github.com/rajofearth/messenger/releases/tag/v0.0.2
[0.0.1]: https://github.com/rajofearth/messenger/releases/tag/v0.0.1
