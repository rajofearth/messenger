# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Unsent text and attachments now survive a process kill. Every send is
  recorded in a durable outbox first, an attachment is copied into app
  documents before upload, and a finalized upload id is reused on retry so the
  server's idempotency check still passes. Pending rows return as failed
  bubbles on launch and retry automatically, up to three times per session;
  tapping the bubble still retries without a limit.
- Message attachments and stories show real upload progress. A story that is
  still uploading keeps its own segment in the viewer, plays the local copy,
  shows the percentage, and offers a retry if it fails.
- Story owners see when a story was posted, its view count, and an audience
  list with each viewer's name, avatar and view time. The owner-only
  `stories.views` query backs the list.
- A separate `Messenger Dev` build installs beside production, uses the
  development Convex deployment, and updates through its own feed. `npm run
  dev:ship` publishes a `dev-<versionCode>` GitHub prerelease and writes the
  manifest only to the development deployment.
- Deleting a message for everyone now deletes its Convex storage object once no
  live message references it. A daily orphan sweep removes uploads that never
  became a message and blobs no row protects; rows created before reference
  tracking are left alone.

### Changed

- Settings keeps account controls at the bottom, directly above Information.
  The Android permission, call-notification and message-notification rows are
  gone because they all opened the same system page; only the app's own
  notification switch remains, and turning it on asks Android for permission
  when needed.
- Picking a profile photo no longer asks for an extra media-library permission
  or forces a crop. The upload keeps the picker's real MIME type and filename.
- A profile update that races profile creation now creates the profile and
  retries once instead of failing the photo save.
- Expo configuration now goes through `app.config.js`, which returns `app.json`
  unchanged unless `APP_VARIANT=dev`. The dev branch only changes the installed
  identity and feed, so production builds keep the same name, package, icons
  and update URL.
- `npm run android:build` now regenerates the generated Android project when
  the package, version or variant changes, and preserves the debug signing key
  across that regeneration.
- Release builds now use R8's optimiser
  (`proguard-android-optimize.txt`) instead of the template's non-optimizing
  file, and the stale Reanimated keep rule is gone. Against the same source the
  optimiser removes 1,312,979 bytes (9.07%); the release APK is 13,161,063
  bytes (12.55 MiB), 1,263,131 bytes below the previous development APK and
  3.45 MiB under the 16 MiB budget. The build keeps `mapping-<version>.txt` so
  an obfuscated stack trace can be read; see `docs/PERFORMANCE.md`.
- The release APK now carries only the Ionicons glyphs the app uses and only
  the xxxhdpi launcher and splash rasters. The font falls from 389,724 to
  26,980 bytes raw (210,672 to 15,850 stored), the density prune removes 20
  files, and the stacked build is 12,702,235 bytes (12.11 MiB), 458,828 bytes
  below the R8 build and 3.89 MiB under the 16 MiB gate. `npm test` fails if a
  new glyph name is not in the subset.

### Fixed

- The updater now sweeps leftover `.part` fragments, deletes a corrupt cached
  APK before reusing its name, clears the update cache after an install even
  when the app starts offline, closes the socket when a download connection
  fails, reports a real installer error instead of a generic one, recovers
  from a stuck `installing` state, and ignores a second tap that would start
  a duplicate download or installer.
- Profile photo uploads report the actual cause (size, format, session,
  username or connection) instead of a generic "Photo could not be saved".
  The local pick is still restored when the upload fails.
- Signing out now deletes `messenger-media`, `message-media`, the avatar cache
  and the cached update APK, so the next account on the same installation
  cannot inherit the previous account's files.

The stacked A2/A3/C3 local gate build is 12,702,235 bytes (12.11 MiB),
458,828 bytes (-3.5%) below the 13,161,063-byte R8 build and 3.89 MiB below
the 16 MiB gate. The Ionicons subset accounts for 194,822 stored bytes; the
density prune removes 20 launcher/splash files (274,709 bytes on disk).
`npm run release:check` passed all 11 checks with no warnings. See
`docs/PERFORMANCE.md`.

## [0.1.1] - 2026-10-22

### Fixed

- Sign-in now reports an unknown username as "Account not found" and offers a
  direct switch to account creation, instead of surfacing Convex Auth's
  `InvalidAccountId`. Incorrect passwords and rate-limited attempts also get
  their own copy.

