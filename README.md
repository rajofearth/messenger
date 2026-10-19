# Messenger

[![CI](https://github.com/rajofearth/messenger/actions/workflows/ci.yml/badge.svg)](https://github.com/rajofearth/messenger/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/rajofearth/messenger?include_prereleases&sort=semver)](https://github.com/rajofearth/messenger/releases)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

A messenger interface for Android, built with Expo SDK 57 and React Native 0.86. Chats, media albums, stories, calls and profiles are all interactive, and calls and messages arrive as real Android system notifications with working action buttons. State lives on the device: there is no account, no message server and no push service. The only server is an optional release feed that tells the app when a newer build exists.

The point of the project is the client architecture. Everything the app knows is read through one typed repository (`src/data/messengerRepository.ts`) and one cache (`src/data/cache.ts`), so a real backend can replace the local store without touching a single screen. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What it is, and what it is not

Working: chat list with unread badges and typing states, conversation threads with text, photos, videos, files and voice notes, automatic media albums, stories with per-item captions, call history, incoming/outgoing/ongoing voice and video calls with real camera preview, contact and group profiles, mute and block, and Android system notifications for calls and messages.

Simulated: other people. Replies are generated locally after a short typing delay, calls connect on a timer, and profile photos and story images are loaded from Unsplash. There is no authentication, no message transport, no signalling server and no push notification service, so a notification can only appear while the app process is running. Nothing here is end-to-end encrypted, and app state is stored unencrypted on the device. Do not put anything private in it.

## Requirements

- Node 22.18 or newer (24 recommended). `npm test` uses `node --test` with built-in TypeScript stripping, which needs 22.18+.
- JDK 17 and the Android SDK for a native build: platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, and an arm64-v8a device or an emulator matching the ABI you build.
- Android only. The native modules are Kotlin, `isSystemNotificationsAvailable` is false elsewhere, and the app does not run in Expo Go.

## Getting started

```sh
npm ci
npm run check   # typecheck + Expo dependency compatibility
npm test        # pure model and data tests, no device needed
```

To try the app without building it, download the APK from the [latest release](https://github.com/rajofearth/messenger/releases/latest) and sideload it (Android 7.0 or newer, arm64 device).

Build and install a standalone APK:

```sh
npm run android:build     # release APK for arm64-v8a -> artifacts/messenger-local.apk
npm run android:install   # adb install -r, then launch com.yashraj.messenger
```

The APK contains the JavaScript bundle and runs without a connection to this computer, and without Metro. Rebuild after any code change: there is no hot reload in this workflow. If you prefer a development server with fast refresh, `npx expo run:android` works too; the native modules require a native build either way.

`npm run android:build` is a Windows helper. On macOS or Linux, generate the project and build it yourself:

```sh
npx expo prebuild --platform android --no-install
cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Builds are signed with the debug keystore Expo generates, which is fine for a prototype and is not suitable for the Play Store. See [SECURITY.md](SECURITY.md) and the signing notes in [.github/workflows/release.yml](.github/workflows/release.yml) for how to sign a release from CI.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over the whole project |
| `npm test` | Node test runner over the listed test files: domain models, data cache, notification payloads, layout maths, and the keyboard input handler |
| `npm run check` | Typecheck plus `expo install --check` |
| `npm run android:prebuild` | Regenerates the `android/` project from `app.json` |
| `npm run android:build` | Release APK, arm64-v8a, copied to `artifacts/messenger-local.apk` |
| `npm run android:install` | Installs the built APK over adb and starts it |
| `npm run android` | Alias for `android:build` |
| `npm run release:check` | Typecheck, tests and the slim-build gate over `artifacts/messenger-local.apk` |

## Features

- **Chats.** Compact heading with private/group tabs, search that hides the stories strip while a query is active, unread badges, online and typing indicators. Opening a chat clears its unread count.
- **Messages.** Text, photos, videos, files and voice notes, with a metered recording waveform. Long-press a bubble for anchored reactions, reply (including replies to replies), forward and delete. Double-tap to react. Forwarding opens a searchable multi-recipient screen. Media opens in a viewer; documents use the system share sheet.
- **Media albums.** Consecutive media from one sender within two minutes forms a grid with up to four previews and a `+n` overflow tile. Albums break on text, a different sender, different reply targets, forwarded or deleted messages. Individual items stay addressable for deletion, replies and shared-media history.
- **Stories.** One ring per person, plus a self ring for your own uploads, with per-item captions and no forced cropping. Tap to advance, hold to pause, swipe to change people. Your own story items can be deleted.
- **Calls.** Voice and video calls from any conversation, with history, a connecting state, mute, speaker, camera flip and a return-to-chat pill that keeps the call running. The video call screen shows your real front or rear camera in the picture-in-picture view; the remote video is a placeholder image because there is no second participant.
- **Profiles.** Contact and group profiles with shared media, documents, links, call history, dates, members and admins, plus mute and block switches that persist. Edit your own name, username, bio and photo, with the current photo shown before you replace it.
- **Settings.** A theme control that follows the device by default or pins Light or Dark; the choice is stored on the device, and the status bar, navigation bar, native dialogs and root background follow it. Haptics, and a notifications section that reports the real Android permission and channel state and links straight to the system settings for each channel.
- **Updates.** When the build has a release feed, the app checks it at launch, offers the new version with its download size and notes, downloads and SHA-256 verifies the APK in the background, and then hands it to Android's installer after handling the "install unknown apps" permission. Settings always reports the current state, and a dismissed release is only re-offered when the next one exists. Updates only arrive while the app can run; there is no background updater.

## Android system notifications

`modules/system-notifications` renders real notifications through `NotificationCompat`, so they appear on the lock screen, in the shade and in the status bar while the app is backgrounded or closed.

| Channel | Importance | Used for |
| --- | --- | --- |
| `system_incoming_calls_v1` | High | Incoming call, expires after 60 seconds |
| `system_active_calls_v1` | Low | Outgoing connecting and ongoing calls |
| `system_messages_v1` | High | Message notifications |
| `system_messages_silent_v1` | High, sound cleared | Messages when the sound preference is off |

- **Call notification.** Caller avatar and name, live connected duration via the system chronometer, and buttons: answer and decline while ringing, end call plus mute and speaker while ongoing. Answering opens the app straight into the call screen.
- **Message notification.** Contact or group avatar and name, the last few messages in `MessagingStyle`, and three actions: reply inline through `RemoteInput`, mark as read, and mute the conversation. Marking read clears the notification and the unread badge; muting suppresses later notifications for that conversation.
- **Tap and act while closed.** Button presses are written to native storage before anything else, then delivered to JavaScript when the app runs. Answer and taps launch the app; other actions queue. Every action carries a UUID and is acknowledged only after it has been handled, so a crash between the two replays the action instead of losing it, and the app deduplicates by that ID.

Limits worth knowing: this is presentation and action delivery only. It does not register a Telecom call, run a foreground service, wake the process, receive push, or keep audio alive, so notification buttons are requests that the app applies when JavaScript is running rather than a headless call engine. Dismissing a notification does not hang up the local call state. See the module's [README](modules/system-notifications/README.md) for the full contract, and note that everything notification-related still needs a pass on physical hardware.

## Project layout

```text
App.tsx                     Screen composition and navigation only
src/domain/                 Types, mock data and pure helpers (no React, no storage)
src/data/                   Typed persistence, cache and the repository seam
src/services/               Thin typed bridges to the two native modules
src/state/                  App state: messenger, notifications, notification actions
src/notifications/          Notification payloads, settings, bridge and ledger
src/features/               Screens grouped by area: chats, conversations, contacts,
                            calls, profile, stories
src/ui/                     Shared primitives, theme, quick actions, navigation
modules/system-notifications/  Kotlin: Android call and message notifications
modules/keyboard-media/        Kotlin: rich content from third-party keyboards
plugins/                    Config plugins; keep unused barcode scanner code and non-English resources out of the APK
scripts/                    Android build helper and the Node test files
```

Features depend on `src/domain`, `src/data` and `src/ui`, never on `App.tsx`. `npm test` enforces this: a 500-line limit per source file, no imports back into `App.tsx`, and domain modules free of React, storage and native imports.

`android/` and `ios/` are generated by `expo prebuild` and are not committed. Native configuration belongs in `app.json` plugins, including the local ones under `plugins/`, never in generated files.

## Releases

A release is one version bump and one tag. Push a tag named `v<version>` where `<version>` matches `expo.version` in `app.json`, with `expo.android.versionCode` bumped above the last release's; [`.github/workflows/release.yml`](.github/workflows/release.yml) then runs the tests, regenerates the Android project, builds a signed arm64-v8a APK, verifies the signature, refuses a version-code regression, and publishes the APK with its SHA-256 checksum on a public GitHub release. The same workflow can be started by hand from the Actions tab.

Set `ANDROID_KEYSTORE_BASE64` (a base64-encoded keystore), `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` as repository secrets to sign with your own key. Without them the workflow falls back to Expo's debug keystore and says so in the release notes. Generate the release key once and keep it safe: Android identifies an app by its signing key, so a lost key ends in-place updates for good.

```sh
keytool -genkeypair -v -keystore release.keystore -alias messenger \
  -keyalg RSA -keysize 4096 -validity 10000
# Linux/macOS
base64 -w0 release.keystore
# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

The first release signed with a new key cannot install over a build signed with another one, because Android refuses the signature change. Those users uninstall once (which clears the app's local data) and sideload that APK by hand; every later release can install in place from inside the app.

### The update feed

The app checks for a newer build only when the APK was built with `EXPO_PUBLIC_UPDATE_FEED_URL` pointing at a manifest endpoint. Set it as a repository **variable** so the workflow bakes it in, and `CONVEX_DEPLOY_KEY` as a secret so the same workflow deploys the Convex functions and publishes the new release to the feed after the GitHub release exists. [convex/README.md](convex/README.md) has the one-time setup, the required key permissions, and the manual publish command. Without either value the release still succeeds; the app simply reports that the build has no update feed.

## Known limitations

- No backend for app data, no push, no accounts. Replies and calls are simulated while the app process is alive.
- The in-app updater only runs when the build was published with a feed URL, and it cannot install silently: Android always shows its installer, and the "install unknown apps" switch must be on.
- Switching from the generated debug key to a real release keystore needs one manual uninstall and reinstall, because Android refuses to update across a signature change.
- Block, mute, forwarding and deletion change local state only.
- Story uploads never expire, and picked media uses app-managed cache locations that the OS may reclaim.
- Media and avatar images load from Unsplash over the network; bundled fonts work offline.
- The composer uses the system keyboard rather than a custom emoji grid.
- Dismissing a call notification does not end the call, and a call cannot be answered from a notification while the JavaScript runtime is dead.
- `npm audit` reports advisories inherited from Expo and React Native tooling. Do not run `npm audit fix --force`: its proposed downgrades break the SDK 57 toolchain.
- `expo-asset` is pinned to the SDK 57 range on purpose. The unrestricted peer dependency from `expo-audio` would otherwise let npm install Expo 58's asset package, which fails SDK 57 native autolinking.
- `INSPIRATION/` holds design reference screenshots that are not covered by this project's licence.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Release notes are in [CHANGELOG.md](CHANGELOG.md), performance work and the reasoning behind it in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Licence

MIT. See [LICENSE](LICENSE).
