# Relay build: scope, state and next steps

This file is the living source of truth for the move from "server stores
everything" to the WhatsApp shape: server authenticates and relays, the phone
owns history, undelivered items wait in a queue for at most 30 days, and
delivered content is deleted from the server.

It is written to survive context loss. If you are picking this up cold, read this
file first, then `docs/ARCHITECTURE.md`, then
`P:\Projects\messenger-research\11-storage-reality.md` §2–§3.

Last updated: 2026-10-29.

## 1. Scope decided on 2026-10-28

In scope now:

- Relay-only messaging: the phone owns the durable copy in SQLite, Convex keeps
  auth, routing, a short delivery queue and a 30-day cap.
- Delivery acknowledgement, then server deletion.
- Push wakes through Firebase Cloud Messaging, payload with no content.
- Text plus attachments up to a **2 MiB** queued-media budget.

Explicitly out of scope for now:

- Large-file transfer. No WebRTC, no TURN, no resumable chunking, no >2 MiB
  attachments. The UI must say the file is too large instead of creating a
  pending bubble that never resolves.
- Google Drive backup and restore. Designed already in
  `11-storage-reality.md` §4, parked on purpose.
- Groups, multi-device, end-to-end encryption. The decision records in
  `Messenger relay architecture.html` §5.2 still apply; they are later phases,
  not forgotten.
- Voice and video calls.

Consequence to state plainly in the UI: until backup ships, **reinstalling or
clearing app data loses history**, because the server no longer keeps it. That is
the WhatsApp trade, not a bug. Settings must say so before the first purge runs.

## 2. Invariants

1. The phone is the durable copy. `saveMessages` is upsert-only; nothing on the
   server can erase a local row.
2. The server never stores a message body after delivery, and never longer than
   30 days.
3. Ack happens **after** the local SQLite commit, never after decryption. One
   transaction writes the message and a `pending_ack` row; sending the ack
   clears it.
4. A queue row is an envelope, not a payload. Convex caps a document at 1 MiB, so
   keep envelopes under 64 KiB and put bytes in `_storage`.
5. A push payload carries an opaque wake only: no sender, no preview, no text.
6. Large files do not create a queue entry they cannot satisfy.
7. Delete-for-me and clear-chat are durable tombstones; a stale page can never
   revive a row the user removed.

## 3. State

| Phase | What | State |
|---|---|---|
| C4 | SQLite local history, load-older, migration | **Shipped** `e9a8dc6`, dev release `dev-1793076743`, APK 13,610,208 B |
| C4b | Durability and paging fixes (outbox guard, tombstones, migration order, cached media, five paging edges) | **Shipped** `b78c42e`, dev release `dev-1793178141`, APK 13,617,512 B |
| R1a | Push wakes: FCM HTTP v1 sender, per-device token registry, data-only wake, background task, dev-gated test wake | **Implemented**, not yet verified on a phone |
| R1b | Delivery acknowledgements: `pending_ack` row, per-device watermark, drain on launch and foreground | Not started |
| R2 | Relay queue for text and small media, report-only sweeps | Not started |
| R3 | Enable 30-day + all-acked purge, with the reinstall warning | Not started |
| R4 | Groups, multi-device, end-to-end encryption | Later |
| C5 | Encrypted Drive backup | **On hold** (design ready in research §4) |

## 4. Phase detail

### C4b — durability and paging (gate for everything)

- Outbox: a failed cold read must never be persisted as an empty queue.
- Conversation delete/clear becomes a tombstone; a queued page or receipt cannot
  resurrect the chat or its rows.
- Delete-for-me becomes a durable per-message tombstone, filtered from
  `readThread`, `readOlderThread` and `hasOlderThread`.
- Migration imports chats before threads and gives an orphaned thread a real row
  before legacy keys are deleted.
- Load-older: seed `hasOlder` from the head page, key `tail` on the last id,
  unpin before a manual load, keep local rows when the network read fails, scope
  the loading flag per chat, and never treat the hidden-page budget as the end
  of history.
- Acceptance: delete a chat then let a receipt land and it stays deleted; delete
  one message, relaunch, scroll to row one and it does not return; seed only
  `messages/ghost` and migrate, the thread is reachable.

### R1a — push wakes (implemented)

- Firebase project `messenger-e9f54`, HTTP v1 enabled, both packages
  registered, `google-services.json` committed.
- Server: `convex/devices.ts` stores one token per device row
  (`pushToken`, `pushUpdatedAt`, `pushRevokedAt`, `by_pushToken`);
  `convex/push.ts` sends a data-only `{v, type, queueId}` wake and clears
  tokens FCM reports as dead.
