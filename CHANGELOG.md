# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/rajofearth/messenger/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/rajofearth/messenger/releases/tag/v0.0.1
