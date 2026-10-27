# Architecture

A contributor guide to this Expo SDK 57 / React Native 0.86.3 Android messenger. Accounts, profiles, contacts, conversations, messages, reactions, unread counts, presence, typing, conversation preferences and 24-hour stories live in a Convex deployment. The client keeps a device cache in front of every read, so the inbox and previously opened threads paint before the network answers and an offline start still shows the last known state. The production and development release feeds are separate HTTP endpoints on separate deployments.

## Layers and allowed dependency direction

Intended direction: `features` and `state` depend on `domain`, `data`, `services` and `ui`; nothing depends on `App.tsx`; `domain` depends on nothing. The Convex functions in `convex/` are the server, and the client reaches them through `src/services/convexClient.ts` and the state hooks, never directly from a screen.

| Layer | Path | What belongs here |
| --- | --- | --- |
| Composition | `App.tsx` | Screen selection, hook wiring, Android back handling, the notification preference switch. No feature markup. |
| Screens | `src/features/<area>/` | One folder per area: `auth`, `chats`, `conversations`, `contacts`, `calls`, `profile`, `stories`. Screen components, their stylesheets, and feature-local hooks such as `useCalls` and `useMessageMedia`. |
| Shared UI | `src/ui/` | Presentational primitives (`primitives.tsx`, `ResponsiveImage.tsx`, `Navigation.tsx`, `QuickActions.tsx`, `theme.ts`), `KeyboardMediaInput`, `UpdatePrompt.tsx`, `openAttachment`. |
| App state | `src/state/` | `useRemoteMessenger.ts` (the screen-facing API), `useRemoteCache.ts`, `useRemoteServerSync.ts`, `useRemotePresence.ts`, `useRemoteThreadMedia.ts`, `remoteMessengerSend.ts` (optimistic send and retry), `useOutboxResume.ts` (resumes persisted sends), the `remoteMessenger*` mutation helpers, `useAppUpdater.ts`, `useNotificationActions.ts`, `useThemePreference.ts` and `useDeviceScheme.ts`. |
| Native and network bridges | `src/services/` | `convexClient.ts`, `deviceIdentity.ts`, `remoteFiles.ts`, `mediaCache.ts`, `outbox.ts` (durable copy and queue for unsent sends), `systemNotifications.ts`, `keyboardMedia.ts`, `appUpdater.ts` and `deviceScheme.ts`. Thin typed wrappers, no screen logic. |
| Persistence | `src/data/` | `messengerRepository.ts` (the local cache seam), `store.ts`, `records.ts`, `cache.ts`, `avatars.ts`, `updateFeed.ts` (the release-feed client). |
| Backend | `convex/` | `schema.ts`, Convex Auth (`auth.ts`, `auth.config.ts`), `profiles`, `chat`, `preferences`, `devices`, `files`, `stories`, the `convex-chat` component mount, the expiry cron and the release feed. |
| Domain | `src/domain/` | `data.ts` (types), `model.ts`, `messageActions.ts`, `mediaAlbums.ts`, `stories.ts`, `chatDetails.ts`, `time.ts` (local date labels), `threadMerge.ts` (optimistic message and inbox matching), `outbox.ts` (hydrating persisted sends and their inbox previews), `updates.ts`. Pure functions and types only. |

`app.json` remains the production identity. `app.config.js` reads it and returns it unchanged unless `APP_VARIANT=dev`; the dev branch changes the name, scheme, package, generated version, launcher icons and feed metadata. `scripts/android.mjs` owns the native side of the switch: it stores the variant identity in `android/.messenger-build.json`, regenerates the generated project when that identity changes, and preserves the debug keystore so builds can update one another.

### What `scripts/architecture.test.mjs` enforces

