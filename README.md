# Messenger

[![CI](https://github.com/rajofearth/messenger/actions/workflows/ci.yml/badge.svg)](https://github.com/rajofearth/messenger/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/rajofearth/messenger?include_prereleases&sort=semver)](https://github.com/rajofearth/messenger/releases)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

A messenger for Android, built with Expo SDK 57 and React Native 0.86. Accounts, profiles, contacts, groups, messages, presence, typing, stories and per-conversation preferences live in a Convex deployment; the app keeps a local copy so chats open instantly and survive an offline start. Calls and messages still arrive as real Android system notifications with working action buttons while the app process is alive. There is no push service and no call signalling server.

The client architecture reads through one typed cache seam (`src/data/messengerRepository.ts`); `useRemoteCache` and `useRemoteServerSync` keep that cache current, and `useRemoteMessenger` hydrates screens from it first, then reconciles with Convex. A backend outage therefore degrades to the last known state instead of an empty app. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What it is, and what it is not

Working: username/password accounts with signed-in device management, editable profile photos, contact creation by username, direct and group chats, text and media messages, replies, reactions, forwarding, delete for me/everyone, online and typing presence, mute and block, per-chat gallery visibility, call history, 24-hour stories, and Android system notifications for calls and messages.

Local-first: the inbox, threads, stories, settings and downloaded media are cached on the device. The cache paints immediately while Convex queries reconcile or refresh it; a cache hit does not stop the query. A per-conversation switch can copy received photos and videos into a `Messenger` album in the device gallery; otherwise media stays inside app storage.

Simulated or limited: calls connect on a timer and the remote video is a placeholder, because there is no call transport. Notifications are posted by the running app, not by push. There is no end-to-end encryption and local caches are not encrypted by the app; treat the deployment's database and the device as trusted for this prototype.

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

The app needs a Convex deployment. `.env.local` supplies
`EXPO_PUBLIC_CONVEX_URL` (the `.convex.cloud` URL) and
`EXPO_PUBLIC_CONVEX_SITE_URL` (the `.convex.site` URL used by the auth routes).
Run the backend locally with `npx convex dev`; it watches `convex/`, generates
the typed API, and sets both values. The deployment also needs `JWT_PRIVATE_KEY`
and `JWKS` for Convex Auth; `SITE_URL` is only used by OAuth or email flows,
which this app does not use. [convex/README.md](convex/README.md) has the
one-time commands. `EXPO_PUBLIC_CONVEX_URL` is read when the JavaScript bundle
is built: if it was absent, `convexClient` throws during startup and the app
cannot open, cached data included. If the build contains a deployment URL but
the device is offline, previously cached chats still render and sync resumes
when the connection returns.

To try the app without building it, download the APK from the [latest release](https://github.com/rajofearth/messenger/releases/latest) and sideload it (Android 7.0 or newer, arm64 device).

Build and install a standalone APK:

```sh
npm run android:build     # release APK for arm64-v8a -> artifacts/messenger-local.apk
npm run android:install   # adb install -r, then launch com.yashraj.messenger
```

The APK contains the JavaScript bundle and runs without a connection to this computer, and without Metro. Rebuild after any code change: there is no hot reload in this workflow. If you prefer a development server with fast refresh, `npx expo run:android` works too; the native modules require a native build either way.

### Development build beside production

The `dev` variant installs alongside Messenger, so it can point at the development Convex deployment without touching the production app's data, package or release feed:

```sh
npm run android:dev:build    # -> artifacts/messenger-dev.apk
npm run android:dev:install  # first install only; adb, or sideload the APK by hand
npm run dev:ship             # build, publish a GitHub prerelease and update the dev feed
npm run dev:publish          # publish the existing artifacts/messenger-dev.apk
```

The dev app is named `Messenger Dev`, uses package `com.yashraj.messenger.dev`, gets a fresh `0.1.1-dev.<timestamp>` version name and a version code derived from the build time, and has its own launcher icons under `assets/dev/`. `app.config.js` is the variant switch: production is still exactly `app.json` when `APP_VARIANT` is unset.

`android:dev:build` reads `CONVEX_DEPLOYMENT`, `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CONVEX_SITE_URL` from `.env.local` (or the environment), derives the dev feed from the `.convex.site` URL, and refuses to build if that would be the production feed. `dev:ship` publishes the APK as a `dev-<versionCode>` GitHub prerelease and writes the manifest to the development deployment with `npx convex run --deployment <dev-slug> releases:publish`; it never uses `--prod`. The first dev APK has to be installed once by hand. Every later build can arrive through the app's normal update prompt, because the local helper preserves the signing key in `artifacts/messenger-dev-debug.keystore` across clean prebuilds.

The dev channel is intentionally local: it needs `gh` authentication and the development Convex deployment, and it is not part of the production release workflow.

### Agent-delivered development updates

Agents working on user-visible app changes should deliver a tested development
release by default. They commit and push the source first, then run
`npm run dev:ship -- --notes "..."`; the command builds the dev APK, runs the
APK gate, uploads a GitHub prerelease and updates only the development feed.
The already-installed `Messenger Dev` app can then download the update from its
normal in-app updater. `npm run dev:publish -- --notes "..."` is the equivalent
when `artifacts/messenger-dev.apk` was already built from the exact pushed commit.

This is separate from production: agents must not create a `vX.Y.Z` production
tag or publish the production feed for ordinary development/testing work. The
first development APK still needs one manual installation with the preserved
development signing key; subsequent development builds are intended to arrive
through the updater. If the agent lacks `gh` authentication or the development
Convex configuration, the release is blocked and that setup must be provided.

### Web tester for a second user

`tools/web-tester/` is a local-only browser client for testing a second account against the phone. It uses the same Convex deployment and the same password auth as the app, so no backend test bypass is involved. It supports direct chats, groups, text and media attachments, replies, reactions, and read state.

```sh
npm run web:dev      # http://localhost:5174 and the LAN URL Vite prints
npm run web:agent -- chats
npm run web:agent -- send --to <username> --text "hello"
npm run web:control  # optional local HTTP control API on 127.0.0.1:8787
```

The reusable test account is `webtester_2026`; its password lives in the ignored `tools/web-tester/.env.local`. The CLI uses that account and can target another account with `--username`/`--password`; the control API uses the account from the environment. See [tools/web-tester/README.md](tools/web-tester/README.md) for the full command list, control API routes and test flow. The web tester is not imported by the mobile app and is not part of the APK.

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
| `npm run android:dev:build` | Dev APK for `com.yashraj.messenger.dev`, copied to `artifacts/messenger-dev.apk` |
| `npm run android:dev:install` | Installs and starts the dev APK over adb |
| `npm run dev:ship` | Builds the dev APK, publishes its GitHub prerelease and updates the dev feed |
| `npm run dev:publish` | Publishes the existing dev APK without rebuilding |
| `npm run android` | Alias for `android:build` |
| `npm run release:check` | Typecheck, tests and the slim-build gate over `artifacts/messenger-local.apk` |
| `npm run web:dev` | Local second-user web tester at `http://localhost:5174` |
| `npm run web:agent` | CLI for the web tester account: chats, send, read, upload, react |
| `npm run web:control` | Local HTTP control API for the web tester account |
| `npm run web:check` | Typecheck the web tester independently of the app |

## Features

- **Accounts.** Create an account with a name, username and password. Usernames are how people find you; changing one renames the password account at the same time. There is deliberately no signed-out password reset, and the app warns that forgetting the password loses the account. Password changes and device removal live in Settings, where a device must be signed in for 24 hours before it can remove other devices.
- **Chats.** Compact heading with private/group tabs, search that hides the stories strip while a query is active, unread badges, and live online and typing indicators. Opening a chat clears its unread count and syncs the read position.
- **Messages.** Text, photos, videos, files and voice notes, with a metered recording waveform. Long-press a bubble for anchored reactions, reply (including replies to replies), forward, save photo/video to the gallery, and delete for me or everyone. Double-tap to react. Forwarding opens a searchable multi-recipient screen. Media opens in a viewer; documents use the system share sheet.
- **Media albums.** Consecutive media from one sender within two minutes forms a grid with up to four previews and a `+n` overflow tile. Albums break on text, a different sender, different reply targets, forwarded or deleted messages. Individual items stay addressable for deletion, replies and shared-media history.
- **Stories.** One ring per person, plus a self ring for your own uploads, with per-item captions and no forced cropping. Stories expire after 24 hours locally and in the database, and the next few are prefetched into app storage.
- **Calls.** Voice and video calls from any direct conversation, with history, a connecting state, mute, speaker, camera flip and a return-to-chat pill that keeps the call running. Group calls are disabled. The video call screen shows your real front or rear camera in the picture-in-picture view; the remote video is a placeholder because there is no call transport.
- **Profiles.** Contact and group profiles with shared media, documents, links, call history, dates, members and admins, plus mute, block and gallery-visibility switches that persist on the server. Edit your own name, username, bio and photo, with the current photo shown before you replace it.
- **Groups.** Create a group by entering one or more member usernames. A group must contain at least one other account; voice and video calls stay unavailable for groups.
- **Settings.** Account controls (password, signed-in devices, sign out), a theme control that follows the device by default — including a switch made while the app is running — or pins Light or Dark, haptics, and a notifications section that reports the real Android permission and channel state and links straight to the system settings for each channel.
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
app.config.js               Production app.json, or the dev variant selected by APP_VARIANT
assets/dev/                 Dev-only launcher icons
convex/                     Convex schema, auth, chat, files, devices, stories, release feed
src/domain/                 Types and pure helpers (no React, no storage)
src/data/                   Typed local persistence, cache and the repository seam
src/services/               Convex client, uploads, media cache, secure identity, native bridges
src/state/                  Local-first state: remote messenger, cache, sync, presence, writers
src/notifications/          Notification payloads, settings, bridge and ledger
src/features/               Screens grouped by area: auth, chats, conversations, contacts,
                            calls, profile, stories
src/ui/                     Shared primitives, theme, quick actions, navigation
modules/system-notifications/  Kotlin: Android call and message notifications
modules/keyboard-media/        Kotlin: rich content from third-party keyboards
plugins/                    Config plugins; keep unused barcode scanner code and non-English resources out of the APK
scripts/                    Android build helpers, dev release publisher and Node test files
tools/web-tester/           Local-only second-user website, CLI and control API
```

Features depend on `src/domain`, `src/data` and `src/ui`, never on `App.tsx`. `npm test` enforces this: a 500-line limit per source file, no imports back into `App.tsx`, and domain modules free of React, storage and native imports.

`android/` and `ios/` are generated by `expo prebuild` and are not committed. Native configuration belongs in `app.json` plugins, including the local ones under `plugins/`, never in generated files.

## Releases

A release is one version bump and one tag. Push a tag named `v<version>` where `<version>` matches `expo.version` in `app.json`, with `expo.android.versionCode` bumped above the last release's; [`.github/workflows/release.yml`](.github/workflows/release.yml) then runs the tests, regenerates the Android project, builds a signed arm64-v8a APK, verifies the signature, refuses a version-code regression, and publishes the APK with its SHA-256 checksum on a public GitHub release. The same workflow can be started by hand from the Actions tab. Development prereleases are ignored when it chooses the previous production release for its size and version-code baseline.

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

The app checks for a newer build only when the APK was built with a feed URL pointing at a manifest endpoint. Production builds use `EXPO_PUBLIC_UPDATE_FEED_URL`; dev builds use `EXPO_PUBLIC_DEV_UPDATE_FEED_URL`, selected in `src/data/updateFeed.ts` by `EXPO_PUBLIC_APP_VARIANT`. Set the production URL as a repository **variable** so the workflow bakes it in, and `CONVEX_DEPLOY_KEY` as a secret so the same workflow deploys the Convex functions and publishes the new release to the feed after the GitHub release exists. [convex/README.md](convex/README.md) has the one-time setup, the required key permissions, and the manual publish command. Without either value the release still succeeds; the app simply reports that the build has no update feed.

The two feeds are separate. Production's `releases` rows live on the production Convex deployment; dev's rows live on the development deployment, and `npm run dev:ship` only targets the latter. Dev GitHub releases are prereleases tagged `dev-<versionCode>`, so the production workflow ignores them when it picks its size and version-code baseline.

## Known limitations

- No push notifications. Message and call notifications are posted by the running app, so they do not arrive after the process is killed.
- Calls are local simulations: there is no audio or remote video transport, no signalling server and no Telecom integration. Group calls are intentionally unavailable.
- The app stores its local cache unencrypted and the Convex deployment is the source of truth for accounts and messages. There is no end-to-end encryption, and signing out deletes this device's local copy so the next account cannot read it.
- The in-app updater only runs when the build was published with a feed URL, and it cannot install silently: Android always shows its installer, and the "install unknown apps" switch must be on.
- Switching from the generated debug key to a real release keystore needs one manual uninstall and reinstall, because Android refuses to update across a signature change.
- The dev channel is published from the local checkout through `npm run dev:ship`. A CI dev channel would need a development Convex deploy key and a stable dev signing key; no such workflow is configured yet.
- The first dev APK must be installed by hand. If `artifacts/messenger-dev-debug.keystore` is deleted, the signing key can change and Android will require uninstalling the dev app once before in-place updates work again.
- Story media is removed from the database and app state after 24 hours; cached story files are not proactively deleted from app storage.
- Media and avatar images load from Convex storage after upload; fonts remain bundled.
- The composer uses the system keyboard rather than a custom emoji grid.
- Dismissing a call notification does not end the call, and a call cannot be answered from a notification while the JavaScript runtime is dead.
- `npm audit` reports advisories inherited from Expo and React Native tooling. Do not run `npm audit fix --force`: its proposed downgrades break the SDK 57 toolchain.
- `expo-asset` is pinned to the SDK 57 range on purpose. The unrestricted peer dependency from `expo-audio` would otherwise let npm install Expo 58's asset package, which fails SDK 57 native autolinking.
- `INSPIRATION/` holds design reference screenshots that are not covered by this project's licence.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Release notes are in [CHANGELOG.md](CHANGELOG.md), performance work and the reasoning behind it in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Licence

MIT. See [LICENSE](LICENSE).
