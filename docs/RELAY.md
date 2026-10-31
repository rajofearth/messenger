# Relay build: scope, state and remaining gaps

This file records the move from "server stores everything" to the WhatsApp
shape: the server authenticates and relays, the phone owns history, undelivered
items wait in a queue for at most 30 days, and delivered content is deleted from
the server. The move is complete; the component and its fallback paths are gone.

Read `docs/ARCHITECTURE.md` next for how the pieces fit. The storage review is
in `P:\Projects\messenger-research\11-storage-reality.md` §2–§3.

Last updated: 2026-10-29.

## 1. Scope

In scope and shipped:

- Relay-only messaging: SQLite on the phone is the durable copy; Convex keeps
  auth, routing, a delivery queue and a 30-day cap.
- Delivery acknowledgement, then server deletion of the queue row and blob.
- FCM push wakes with an opaque payload and no content.
- Text plus attachments up to a **2 MiB** queued-media budget.
- Reactions, delete-for-everyone, forwarding, clear-chat and delete-for-me
  against the local-history model.

Out of scope for now:

- Large-file transfer. No WebRTC, TURN, resumable chunking or >2 MiB
  attachments. The composer refuses an oversized file instead of creating a
  bubble that can never resolve.
- Google Drive backup and restore. Designed in `11-storage-reality.md` §4,
  parked on purpose.
- Groups beyond creation, multi-device, end-to-end encryption. Later phases.
- Voice and video calls.

The trade is stated in the UI: until backup ships, **reinstalling or clearing
app data loses history**, because the server no longer keeps it. Settings says so
next to the account section.

## 2. Invariants

1. The phone is the durable copy. `saveMessages` is upsert-only; nothing on the
   server can erase a local row.
2. The server never stores a message body after delivery, and never longer than
   30 days.
3. Ack happens **after** the local SQLite commit. One transaction writes the
   message and a `pending_ack` row; sending the ack clears it.
4. A queue row is an envelope, not a payload. Convex caps a document at 1 MiB, so
   envelopes stay under 64 KiB and bytes live in `_storage`.
5. A push payload carries an opaque wake only: no sender, no preview, no text.
6. Large files do not create a queue entry they cannot satisfy.
7. Delete-for-me and clear-chat are durable local tombstones; a stale relay row
   can never revive a row the user removed.
8. There is one message path. No component fallback, no server history and no
   migration from the old cache.

## 3. Phases

| Phase | What | State |
|---|---|---|
| C4 | SQLite local history, load-older, one-time AsyncStorage import | Shipped `e9a8dc6`, dev release `dev-1793076743`, APK 13,610,208 B |
| C4b | Durability and paging fixes (outbox guard, tombstones, cached media) | Shipped `b78c42e`, dev release `dev-1793178141`, APK 13,617,512 B |
| R1a | Push wakes: FCM HTTP v1 sender, per-device token registry, data-only wake, background task | Shipped, real wake verified server-side |
| R1b | Delivery acknowledgements: `pending_ack` in the same transaction, drain on launch, foreground and a visible-app timer | Shipped |
| R2 | Relay queue for text and small media: `relayQueue`, send/react/remove, pull, caps, per-conversation sequence | Shipped `e84f1b5`, dev release `dev-1793251060`, APK 14,074,187 B |
| R3 | Deletion: ack deletes the row and releases the blob, 30-day purge, reinstall warning | Shipped in R2 |
| Cleanup | Component, legacy import, migrations, server paging, presence, typing and read receipts removed | Shipped `072c890`, dev release `dev-1793337177`, APK 14,043,551 B |
| R4 | Groups beyond creation, multi-device, end-to-end encryption | Later |
| C5 | Encrypted Drive backup | On hold (design ready in research §4) |

## 4. How a message moves

1. The composer writes the message row and an `outbox` entry. An attachment is
   copied into app documents first and finalized into `_storage`.
2. `relay.send` checks membership and blocking, allocates the next
   `conversations.nextSequence`, writes one `relayQueue` row per other member,
   schedules a push wake per recipient, and returns the sender's own view.
3. A recipient's `relayDrain` pulls up to a page of envelopes. It downloads any
   attachment, commits the messages and `pending_ack` rows in one transaction,
   then calls `relay.ack`.
4. `ack` deletes the recipient's queue row. When no row references the
   attachment, the `files` row, its variants and the `_storage` blob go too.
5. `relay.purgeExpired` deletes rows past `expiresAt` in batches of 200 and
   schedules another sweep while a batch is full. The daily cron runs at 03:47
   UTC.

Caps: 200 rows and 10 MiB of queued attachments per recipient, 2 MiB per
attachment, 8000 characters per text. A full queue answers `QUEUE_FULL` with the
recipient's last-seen time. A retry that reuses `clientMessageId` returns the
existing row instead of spending a second sequence.

## 5. Cleanup record

Removed in the 2026-10-29 creation-mode pass:

- `convex/chat.ts`, `convex/convex.config.ts`, `convex/lib/paging.ts`,
  `convex/lib/retention.ts` and the `convex-chat` dependency.