The test runs with `npm test` (Node's `node:test`, using built-in TypeScript stripping) and checks these rules.

1. **File size.** `App.tsx`, every `.ts`/`.tsx` file under `src/`, and every `.kt` file under the four `modules/*/android/src` directories must be 500 lines or fewer, counted after trimming trailing whitespace. The failure message asks for a focused module to be extracted. `App.tsx` and `src/state/useRemoteMessenger.ts` are the largest files, so extract before adding code there.
2. **No imports back into the app entry point.** Every file except `App.tsx` is checked against the regular expression `/from\s+["'][^"']*\/App(?:\.tsx?)?["']/`, so any static `import ... from ".../App"` or `".../App.tsx"` fails. Only static `from` imports are scanned; a `require()` or a dynamic `import()` would not be caught.
3. **Domain purity.** Files in `src/domain` must not import from `react`, `react-native`, anything starting with `expo` or `@react-native`, or any path whose text contains `features/`, `state/` or `ui/`. The rule does not forbid `src/data`, and no domain file imports it today.
4. **Test registration.** Every `*.test.*` file under `scripts/`, `src/` or `modules/` must appear in the `test` script in `package.json`, and every listed file must exist.
5. **No type escapes or debug logging.** Application sources contain no `any`, `@ts-ignore`/`@ts-nocheck` or `console.log`.

Some dependency directions sit outside the ideal picture. `src/state/useRemoteCache.ts` imports `setHapticsEnabled` from `src/ui/primitives.tsx`; `src/state/useNotificationActions.ts` imports `src/features/calls/pendingCall.ts`; `src/services/keyboardMedia.ts` imports the `KeyboardMedia` type from `src/ui/KeyboardMediaInput.tsx`; `src/state/useThemePreference.ts` imports `resolveDark` and `src/services/deviceScheme.ts` imports `parseDeviceScheme` from `src/ui/theme.ts`. The test only enforces the rules above, not general layer boundaries.

## Backend

### Convex layout

`convex/schema.ts` extends Convex Auth's tables with `username`, then adds `profiles`, `devices`, `conversationMeta`, `conversationPreferences`, `files`, `mediaVariants`, `stories` and `storyViews`. Conversations, memberships, messages and presence are owned by the `convex-chat` component, mounted in `convex/convex.config.ts`; `convex/chat.ts` wraps it with the app's identity, block rules, message projection and inbox shape.

- **Auth.** `convex/auth.ts` configures the Password provider. The username is normalized (`@` removed, lowercased) and used as the provider account id and email, so there is no email delivery and no signed-out reset. `convex/auth.config.ts` trusts Convex's own site URL as the JWT issuer. `JWT_PRIVATE_KEY` and `JWKS` are deployment configuration, not repository secrets; `SITE_URL` is only relevant to OAuth or email flows. See `convex/README.md`.
- **Profiles.** `profiles.ensure` creates a row on first sign-in from the password provider id, which is the canonical username. `profiles.update` checks both `profiles` and `authAccounts` for uniqueness, validates the name and username, renames the account and profile together, and deletes the previous avatar storage object after a replacement is saved.
- **Identity.** All server functions call `requireUser` in `convex/lib/identity.ts`, which validates that the auth session belongs to the user, has not expired, and returns a stable `subjectId` and the `messenger` chat scope. Conversation access always goes through the component's `getMemberAccess`; a missing membership is reported as `CHAT_NOT_FOUND`.
- **Blocks.** `chat.canWrite` refuses a blocked conversation and, for direct conversations, also refuses when the peer blocked the writer. The block preference is per user but enforced for both sides.
- **Clearing and hiding.** `conversationPreferences` stores `clearedThrough` and `hiddenAt` per user. The inbox and thread query apply the clear timestamp; the inbox hides a conversation until a newer message arrives. Opening a direct conversation restores a hidden row; deleting a chat writes `hiddenAt`.
- **Devices.** `devices.register` ties the installation's stable SecureStore id to the current auth session. `devices.list` reports only live sessions, flags the current device and marks whether it is older than 24 hours. `devices.revokeDevice` and `devices.revokeOthers` refuse to act until the current device is a day old, and expire the target auth session so its next request fails.
- **Files and stories.** Uploads take a Convex storage URL, then `files.finalizeUpload` reads the real object metadata and records its owner; the storage `contentType` is checked against the upload kind instead of trusting the client's MIME string. Finalization rejects an empty object, anything over 25 MiB, and a mismatched MIME type. A rejected object is deleted in a committing mutation and returned as `{ error }`, because throwing would roll the delete back. Message queries return a signed storage URL only after the membership check; there is no standalone file-URL endpoint. A new `files` row starts with an empty `messageRefs` list; sending, forwarding and deleting a message keep that list in step with the live messages that show the blob. Story rows carry an explicit `expiresAt`; `stories.cleanupExpired` runs hourly from `convex/crons.ts` and removes the row, its storage object, its variants and its views. `stories.list` and `markSeen` only expose the owner and people who share a `conversationMeta` conversation with them, and `stories.views` returns a story's viewers only to its owner. The client filters expired stories on load and after each sync, and the list query filters the audience before applying its newest-row limit.
- **Image variants.** An image upload may carry up to three client-rendered widths (`w256`, `w512`, `w1080`). `convex/lib/mediaVariantRules.ts` validates each one against its name (within 2px), a maximum height, WebP/PNG MIME, unique storage ids and a per-width byte ceiling (128 KiB, 384 KiB, 1 MiB). The size always comes from Convex storage metadata, never the client's `bytes` field. A bad batch deletes every blob in the request and returns `{ error: "INVALID_VARIANTS" }`; the client retries the original once without variants. Accepted rows live in `mediaVariants` with the source storage id and a URL resolved at write time, so `chat.messageView` adds one indexed read per image instead of a `getUrl` call per width. `stories.list` returns the same variants plus the source `width` and `height`.
- **Release feed.** `convex/http.ts` keeps the public `/updates/manifest` route, and `convex/lib/manifest.ts` mirrors the client's validation. The feed remains independent of user data.

### Client data flow

`src/state/useRemoteMessenger.ts` is the screen-facing hook. `useRemoteCache` loads the local slices first and exposes `loaded = localReady`, so screens paint cached chats instead of waiting for the network. `useRemoteServerSync` writes every fresh inbox, story list and opened thread back to `messengerRepository`; `useRemoteThreadMedia` downloads attachments into app storage, reuses cached file URIs, merges threads through `src/domain/threadMerge.ts`, keeps optimistic bubbles until the server echoes them, and optionally copies received media to the gallery; `useRemotePresence` keeps the online heartbeat and the open conversation's typing room alive.

Writes are optimistic. `remoteMessengerWriters.ts` updates the messages record and chat list through small shared helpers; `remoteMessengerPreferences.ts` applies mute, block, gallery visibility, clear and delete locally before calling the server; `remoteMessengerProfile.ts` uploads a newly picked avatar once and then updates the profile; `remoteMessengerSend.ts` owns text and attachment sends plus retries, while `remoteMessengerUploads.ts` holds the lower-level upload-and-send path. A text or attachment send that fails keeps its bubble with `status: "failed"`, its text (or local URI), its client message id and, once uploaded, its finalized storage id, and the row shows "Not sent. Tap to retry." A retry reuses the same client id, payload and storage id, so the server's `clientMessageId` deduplication still holds and the same blob is sent again. `src/domain/threadMerge.ts` matches a confirmed server row against the local bubble, keeps unmatched and failed bubbles across refreshes, and preserves a pending inbox row until a newer server message replaces it.

Only server-confirmed messages reach the thread cache. Every optimistic send is recorded in a separate `outbox` slice first; an attachment is copied into `message-media/outbox-<clientId>.<ext>` before its row is written, so a missing picker source fails without queueing a retry that can never work. A killed process revives the row as a failed bubble and `useOutboxResume` retries it at launch, when the app returns to the foreground, when the Convex socket reconnects, and every 30 seconds (three automatic attempts per message per session, reset by a reconnect; the bubble's retry is unlimited). The confirmed cache still only holds rows with a `sequence`, so an outbox row is never mistaken for a server message. `markLocalMessageStatus` writes the inbox row once the server accepts the send, so the preview survives a restart even if the echoed message has not arrived yet. Other failures surface as an alert and leave the local copy in place.

The app starts behind `StartupGate`, which loads the bundled DM Sans faces, and then `AuthGate`. While Convex Auth is restoring the stored session it shows a spinner; once the session is authenticated it renders the app even if `profiles.me` is still in flight, so cached content survives an offline start. Signing out invalidates the in-memory outbox and waits for its queued writes, then calls `devices.unregister`, `messengerRepository.clearAccountData()` and `clearLocalAccountFiles()` so the next account on the same installation cannot read the previous local cache, inherit its downloaded media, avatar files, picker and voice-recording caches, image and video library caches, or cached update APK, or have a late upload callback re-queue a previous account's message. The appearance slice is kept; chats, messages, the outbox, stories, history, settings, gallery markers and pending-call data are cleared.

## Appearance and system bars

The stored preference is one of `system`, `light` or `dark`. `src/state/useThemePreference.ts` combines it with the device scheme through `resolveDark` (`src/ui/theme.ts`) and exposes the resulting `dark` flag, so every screen keeps receiving a plain boolean. Records written before the system option existed stored `{ dark: boolean }`; `normalizeAppearance` in `src/data/appearance.ts` maps them to a pinned theme as they load, so an existing choice is never silently reset. The preference is saved by the hook when the user changes it, not by a cache effect.

The device scheme does not come from `useColorScheme`. React Native reads it from the running activity, and an app that sets a night mode — `userInterfaceStyle: "automatic"` sets AppCompat's "follow the system" one, through `expo-system-ui`, on every activity create — gives AppCompat a configuration that Android re-applies on every later configuration change. The activity keeps the scheme the device had when it was created, so `Appearance` sees nothing to report and a theme switch made while the app runs only reaches the next activity. `modules/device-scheme` reads the application context instead, whose resources Android updates in place, and `src/state/useDeviceScheme.ts` keeps the reported scheme live, falling back to `useColorScheme` where the module is absent. `modules/device-scheme/README.md` is the contract for why and how to verify it.

`src/ui/useSystemAppearance.ts` pushes the choice to native surfaces: `Appearance.setColorScheme` sets the AppCompat night mode for a pinned theme, and for `system` it resolves to the device's current scheme rather than `"unspecified"`, because AppCompat ignores a repeat of the mode it already has and could not follow a later switch; `SystemUI.setBackgroundColorAsync` (`expo-system-ui`) paints the root view behind the app and remembers the color for the next launch. `App.tsx` renders `expo-status-bar` and `expo-navigation-bar` components with the same mapping — light icons over dark backgrounds — and the full-screen call UI adds light icons on top because its chrome is always dark.

## Storage

### Keys

`src/data/messengerRepository.ts` composes keys from `STORE_VERSION` in `src/data/store.ts`, currently `v2`, under the `messenger/` namespace. The keys are `messenger/v2/chats`, `stories`, `history`, `appearance`, `settings`, `gallery-saved`, `pending-call`, `outbox`, and one `messenger/v2/messages/<chatId>` per conversation. Clearing or deleting a conversation removes its messages key through `removeMessages`. The `appearance` value is `{ theme }`; `loadAppearance` normalizes the older `{ dark }` shape through `src/data/appearance.ts`.

### Why slices instead of one blob

- A send rewrites `messages/<chatId>` and the chat list, not the whole app state.
- A corrupt or unreadable slice loses only that slice. `store.load` deletes a key whose JSON cannot be parsed.
- Reads after the first one are served from the store's memory map, so reopening a conversation does not touch storage.

### Outgoing queue

A send is written to the `outbox` slice before the network call; an attachment is copied byte-for-byte into `documents/message-media/outbox-<messageId>.<ext>` before its row is written. The confirmed thread cache still holds only rows with a server `sequence`; the outbox is what survives a kill between picking a file and the server echo. `src/services/outbox.ts` owns the in-memory queue and serializes writes through the repository. A cold-start read accepts only an array of records with a string `chatId` and message id, and merges rows queued while the read was in flight by message id, keeping the queued version. Signing out clears the in-memory queue and awaits its pending writes before the store is cleared.

The finalized Convex `_storage` id is written back to the row before `sendAttachment`, so a retry reuses the uploaded blob. A second upload would change the message parts, and `convex-chat` rejects a reused `clientMessageId` with `IDEMPOTENCY_CONFLICT`. If the finalized blob has disappeared server-side and the mutation answers `FILE_FORBIDDEN`, the durable copy is uploaded once more and the send retried. On cold start `src/domain/outbox.ts` appends the rows as `failed` bubbles and updates the inbox preview; `useOutboxResume` retries them immediately, on foreground, on reconnect and every 30 seconds while active, capped at three automatic attempts per message (a reconnect resets the cap).

A send becomes `sent` only when the mutation returns the server view with a `sequence` (`isSendConfirmed`); that view replaces the optimistic bubble and is merged into the stored thread by message id, in sequence order, before it is written to the thread cache, and only then does the row leave the queue. A kill between the server accepting and the client receiving that view therefore leaves the row queued and the bubble pending, never a cached message without a sequence. A row also leaves when its bubble is deleted or the chat is cleared, and a late upload callback never re-inserts a row that is gone. Copies the queue no longer references are swept on the next launch or foreground once they are an hour old, so a sent attachment does not keep a second copy forever.

### Server retention

A `files` row created by this version carries `messageRefs`, the ids of the live
messages that show its blob. Sending and forwarding add an id; delete for
everyone removes it and deletes the `_storage` object only when the list becomes
empty. A row created before this list existed has `messageRefs: undefined` and
is treated as unknown, so its blob is never deleted. Per-user delete and clear
only write `conversationPreferences`; another member's copy keeps the blob.

`files.sweepOrphans` runs daily from `convex/crons.ts`. It removes a `files` row
whose blob is gone, a message upload that never became a message once it is 24
hours old, and any `_storage` object that no files row, profile avatar, story or
variant row protects. Deleting a source also deletes its `mediaVariants` rows
and blobs, and a variant row whose source or variant blob is missing is removed
so it cannot pin the generic sweep. The grace period keeps an upload that is
still in flight safe. Story expiry and avatar replacement keep deleting their
own objects and variants.

### Store behaviour

`createStore(driver, namespace)` keeps a memory map, a per-key in-flight read map (single flight), and a write queue. `save` updates memory immediately, then puts the serialized value into a `Map` keyed by the full storage key and drains that map in insertion order. Because the queue is keyed by key, repeated writes to the same key before the queue drains collapse into a single write with the newest value. A `null` value removes the key and clears the memory entry. If a write rejects, `schedule()` catches it and runs the drain again, so the remaining queued keys are still attempted. A failed key is already out of the queue, and a persistent failure can make the `save` promise reject; callers such as `useRemoteCache` and `useRemoteServerSync` swallow that with an empty `catch`.

## Cache and avatars

`src/data/cache.ts` is a small typed cache with three properties:

- **TTL.** `set` and `load` accept a lifetime; `ttlMs` (default 0) is the cache-wide default, and 0 means "never expires while retained". The TTL path is covered by `src/data/cache.test.mjs`. No production caller sets a TTL today.
- **LRU.** `max` (default 128) bounds the entry count. A `get` re-inserts the entry so eviction takes the least recently used key first.
- **Single flight.** `load(key, loader)` returns a cached value when present, joins the in-flight promise for concurrent callers, and does not cache failures.

`cacheKey` is a 32-bit FNV-1a hash in base 36, used for stable file names and for image keys when a URL is not a Convex storage URL.

The only production user of `createCache` is `src/data/avatars.ts`; persisted slices get the same ideas from `createStore` rather than from the cache module. In `avatars.ts` the cache holds up to 256 resolved local URIs and never expires in memory. Each hit checks that the file exists, and the downloads folder is pruned down to 240 files on every 25th download. `useAvatarUri` is the UI seam: it waits for the shared local file before allowing a remote fallback, so a successful UI load and a notification load cannot download the same URL separately. `warmAvatars` downloads likely contacts two at a time in the background, and `useMessageNotifications` calls it when the chat list changes. `syncAvatarReferences` registers current chat, story-owner, call-history and self snapshots; replacing a URL removes its old file only after no other current reference uses it. `cachedAvatarUri` is the variant that reports a local URI only if it is already cached.

Avatar identity comes from `imageCacheKey` in `src/domain/imageVariants.ts`, not from the signed URL. Convex gives the chat, story and profile queries a different `/api/storage/<id>?token=...` URL for the same person, so the cache key is `storage-<id>` and the in-memory entry, downloaded file and expo-image cache entry are all shared. Other http(s) URLs fall back to `cacheKey`, and local URIs have no key. `Avatar` passes that key to `expo-image` as `source.cacheKey` and `recyclingKey`, which also joins in-flight decodes when several screens show the same person at once.

The same module holds the width rules used by stored message and story variants: `variantWidths` never upscales, `pickImageVariant` picks the smallest variant that covers the target, and `targetPixels` applies the 2x density cap. `src/services/imageVariants.ts` is the native side: it turns a picked avatar into a 512px WebP before upload, and `remoteMessengerUploads.ts` renders one WebP per stored width before an image message or photo story is finalized. Both transforms return no result on web, GIF or video content, and a failure leaves the original file usable. Variants upload sequentially after the main blob, progress covers the whole operation, and the temporary files are discarded in a `finally`. A retry that already holds a finalized storage id skips preparation because the variants belong to that source.

Rendering follows the same widths. `src/ui/ResponsiveImage.tsx` calls `chooseImageSource` with the surface's slot width in dp and `PixelRatio.get()`. A local `file:`, `content:`, `asset:` or `data:` URI wins because it is already downloaded and gallery-safe; a remote image takes the smallest stored width covering the 2x target, keeps the original when no variant covers it or when the variant would widen a smaller source, and reuses a local `previewUri` only when it is at least as wide as the chosen variant. A cached variant file is recorded in `previewUri`/`previewWidth` while `uri`/`image` stays the remote original, so `saveMessageMedia` and `saveStoryToGallery` still export full resolution. `mergeThread` carries a cached preview onto the refreshed server row but never replaces one with an empty local value.

See `docs/PERFORMANCE.md` for why avatars are resolved to local files before they reach a notification.

## The notification pipeline

Scope first: there is no push service, no FCM or APNs, and no headless JavaScript. Notifications are posted by the app while it runs, and their actions are queued natively until the app next runs. The native module is Android-only and is not present in Expo Go, so `isSystemNotificationsAvailable` in `src/services/systemNotifications.ts` is false there and every notification hook returns early. When the module is missing, calling a bridge function throws a described error instead of pretending to succeed.

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
6. `src/state/useNotificationActions.ts` maps action types to app behaviour: `reply` awaits `sendTo` with the action id, which uses a deterministic client message id so a redelivered action cannot create a second message, then clears the notification so the native "Reply queued" subtext cannot go stale; `read` marks read and dismisses, `muteConversation` updates both the app preference and native suppression, `answer` and `openCall` rebuild a pending incoming call session from the `pending-call` record (with an expiry check in `src/features/calls/pendingCall.ts`), and `decline`/`hangup` records a missed call when the process had died, using the non-expiring `readIncomingCall` so a late decline still reaches call history. Every branch checks that the target still exists.

   Reply is the only branch whose loss is user-visible data loss, so it waits for the server mutation before the action is acknowledged. `read` and `muteConversation` update React state and are persisted by the usual slice effects, so a crash in that narrow window costs a badge or a suppression flag, not a message.

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

The endpoint URL is baked into the bundle at build time (`src/data/updateFeed.ts`). Production reads `EXPO_PUBLIC_UPDATE_FEED_URL`; a development build reads `EXPO_PUBLIC_DEV_UPDATE_FEED_URL` because `EXPO_PUBLIC_APP_VARIANT` is `dev`. A build without a feed reports "This build has no update feed" in Settings and never prompts.

### Two channels

Development builds are not a mode inside the production app. They are a second installed application:

- `app.config.js` selects `Messenger Dev`, `com.yashraj.messenger.dev`, scheme `messenger-dev`, the icons in `assets/dev/`, and a generated `0.1.1-dev.<timestamp>` version when `APP_VARIANT=dev`.
- A different application id isolates Android storage, SecureStore entries, notifications, FileProvider authority, cached downloads and the installed package itself. The production app remains installed and untouched.
- The dev build uses the development Convex URLs and the development deployment's `/updates/manifest`. `scripts/android.mjs` derives that feed from `EXPO_PUBLIC_CONVEX_SITE_URL`, refuses a feed on the production host, and sets the bundle's dev feed variable.
- `scripts/dev-release.mjs` builds the APK, runs the dev variant of `release-check.mjs`, uploads a `dev-<versionCode>` GitHub prerelease, publishes the manifest to the development deployment with `releases:publish`, and verifies that `GET /updates/manifest?versionCode=0` returns the same digest. It refuses a non-dev `CONVEX_DEPLOYMENT`, a non-dev package, or a feed on the wrong host.
- `android:build` and `android:dev:build` share the same generated `android/` directory, so switching variants removes and regenerates it. The helper saves `android/app/debug.keystore` to `artifacts/messenger-dev-debug.keystore` and restores it, because Android only installs an update signed by the same key.
- The production workflow skips prereleases and only considers `v*` tags when it chooses its previous-release baseline, so a dev release cannot affect production size or version checks.

The first dev APK still has to be installed by hand. After that, the existing full-APK updater downloads subsequent dev releases from the dev feed.

### Client flow

`src/state/useAppUpdater.ts` is the only update state in an app run; `App.tsx` owns it and passes it to the launch prompt (`src/ui/UpdatePrompt.tsx`) and the Settings card (`src/features/profile/UpdateSection.tsx`). The sequence is: read the installed version from native, check the feed, download and verify when the user agrees, then call `installApk`. When the app becomes active again after the installer has run, it re-reads the installed version, clears the cached APK and the pending prompt if the install succeeded, and restores a retry if it did not. The prompt is only drawn when no call, story or dialog is on screen, so an update never interrupts something in progress.

### Native side

`modules/app-updater` is a Kotlin Expo module:

- `AppUpdaterModule.kt` reads `versionName`/`versionCode` through `PackageManager`, reports `canInstall` from `canRequestPackageInstalls` (true below API 26, where it is a global setting), opens the per-app install-permission screen and the app's settings page, and starts the installer with `Intent.ACTION_VIEW` plus the `application/vnd.android.package-archive` type.
- The FileProvider authority is `${applicationId}.fileprovider` and it exposes only `cache-path updates/`, so the installer can read the staged APK and nothing else. `plugins/withUpdateInstaller.js` writes the `REQUEST_INSTALL_PACKAGES` permission, the provider and `res/xml/file_paths.xml` into the generated manifest.
- `ApkDownloader.kt` streams the URL to `cacheDir/updates/update-<first 12 hex of the digest>.apk`, verifies SHA-256 while writing, renames `.part` only after the digest matches, keeps one download at a time, refuses non-https URLs (except in debuggable builds), follows redirects by hand because GitHub redirects to a CDN, and caps the file at 200 MiB, the same `MAX_APK_BYTES` the feed parser enforces. A file that already matches the digest is reused without a download.

### Server side

`convex/` holds the control plane: a `releases` table, `releases:publish` (internal mutation), `releases:latest`, and the `/updates/manifest` HTTP action. `convex/lib/manifest.ts` mirrors the client's checks and runs before every publish, so the feed cannot serve a document the app would reject; a publish below the current head is refused, and re-publishing the same version replaces its row so a retried workflow is safe. The APK itself is not stored in Convex: it stays on the GitHub release, and the manifest points at that asset. The release workflow runs `npx convex deploy` plus `releases:publish` after the release exists; `scripts/update-manifest.mjs` hashes the real APK and turns the matching `CHANGELOG.md` section into the `notes` field. The dev publisher uses the same table and mutation, but on the development deployment and with explicit generated version values. See `convex/README.md` for the one-time setup. Without `CONVEX_DEPLOY_KEY` the production workflow skips the feed and warns; the app ships unconfigured instead.

Two checks stand between the feed and a replaced app: the digest must match the bytes that arrive, and Android must verify the new APK's signature against the installed build before it installs anything. A compromised feed can offer a newer version, but it cannot produce one that Android will install.

## Adding a feature

- **A pure rule or type** goes in `src/domain/`. Domain code must not import React, React Native, Expo or anything under `features/`, `state/` or `ui/`.
- **Server data** starts in `convex/schema.ts`: add the table and the indexes the queries will use, then write the functions in a `convex/` module. Every public function resolves the user through `requireUser`, conversation access through the `convex-chat` component's membership check, and storage access through an owner or membership check. Run `npx convex dev --once` to deploy and regenerate `convex/_generated`.
- **A client field** needs the shape in `src/domain/data.ts` (or `src/data/records.ts` for cache-only data), a projection in `useRemoteServerSync.ts` or the matching `remoteMessenger*` helper, and an optimistic write if the UI must not wait. Keep cache keys under `messenger/v2`; bump `STORE_VERSION` when a persisted shape changes.
- **A native call** needs a typed function in `src/services/`, gated by the availability check the module already exports. App behaviour stays in the caller.
- **A screen** goes in `src/features/<area>/`, a shared control in `src/ui/`, and only composition in `App.tsx`.
- **Size.** A file over 500 lines fails `npm test`; extract a focused module instead of growing the hook or screen.

## Cache versus server

`src/data/messengerRepository.ts` is the device cache seam, not the source of truth. `useRemoteCache` loads it once, and `useRemoteServerSync` writes fresh inbox and story snapshots back to it. `useRemoteThreadMedia` writes the opened thread and its downloaded files. Screens read the merged values from `useRemoteMessenger`; they never call Convex directly.

Writes are optimistic. Small helpers (`remoteMessengerWriters.ts`, `remoteMessengerPreferences.ts`, `remoteMessengerMessageActions.ts`, `remoteMessengerUploads.ts`, `remoteMessengerSend.ts`) update the cache before the mutation resolves, and a failure keeps the local copy in place instead of rolling it back. There is no operation log: `src/domain/threadMerge.ts` reconciles pending rows with the next server snapshot, two devices editing the same conversation resolve last-write-wins, and the thread cache only holds server-confirmed rows. Unsent sends are the exception: they live in the separate outbox slice described above. The server's thread query pages backwards with `beforeSequence`; the client currently requests the newest 100 messages and does not yet offer "load older".

Story uploads are the exception that stays outside the cache. `useRemoteStories` owns a local upload queue, reports byte progress into each row, and appends those rows after the server stories with `mergeStoryUploads`; a row disappears only when `stories.list` returns the same id. This keeps multi-video shares fully visible while their uploads run. The viewer's owner-only audience comes from `useStoryViewers`, which maps `stories.views` to the same `StoryView` shape as the rest of the domain.

Notification replies use `notice-<actionId>` as the client message id. The `convex-chat` component deduplicates on `clientMessageId`, so a redelivered Android action cannot create a second message.

## Deliberate non-goals and known limitations

- **No push.** Notifications are posted by the running app. There is no FCM or APNs integration, so a stopped process hears nothing until Android starts it again, and actions other than answer/open wait for the next launch. Message notifications also only cover threads whose messages are already in memory or on disk, because the inbox query carries a preview rather than the full thread.
- **Calls are simulated.** They connect on a timer and show the local camera preview; there is no call signalling server, call audio or remote video. Group calls are disabled in the header, the profile and the `startCall` guard.
- **No OTA JavaScript updates yet.** A release is offered as a whole APK, so every update downloads the full package.
- **No end-to-end encryption.** Convex stores profiles, message text and media, and the deployment operator can read them. The local cache is not encrypted either: auth tokens and the device id live in SecureStore, but message rows and downloaded attachments do not. Treat the deployment's database and the device as trusted.
- **No signed-out password reset.** Forgetting the password loses the account and its conversations; the sign-up screen says so. A signed-in user can change the password from Settings.
- **Android-only native features.** `system-notifications` and `keyboard-media` do nothing on iOS and web, and neither exists in Expo Go; `device-scheme` falls back to React Native's `useColorScheme` where it is absent.
- **Notification actions other than answer/open do not run while JavaScript is dead**; they are queued natively.
- **Notification threads are capped at the newest 25 messages**, and the payload still uses the group name as the sender because it does not project per-message sender names.
- **Failed sends survive a restart, with a capped resume.** Unsent text and attachment rows live in the `outbox` slice with a durable copy of the bytes, and resume automatically at launch, on foreground, on reconnect and every 30 seconds, capped at three automatic attempts per message per session (reset by a reconnect). A message the server already accepted but whose echo never arrived is retried with the same client id and storage id, so the server deduplicates it and the retry returns the same sequence. A row is only dropped after that confirmed view has replaced the local bubble, so a kill in the echo window leaves a retryable row rather than a cached message without a sequence. Copies no longer referenced by a row are swept at launch or foreground once they are an hour old.
- **Thread history is capped at the newest 100 messages** in the client, with no "load older" control yet.
- **The architecture test's rules are narrow:** size, no App imports, domain purity, test registration, no `any`/`console.log`, bundled DM Sans faces declared in `StartupGate`, and images through `expo-image`. Layer boundaries between `features`, `state` and `services` are convention, as the exceptions above show.