The published v0.1.1 APK is 14,376,546 bytes, 1,112 bytes (+0.01%) above the
published v0.1.0 APK; the local gate build measured 14,376,582 bytes, 36 bytes
higher from build-to-build compression variation. The JavaScript bundle grew
1,116 bytes for the error mapping and the alert's create-account action; the
native libraries, dex, resources and locales are unchanged. See
`docs/PERFORMANCE.md`.

## [0.1.0] - 2026-10-22

Convex now backs accounts and chat. The client keeps its local cache in front of
every read, so cached chats, threads, stories and settings paint on an offline
start while writes reconcile with the deployment.

### Added

- Username/password accounts with an editable display name, username, bio and
  profile photo. Usernames are unique and are also the sign-in id.
- Signed-in device management. The current device can revoke other sessions
  only after it has been registered for 24 hours.
- Contact discovery by username, direct conversations, and groups with member
  and admin lists.
- Text, photo, video, audio and file messages, replies, reactions, forwarding,
  delete for me/everyone, mute and block.
- Online and typing presence, unread counts, and per-conversation clearing.
- Per-conversation media visibility: keep received media in app storage or also
  copy photos and videos to a `Messenger` gallery album.
- 24-hour stories with upload, view tracking, newest-first prefetch, local
  expiry timers and an hourly server cleanup cron.
- A device cache for chats, threads, stories, call history, preferences and
  gallery markers, plus one-time media downloads into app storage.

### Changed

- The runtime no longer falls back to bundled demo chats, stories or messages.
  The legacy local-only hook and its seed data were removed.
- Calls remain local simulations, and group calls stay disabled in the header,
  the contact profile and the `startCall` guard.
- Notifications are still posted only by the running app; there is no push
  service.
- Signing out unregisters the device and clears cached account data while
  keeping the appearance preference.
- Uploads are finalized against storage's real size (25 MiB cap) and MIME
  metadata, and a rejected object is deleted; forwarding respects delete-for-me
  and cleared history.
- Story lists and seen marks are limited to the owner and people who share a
  conversation with them.
- A conversation that is on screen marks new messages read on the server, and a
  failed notification reply is retried instead of being treated as sent.
- Failed sends keep their bubble, text and local attachment so the message can
  be retried in place instead of vanishing. The composer and inbox distinguish
  sending, failed and accepted sends, and a blocked conversation shows a lock
  bar instead of an active composer.
- The inbox and thread use local Today / Yesterday / weekday / date labels, with
  day separators and honest empty-thread copy. Message and conversation actions
  expose accessible labels and custom actions, and image avatars fall back to
  initials or a person icon. Light-mode coral labels use a darker accent ink so
  they clear normal-text contrast; failed-send states use a theme-aware red.
- All images render through `expo-image`; the release build excludes the unused
  Fresco GIF/WebP decoders and the dev-only `@expo/log-box` package.
- CI and release builds receive `EXPO_PUBLIC_CONVEX_URL` and
  `EXPO_PUBLIC_CONVEX_SITE_URL`; releases also deploy the Convex functions when
  `CONVEX_DEPLOY_KEY` is present.
- Expo is on the SDK 57 patch line (`57.0.31` and `expo-sharing` `57.0.24`), so
  `expo install --check` passes without skipped validation.
- `expo-media-library` and its app config plugin are now part of the build.

### Size

- Release APK: 14,375,470 bytes (13.71 MiB), 1,140,945 bytes (-7.4%) below the
  first Convex build and 591,665 bytes (-4.0%) below published v0.0.6. The
  JavaScript bundle grew 17,460 bytes to 2,058,288 for the UX work and stays
  uncompressed for startup; compressed dex fell 365,344 bytes, native libraries
  313,512 across two fewer files, `res/` 81,697 and `resources.arsc` 351,020.
  The build is 2.29 MiB below the 16 MiB gate. See `docs/PERFORMANCE.md`.

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

[Unreleased]: https://github.com/rajofearth/messenger/compare/v0.0.6...HEAD
[0.0.6]: https://github.com/rajofearth/messenger/releases/tag/v0.0.6
[0.0.5]: https://github.com/rajofearth/messenger/releases/tag/v0.0.5
[0.0.4]: https://github.com/rajofearth/messenger/releases/tag/v0.0.4
[0.0.3]: https://github.com/rajofearth/messenger/releases/tag/v0.0.3
[0.0.2]: https://github.com/rajofearth/messenger/releases/tag/v0.0.2
[0.0.1]: https://github.com/rajofearth/messenger/releases/tag/v0.0.1
