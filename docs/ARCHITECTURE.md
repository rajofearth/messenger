# Architecture

A contributor guide to this Expo SDK 57 / React Native 0.86.3 Android messenger prototype. There is no backend for app data, no push service and no real accounts. Everything the app shows is produced by the app itself from seeded state in `src/domain/data.ts`; the network traffic is Unsplash image downloads and, when the build was configured with one, the release feed that offers a newer APK.

## Layers and allowed dependency direction

Intended direction: `features` and `state` depend on `domain`, `data`, `services` and `ui`; nothing depends on `App.tsx`; `domain` depends on nothing.

| Layer | Path | What belongs here |
| --- | --- | --- |
| Composition | `App.tsx` | Screen selection, hook wiring, Android back handling, the notification preference switch. No feature markup. |
| Screens | `src/features/<area>/` | One folder per area: `chats`, `conversations`, `contacts`, `calls`, `profile`, `stories`. Screen components, their stylesheets, and feature-local hooks such as `useCalls` and `useMessageMedia`. |
| Shared UI | `src/ui/` | Presentational primitives (`primitives.tsx`, `Navigation.tsx`, `QuickActions.tsx`, `theme.ts`), `KeyboardMediaInput`, `UpdatePrompt.tsx`, `openAttachment`. |
| App state | `src/state/` | `useMessenger.ts` (all persisted app state), `useAppUpdater.ts` (the single update controller), `useNotificationActions.ts` (notification action handling), `useThemePreference.ts` and `useDeviceScheme.ts` (the theme preference and the live device scheme it follows). |
| Native bridges | `src/services/` | `systemNotifications.ts`, `keyboardMedia.ts`, `appUpdater.ts` and `deviceScheme.ts`. Thin typed wrappers, no app logic. |
| Persistence | `src/data/` | `messengerRepository.ts` (the backend seam), `store.ts`, `records.ts`, `cache.ts`, `avatars.ts`, `updateFeed.ts` (the release-feed client). |
| Domain | `src/domain/` | `data.ts` (types and seed data), `model.ts`, `messageActions.ts`, `mediaAlbums.ts`, `stories.ts`, `chatDetails.ts`, `updates.ts`. Pure functions and types only. |

### What `scripts/architecture.test.mjs` enforces