- Client: `src/services/pushTokens.ts` (token fetch, rotation, delete),
  `src/services/pushPayload.ts` (parser), `src/services/backgroundWake.ts`
  (module-scope task) and `src/state/usePushRegistration.ts`.
- Verification still owed: a real wake on a phone in each app state. See
  `docs/PUSH.md` §10.

### R1b — acknowledgements (next)

- Drain pending threads on launch, foreground and after a wake: fetch, save to
  SQLite, then ack a per-device watermark.
- One SQLite transaction writes the message and a `pending_ack` row; sending
  the ack clears it, so a process kill between commit and ack is safe.
- No purge. This phase is safe to ship with the current server storage.

### R2 — relay queue (report-only sweeps)

- Queue row per recipient with `expiresAt`, caps, and an envelope.
- Media: one ciphertext blob plus an envelope, 2 MiB cap; larger files are
  refused with an explicit message.
- Purge sweeps run and log what they *would* delete. Nothing is deleted.
- UI states: queued, delivered, read. "Waiting for their phone" on the newest
  queued message; no clock that never resolves.

### R3 — enable deletion

- Purge when every blocking device has acked, or at 30 days, whichever is first.
- Delete the row, its refs, variants and blob in one pass; reset the inbox
  preview when the head row goes.
- Show the reinstall warning in Settings before this ships.

## 5. Firebase / push: current state

Detailed, verified steps and the wire contract live in `docs/PUSH.md`. Short
version:

1. Firebase project `messenger-e9f54`, with Android apps for
   `com.yashraj.messenger` and `com.yashraj.messenger.dev`.
2. `google-services.json` is committed at the repo root and named by
   `android.googleServicesFile` in `app.json`.
3. The FCM HTTP v1 API is enabled; the legacy server key was never created.
4. `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` and the
   development-only `PUSH_ALLOW_TEST_WAKE` are set on the dev Convex
   deployment. They exist nowhere else.
5. `expo-notifications`, `expo-task-manager` and `google-auth-library` are
   installed; the measured APK impact is in `docs/PUSH.md` §8.

The `google-services.json` client API key is not a secret, but it should be
restricted to the two Android packages and the FCM APIs. The service-account
private key is a secret: it can send pushes to every install.

## 6. Open decisions still owed

1. **Keys:** per-device X25519 + per-message data key, TOFU with a safety number,
   one live device in v1. Needed before real E2E, not before R1.
2. **Caps:** 2 MiB queued media, 200 entries / 10 MiB per recipient, per-sender
   daily limits, `QUEUE_FULL` with a last-seen time.
3. **Deletion without backup:** accepted for now, but the warning must ship with
   R3 and the option to keep the server copy for 30 days must stay honest.
4. **Groups:** one ciphertext, per-member key envelopes, one queue row per group
   message plus per-member acks, rotate on removal.
5. **Multi-device:** one history owner in v1; a second device starts empty.

## 7. Verification

- `npm run check` and `npm test` before any commit. New tests must be registered
  in the `test` script or the architecture test fails.
- `npm run android:build` then `npm run release:check` for any APK-affecting
  change; the gate fails on a bigger-than-16-MiB APK, a second ABI, the barcode
  library, a compressed bundle, or a version mismatch.
- Dev delivery: `npm run dev:ship -- --notes "..."`, then confirm the GitHub
  prerelease, the APK digest, and
  `GET <dev-feed>/updates/manifest?versionCode=0`.
- No production tag without explicit approval.

## 8. Landmarks

- Local database: `src/data/sqlite/` (`schema.ts`, `messages.ts`, `chats.ts`,
  `migrate.ts`, `repository.ts`, `media.ts`).
- Repository facade: `src/data/messengerRepository.ts`.
- Paging: `src/state/threadPaging.ts`, `loadOlderThread.ts`, `useThreadPaging.ts`.
- Writers and delete call sites: `src/state/remoteMessengerWriters.ts`,
  `remoteMessengerPreferences.ts`, `useRemoteThreadMedia.ts`.
- Outbox: `src/services/outbox.ts`, `src/data/sqlite/outbox.ts`,
  `src/state/useOutboxResume.ts`.
- Server: `convex/chat.ts`, `convex/files.ts`, `convex/schema.ts`,
  `convex/stories.ts`, `convex/crons.ts`, `convex/lib/paging.ts`.
- Push: `convex/push.ts`, `convex/devices.ts`, `src/services/pushTokens.ts`,
  `src/services/pushPayload.ts`, `src/services/backgroundWake.ts`,
  `src/state/usePushRegistration.ts`, `docs/PUSH.md`.
- Reviews and decisions: `P:\Projects\messenger-research\11-storage-reality.md`,
  `plan.html`, and `P:\Projects\messenger\Messenger relay architecture.html`.