- `messageRefs` and `messageDeletes`; `conversations` and
  `conversationMembers` replace `conversationMeta`.
- `src/data/sqlite/migrate.ts`, `snapshots.ts`, the migration tests and the
  legacy AsyncStorage import. SQLite has one schema version and resets on a
  mismatch.
- Non-local paging: `threadPaging.ts`, `loadOlderThread.ts` and their tests.
  `useThreadPaging` now reads SQLite only.
- Presence, typing and read receipts: `useRemotePresence.ts`, their UI and
  their server support.
- Server paging, thread media downloads and the inbox/thread snapshot writes.
  `conversationSync.ts` now merges conversation metadata only.

The development Convex deployment was wiped to match: all relays, conversations,
files, stories and telemetry were deleted, storage blobs were removed, and only
accounts, profiles, devices and the release history were kept. Deployments
without users have nothing to migrate; existing phones reset their local database
on first launch because `PRAGMA user_version` no longer matches.

## 6. Known gaps

1. A killed app cannot drain or notify. The headless task has no Convex auth
   session, so a wake records itself and delivery waits for the app to open; the
   notification is posted by the running app in the same pass, which means a
   swiped-away Messenger shows nothing until it is opened again. Wakes cut
   latency only while the app is alive. The fix needs a headless drain that can
   refresh the Convex session without a UI, which is a separate design pass.
2. One history device per account. A second device starts empty.
3. An op that arrives before its target message is applied once and not retried.
4. Groups are create-only: no add, remove, leave or rename.
5. Forwarding re-uploads the local file because the relay keeps no server copy;
   the 2 MiB cap applies again.
6. There is no backup. Reinstall or Clear data loses history until C5.
7. FCM credentials exist only on the development deployment; a production
   deployment needs its own before push works there.

## 7. Firebase / push

Detailed, verified steps and the wire contract live in `docs/PUSH.md`.

1. Firebase project `messenger-e9f54`, with Android apps for
   `com.yashraj.messenger` and `com.yashraj.messenger.dev`.
2. `google-services.json` is committed at the repo root and named by
   `android.googleServicesFile` in `app.json`.
3. The FCM HTTP v1 API is enabled; the legacy server key was never created.
4. `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` and the
   development-only `PUSH_ALLOW_TEST_WAKE` are set on the dev Convex
   deployment.
5. Server: `convex/devices.ts` stores one token per device row; `convex/push.ts`
   sends a data-only `{v, type, queueId}` wake and clears tokens FCM reports as
   dead. Client: `src/services/pushTokens.ts`, `pushPayload.ts`,
   `backgroundWake.ts` and `src/state/usePushRegistration.ts`.

The `google-services.json` client API key is not a secret, but it should be
restricted to the two Android packages and the FCM APIs. The service-account
private key is a secret: it can send pushes to every install.

## 8. Verification

- `npm run check` and `npm test` before any commit. New tests must be registered
  in the `test` script or the architecture test fails.
- `npm run android:build` then `npm run release:check` for any APK-affecting
  change; the gate fails on a bigger-than-16-MiB APK, a second ABI, the barcode
  library, a compressed bundle, or a version mismatch.
- Dev delivery: `npm run dev:ship -- --notes "..."`, then confirm the GitHub
  prerelease, the APK digest, and
  `GET <dev-feed>/updates/manifest?versionCode=0`.
- A relay round trip needs two accounts: send from one, confirm the second phone
  shows the row only after its drain, and that `relayQueue` is empty for that
  recipient afterwards.
- No production tag without explicit approval.

## 9. Landmarks

- Local database: `src/data/sqlite/` (`schema.ts`, `messages.ts`, `chats.ts`,
  `relay.ts`, `repository.ts`, `media.ts`).
- Repository facade: `src/data/messengerRepository.ts`.
- Local paging: `src/state/useThreadPaging.ts`.
- Conversation merge: `src/state/conversationSync.ts`.
- Writers and delete call sites: `src/state/remoteMessengerWriters.ts`,
  `remoteMessengerPreferences.ts`, `remoteMessengerMessageActions.ts`.
- Outbox: `src/services/outbox.ts`, `src/data/sqlite/outbox.ts`,
  `src/state/useOutboxResume.ts`.
- Server: `convex/conversations.ts`, `convex/relay.ts`, `convex/lib/relayStore.ts`,
  `convex/files.ts`, `convex/schema.ts`, `convex/stories.ts`, `convex/crons.ts`.
- Drain: `src/services/relayDrain.ts`, `src/state/useRelayDrain.ts`,
  `src/data/sqlite/relay.ts`, `src/services/relayConfig.ts`.
- Push: `convex/push.ts`, `convex/devices.ts`, `src/services/pushTokens.ts`,
  `src/services/pushPayload.ts`, `src/services/backgroundWake.ts`,
  `src/state/usePushRegistration.ts`, `docs/PUSH.md`.
- Reviews and decisions: `P:\Projects\messenger-research\11-storage-reality.md`,
  `plan.html`, and `P:\Projects\messenger\Messenger relay architecture.html`.