The test runs with `npm test` (Node's `node:test`, using built-in TypeScript stripping) and checks exactly three things.

1. **File size.** `App.tsx`, every `.ts`/`.tsx` file under `src/`, and every `.kt` file under `modules/*/android/src` must be 500 lines or fewer, counted after trimming trailing whitespace. The failure message asks for a focused module to be extracted. At the time of writing the largest file is `src/state/useMessenger.ts` at 488 lines, so the limit is close.
2. **No imports back into the app entry point.** Every file except `App.tsx` is checked against the regular expression `/from\s+["'][^"']*\/App(?:\.tsx?)?["']/`, so any static `import ... from ".../App"` or `".../App.tsx"` fails. Only static `from` imports are scanned; a `require()` or a dynamic `import()` would not be caught.
3. **Domain purity.** Files in `src/domain` must not import from `react`, `react-native`, anything starting with `expo` or `@react-native`, or any path whose text contains `features/`, `state/` or `ui/`. The rule does not forbid `src/data`, and no domain file imports it today.

Five current dependency directions sit outside the ideal picture, and it is worth knowing them before moving code. `src/state/useMessenger.ts` imports `setHapticsEnabled` from `src/ui/primitives.tsx`; `src/state/useNotificationActions.ts` imports `src/features/calls/pendingCall.ts`; `src/services/keyboardMedia.ts` imports the `KeyboardMedia` type from `src/ui/KeyboardMediaInput.tsx`; `src/state/useThemePreference.ts` imports `resolveDark` and `src/services/deviceScheme.ts` imports `parseDeviceScheme` from `src/ui/theme.ts`. The test only enforces the three rules above, not general layer boundaries.

## Data flow in `useMessenger`

`src/state/useMessenger.ts` owns the app state. The slices are `chats`, `messages` (a record keyed by chat id), `stories`, `history`, the appearance preference (`theme`, resolved by `src/state/useThemePreference.ts` into the `dark` flag screens consume), `profile`, `selected`, `typingIds`, and a `loaded` flag.

### Startup

1. `messengerRepository.migrateLegacy()` runs once, before any load, to upgrade an old install.
2. Five loads run in parallel: `loadChats`, `loadStories`, `loadHistory`, `loadAppearance`, `loadSettings`.
3. Stored values replace the seeded defaults. Chats pass through `enrichChat` (`src/domain/chatDetails.ts`), which adds mock bio, username, membership and a created date. The same array references are stored in the "already saved" refs so the persistence effects do not immediately write them back.
4. If anything throws, the seeded demo data stays and startup still completes: the `catch` is empty and the `finally` sets `loaded`. `App.tsx` renders a loading view until fonts are ready and `loaded` is true.
5. The stored `haptics` preference is pushed into the module-level `setHapticsEnabled` switch in `src/ui/primitives.tsx`.

### Appearance and system bars

The stored preference is one of `system`, `light` or `dark`. `src/state/useThemePreference.ts` combines it with the device scheme through `resolveDark` (`src/ui/theme.ts`) and exposes the resulting `dark` flag, so every screen keeps receiving a plain boolean. Records written before the system option existed stored `{ dark: boolean }`; `normalizeAppearance` in `src/data/appearance.ts` maps them to a pinned theme as they load, so an existing choice is never silently reset. The preference is saved by the hook when the user changes it, not by a `useMessenger` effect.

The device scheme does not come from `useColorScheme`. React Native reads it from the running activity, and an app that sets a night mode — `userInterfaceStyle: "automatic"` sets AppCompat's "follow the system" one, through `expo-system-ui`, on every activity create — gives AppCompat a configuration that Android re-applies on every later configuration change. The activity keeps the scheme the device had when it was created, so `Appearance` sees nothing to report and a theme switch made while the app runs only reaches the next activity. `modules/device-scheme` reads the application context instead, whose resources Android updates in place, and `src/state/useDeviceScheme.ts` keeps the reported scheme live, falling back to `useColorScheme` where the module is absent. `modules/device-scheme/README.md` is the contract for why and how to verify it.

`src/ui/useSystemAppearance.ts` pushes the choice to native surfaces: `Appearance.setColorScheme` sets the AppCompat night mode for a pinned theme, and for `system` it resolves to the device's current scheme rather than `"unspecified"`, because AppCompat ignores a repeat of the mode it already has and could not follow a later switch; `SystemUI.setBackgroundColorAsync` (`expo-system-ui`) paints the root view behind the app and remembers the color for the next launch. `App.tsx` renders `expo-status-bar` and `expo-navigation-bar` components with the same mapping — light icons over dark backgrounds — and the full-screen call UI adds light icons on top because its chrome is always dark.

### Persistence

Every slice has its own effect. Each effect compares the current value with the last value it wrote (`savedChats`, `savedStories`, `savedHistory`, and a `savedThreads` map for messages) and returns early when the identity is unchanged. Messages are written per thread, one repository key per chat. All writes are fire-and-forget with an empty `catch`, so a storage failure never blocks the UI. The appearance preference is the exception: `useThemePreference` writes it directly when the control changes, because there is no second writer to guard against.

### Lazy conversation loading

`thread(chat)` is the only way messages enter memory. It returns the in-memory thread when present, joins an in-flight request when one exists (the `threads` map of promises), and otherwise reads `messages/<chatId>` through the repository. When storage has nothing, `seedMessages(chat)` generates a short thread. The result is merged into `messages` unless another load already won the race. `openChat` sets `selected` and calls `thread(chat)`, so history loads the first time a conversation is opened and not before.

### Sending and simulated replies

`send(partial)` reads the current conversation from `chatsRef`, ignores the call when the chat is missing, blocked, or the text is empty, and builds a `Message` with a timestamp-based id, the local clock label and an ISO `createdAt`. A reply preview is refreshed against the live thread, so a deleted original becomes "Message deleted". `append` checks the chat still exists and is not blocked, appends to the thread, and updates the chat row preview.

After a send, a 2600 ms timer is set. Only the newest timer per chat survives, and `cancelReplies` clears it when a chat is blocked, cleared or deleted. When the timer fires, the simulated reply is appended through the same `append` path and the chat is removed from `typingIds`.

### Idempotent sends from notifications

`sendTo(chatId, text, actionId)` exists for notification replies. When `actionId` is given, the message id becomes `notice-<actionId>`, and the function returns early if a message with that id already exists in the thread. Android redelivers unacknowledged actions, so this is the second layer of protection behind the action ledger described below.

### Read and unread state

- `markChatRead(chats, id)` in `src/domain/model.ts` sets `unread: 0` for one chat.
- `updateChatPreview` moves the chat to the front, sets preview and time, and increments `unread` unless the message is the user's own (`mine`) or the chat is open and visible.
- Visibility uses two refs, `conversationVisible` and `selectedRef`. `App.tsx` calls `setConversationVisible(true)` only when no call, profile, forward sheet or story viewer covers the app, so "read" means on screen, not merely selected.
- The `read` notification action calls `markRead` and dismisses the native notification.

## Storage

### Keys

`src/data/messengerRepository.ts` composes keys from `STORE_VERSION` in `src/data/store.ts`, currently `v2`, under the `messenger/` namespace. The keys are `messenger/v2/chats`, `stories`, `history`, `appearance`, `settings`, `pending-call`, and one `messenger/v2/messages/<chatId>` per conversation. Deleting a conversation calls `saveMessages(chatId, null)`, which removes the key. The `appearance` value is `{ theme }`; `loadAppearance` normalizes the older `{ dark }` shape through `src/data/appearance.ts`.

### Legacy migration

`migrateLegacy()` reads two old keys: `messenger-prototype-v1` (a single blob holding chats, messages, stories, history and `dark`) and `@messenger/settings/v1`. Each field is copied to its slice with defensive checks (`Array.isArray`, `typeof`), messages are split into per-chat keys, the blob's `dark` flag becomes a pinned `{ theme }` appearance record, and both legacy keys are removed afterwards, including when the blob cannot be parsed. There is no migration counter. The upgrade is one-time because the source keys are deleted, not because a flag records it.

One stale comment: `src/data/records.ts` says version bumps are handled in `src/state/migrations.ts`, but that file does not exist. The version marker is `STORE_VERSION` in `src/data/store.ts`, and the legacy path is `migrateLegacy`.

### Why slices instead of one blob

- A send rewrites `messages/<chatId>` and the chat list, not the whole app state.
- A corrupt or unreadable slice loses only that slice. `store.load` deletes a key whose JSON cannot be parsed.
- Reads after the first one are served from the store's memory map, so reopening a conversation does not touch storage.

### Store behaviour

`createStore(driver, namespace)` keeps a memory map, a per-key in-flight read map (single flight), and a write queue. `save` updates memory immediately, then puts the serialized value into a `Map` keyed by the full storage key and drains that map in insertion order. Because the queue is keyed by key, repeated writes to the same key before the queue drains collapse into a single write with the newest value. A `null` value removes the key and clears the memory entry. If a write rejects, `schedule()` catches it and runs the drain again, so the remaining queued keys are still attempted. A failed key is already out of the queue, and a persistent failure can make the `save` promise reject; callers such as `useMessenger` swallow that with an empty `catch`.

## Cache and avatars

`src/data/cache.ts` is a small typed cache with three properties:

- **TTL.** `set` and `load` accept a lifetime; `ttlMs` (default 0) is the cache-wide default, and 0 means "never expires while retained". The TTL path is covered by `src/data/cache.test.mjs`. No production caller sets a TTL today.
- **LRU.** `max` (default 128) bounds the entry count. A `get` re-inserts the entry so eviction takes the least recently used key first.
- **Single flight.** `load(key, loader)` returns a cached value when present, joins the in-flight promise for concurrent callers, and does not cache failures.

`cacheKey` is a 32-bit FNV-1a hash in base 36, used as a stable file name for downloaded avatars.

The only production user of `createCache` is `src/data/avatars.ts`; persisted slices get the same ideas from `createStore` rather than from the cache module. In `avatars.ts` the cache holds up to 256 resolved local URIs and never expires in memory. Instead, each hit also checks that the file exists, and the downloads folder is pruned down to 240 files on every 25th download. `warmAvatars` downloads the first 8 conversations' avatars two at a time in the background, and `useMessageNotifications` calls it when the chat list changes. `cachedAvatarUri` is the variant that reports a local URI only if it is already cached.

See `docs/PERFORMANCE.md` for why avatars are resolved to local files before they reach a notification.

## The notification pipeline

Scope first: this is a local prototype. There is no push service, no FCM or APNs, no server, and no headless JavaScript. Notifications are posted by the app while it runs, and their actions are queued natively until the app next runs. The native module is Android-only and is not present in Expo Go, so `isSystemNotificationsAvailable` in `src/services/systemNotifications.ts` is false there and every notification hook returns early. When the module is missing, calling a bridge function throws a described error instead of pretending to succeed.

### Payload mapping

`src/notifications/payloads.ts` is pure and is tested by `src/notifications/payloads.test.mjs`. `messagePayload` builds a MessagingStyle snapshot: only messages where `mine` is false, the newest 25 (`NOTIFICATION_MESSAGE_LIMIT`), timestamps made strictly increasing even when `createdAt` is missing, `title` and `isGroup` for group chats, bodies reduced to "New message" when previews are off, and `silent: true` when sound is off. `callPayload` sets `allowMute`, `allowSpeaker`, `muted`, `speaker` and `connectedAt` only for the ongoing state, because only then can the app act on them. Avatars arrive as already resolved local URIs; the payload module never downloads a remote URL.

### Message notifications

`useMessageNotifications` keeps a map of chat id to the newest announced incoming message id. On the first run it records those ids without notifying, so existing history is not re-announced. After that it notifies only for chats whose newest incoming message changed and that are not on screen, muted or blocked. The conversation on screen is dismissed immediately. `App.tsx` passes `visible`, so a call, profile, forward sheet or story viewer suppresses notifications even while a chat stays selected.

### Call notifications

`useCallNotifications` mirrors the call session into one notification. It publishes a signature of call id, state, video, mute, speaker, connect time and the resolved avatar, and skips `showCall` when the signature is unchanged. That is what keeps an avatar resolving late from creating a second notification. When the call becomes null, the notification is dismissed.

### JS delivery: subscribe, ledger, acknowledge

`useNotificationBridge` implements the delivery contract:

1. The native event subscription is created before the pending snapshot is read, because the native side can emit while the snapshot is being written.
2. Live events and snapshot entries are merged into one queue and deduplicated by `action.id`.
3. `drain()` processes one action at a time. If the ledger already has the id, the action is acknowledged without running the handler. Otherwise the handler runs, then the id is recorded in the ledger, then the action is acknowledged.
4. If any step throws, the action stays unacknowledged, so it is redelivered on the next launch. This is at-least-once delivery with idempotent handling.
5. `src/notifications/actionLedger.ts` persists the last 200 handled ids under `notifications/v1/handled-actions`. `useNotificationBridge` hydrates the ledger before queueing the snapshot, so a redelivered action is not handled twice. The `actionLedger` singleton is shared between live events and the snapshot.
6. `src/state/useNotificationActions.ts` maps action types to app behaviour: `reply` awaits `sendTo` with the action id, which loads the thread if needed and writes it before resolving, then clears the notification so the native "Reply queued" subtext cannot go stale; `read` marks read and dismisses, `muteConversation` updates both the app preference and native suppression, `answer` and `openCall` rebuild a pending incoming call session from the `pending-call` record (with an expiry check in `src/features/calls/pendingCall.ts`), and `decline`/`hangup` records a missed call when the process had died, using the non-expiring `readIncomingCall` so a late decline still reaches call history. Every branch checks that the target still exists.

   Reply is the only branch that writes through to storage before the action is acknowledged, because it is the only one whose loss is user-visible data loss. `read` and `muteConversation` update React state and are persisted by the usual slice effects, so a crash in that narrow window costs a badge or a suppression flag, not a message.

### Native side

The Kotlin module lives in `modules/system-notifications/android/src/main/java/expo/modules/systemnotifications/`:

- `SystemNotificationsModule.kt` exposes the promise API and the `onAction` event.
- `NotificationRenderer.kt` builds CallStyle notifications (`forIncomingCall`, `forOngoingCall`), MessagingStyle notifications, and the RemoteInput reply action (`RemoteInput.Builder(NotificationActions.REPLY).setLabel("Reply")`).
- `NotificationStore.kt` persists pending actions and mute state in `SharedPreferences("system-notifications-v1")`, guarded by a single process lock. Its comment states that the commit completes before an action is emitted or the receiver exits.
- `NotificationActions.kt` reads RemoteInput results and builds PendingIntents whose identity includes the target, the notification generation and the toggle value, because extras are not part of PendingIntent identity.

`modules/system-notifications/README.md` is the contract for the module. Its limits matter: no remote push, no foreground service, no microphone or call kept alive, answer/open only launch the app, other actions wait for a running JS consumer or the next launch, and the device acceptance checklist has not been verified on hardware.

## The update pipeline

Releases can be offered inside the app. Tier one, shipped, downloads the next APK and hands it to Android's installer; tier two, not built yet, is reserved for an OTA JavaScript bundle so not every release costs a full download.

### Feed contract

The app asks one endpoint with the version code Android reports for the installed build:

```text
GET https://<deployment>.convex.site/updates/manifest?versionCode=4
```

The answer is either `{"upToDate":true}` or the manifest object (`versionCode`, `versionName`, `apkUrl`, `apkSha256`, `apkBytes`, `minVersionCode`, `mandatory`, `notes`). The document is untrusted: `src/domain/updates.ts` parses and bounds every field, `versionCode` is the only ordering key, and an unreadable or failed request is `unknown`, never "up to date". `minVersionCode` and `mandatory` decide whether the prompt can be dismissed (`decideUpdate`), and dismissal is remembered per version code (`saveDismissedRelease`). A build that is at least as new as the feed's release is `current`; the endpoint deliberately answers `{"upToDate":true}` without the download URL in that case.

The endpoint URL is baked into the bundle at build time from `EXPO_PUBLIC_UPDATE_FEED_URL` (`src/data/updateFeed.ts`). A build without it reports "This build has no update feed" in Settings and never prompts.

### Client flow

`src/state/useAppUpdater.ts` is the only update state in an app run; `App.tsx` owns it and passes it to the launch prompt (`src/ui/UpdatePrompt.tsx`) and the Settings card (`src/features/profile/UpdateSection.tsx`). The sequence is: read the installed version from native, check the feed, download and verify when the user agrees, then call `installApk`. When the app becomes active again after the installer has run, it re-reads the installed version, clears the cached APK and the pending prompt if the install succeeded, and restores a retry if it did not. The prompt is only drawn when no call, story or dialog is on screen, so an update never interrupts something in progress.

### Native side

`modules/app-updater` is a Kotlin Expo module:

- `AppUpdaterModule.kt` reads `versionName`/`versionCode` through `PackageManager`, reports `canInstall` from `canRequestPackageInstalls` (true below API 26, where it is a global setting), opens the per-app install-permission screen and the app's settings page, and starts the installer with `Intent.ACTION_VIEW` plus the `application/vnd.android.package-archive` type.
- The FileProvider authority is `${applicationId}.fileprovider` and it exposes only `cache-path updates/`, so the installer can read the staged APK and nothing else. `plugins/withUpdateInstaller.js` writes the `REQUEST_INSTALL_PACKAGES` permission, the provider and `res/xml/file_paths.xml` into the generated manifest.
- `ApkDownloader.kt` streams the URL to `cacheDir/updates/update-<first 12 hex of the digest>.apk`, verifies SHA-256 while writing, renames `.part` only after the digest matches, keeps one download at a time, refuses non-https URLs (except in debuggable builds), follows redirects by hand because GitHub redirects to a CDN, and caps the file at 200 MiB, the same `MAX_APK_BYTES` the feed parser enforces. A file that already matches the digest is reused without a download.

### Server side

`convex/` holds the control plane: a `releases` table, `releases:publish` (internal mutation), `releases:latest`, and the `/updates/manifest` HTTP action. `convex/lib/manifest.ts` mirrors the client's checks and runs before every publish, so the feed cannot serve a document the app would reject; a publish below the current head is refused, and re-publishing the same version replaces its row so a retried workflow is safe. The APK itself is not stored in Convex: it stays on the GitHub release, and the manifest points at that asset. The release workflow runs `npx convex deploy` plus `releases:publish` after the release exists; `scripts/update-manifest.mjs` hashes the real APK and turns the matching `CHANGELOG.md` section into the `notes` field. See `convex/README.md` for the one-time setup. Without `CONVEX_DEPLOY_KEY` the workflow skips the feed and warns; the app ships unconfigured instead.

Two checks stand between the feed and a replaced app: the digest must match the bytes that arrive, and Android must verify the new APK's signature against the installed build before it installs anything. A compromised feed can offer a newer version, but it cannot produce one that Android will install.

## Adding a feature

- A pure rule, type or seed shape goes in `src/domain/`.
- A new stored slice needs the record type in `src/data/records.ts`, a load/save pair in `src/data/messengerRepository.ts`, and a slice plus load and persist effects in `src/state/useMessenger.ts`. Keep the key under the `messenger/v2` namespace, or bump `STORE_VERSION` and extend `migrateLegacy`.
- A native call needs a typed function in `src/services/`, gated by the availability check the module already exports. App behaviour stays in the caller.
- A screen goes in `src/features/<area>/`, a shared control in `src/ui/`, composition alone in `App.tsx`.
- Anything that pushes a file past 500 lines must be split, or `npm test` fails.

### Replacing storage with a real backend

The seam is `src/data/messengerRepository.ts`. `messengerRepository` is a single exported object built by `createMessengerRepository()`, and its callers (`useMessenger`, `SettingsPreferences`, `pendingCall`, `actionLedger`) only use its methods, which are per-slice loads and saves. To add a server, write a different object with the same method names and the record shapes from `src/data/records.ts`, keep the exported name, and leave screens and hooks untouched. Two things to plan for: the current methods have no pagination, cursor or conflict model, and message ids such as `notice-<actionId>` assume the action id is unique, so a server has to assign or accept client ids deliberately.

## Deliberate non-goals and known limitations

- No backend for app data, push, accounts or network messaging. Replies and calls are simulated with timers. The one server is the optional release feed, which stores no user data.
- No OTA JavaScript updates yet. A release is offered as a whole APK, so the download is the full size every time; the OTA bundle tier is the next step.
- No call audio and no remote video. The video call screen shows your own camera in the picture-in-picture view; the remote participant is a placeholder photo, because there is no second participant.
- Storage is local and unencrypted; the README tells users not to enter sensitive information.
- Native features are Android-only. `system-notifications` and `keyboard-media` do nothing on iOS and web, and neither exists in Expo Go; `device-scheme` falls back to React Native's `useColorScheme` where it is absent.
- Notification actions other than answer/open do not run while JavaScript is dead; they are queued.
- The architecture test's rules are narrow: size, no App imports, domain purity. Layer boundaries between `features`, `state` and `services` are convention, as the three exceptions above show.
- Sample avatars and story media are remote Unsplash URLs, size-parameterised but still network downloads.
- Notification threads are capped at the newest 25 messages, and group senders are not stored per message, so group notifications use the group name as the sender.
