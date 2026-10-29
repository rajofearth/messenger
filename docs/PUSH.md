# Push wakes: Firebase Cloud Messaging

Push wakes are implemented for the Android app and wired into the device
registry. Nothing in the app posts a visible notification from a push: a wake
carries no content and only tells the phone to drain the relay queue. The
queue itself is R2 in `docs/RELAY.md`, so until it lands the only caller is a
development-gated test wake.

Checked against live docs on 2026-10-28: the Expo SDK 57 notifications
reference, the Expo push setup, sending, FCM-credentials and notification
behaviour guides, the FCM HTTP v1 send reference, the FCM error codes and
message-priority pages, and the Convex environment-variable page. Anything not
checked there is marked **unverified**.

Facts: Expo SDK 57, React Native 0.86, Android only, one arm64-v8a APK of
14,047,427 bytes (13.40 MiB), local builds through Continuous Native Generation
(`android/` is generated and gitignored), `app.config.js` wrapping `app.json`,
Convex backend, no EAS build pipeline.

## 1. Route decision

**Route A, the Expo Push Service**, would call
`Notifications.getExpoPushTokenAsync({ projectId })` and POST to
`https://exp.host/--/api/v2/push/send`. It needs an EAS project id in the APK
and the FCM service account uploaded to Expo.

**Route B, FCM HTTP v1 directly**, calls
`Notifications.getDevicePushTokenAsync()` and stores the FCM token in Convex.
An action signs as the service account and POSTs one message per token to
`https://fcm.googleapis.com/v1/projects/<project-id>/messages:send`.

Route B is implemented. It needed no Expo account or EAS project id, keeps the
service account in Convex environment variables instead of a third party, and
gets a synchronous per-token result, so a dead token is cleared in the same
run. Route A would only win if iOS arrived or if Expo's delivery telemetry
replaced ours.

## 2. What exists in Firebase

| Item | Value |
|---|---|
| Project | `messenger-e9f54` |
| Project number / FCM sender id | `827664175441` |
| Android apps | `com.yashraj.messenger`, `com.yashraj.messenger.dev` |
| APIs | Firebase Cloud Messaging API (HTTP v1) enabled, legacy Cloud Messaging disabled |
| `google-services.json` | repo root, 1,154 B, one `client` block per package |

The file holds public identifiers only: project id, sender id, app ids and the
client API key. It is committed, because the release workflow regenerates
`android/` on CI and an untracked file would produce a release APK that never
gets a token. Prebuild copies it to `android/app/google-services.json` and
applies the `com.google.gms.google-services` plugin; the Gradle plugin picks
the `client` block that matches the installed package.

The client API key should be restricted in Google Cloud to the Firebase
Installations and FCM Registration APIs, and to the two package names with the
SHA-1 of the certificate that signs each APK. That restriction is not applied
yet. A mismatch fails token retrieval with `403 PERMISSION_DENIED` and the app
silently has no push.

## 3. App configuration

`app.json` carries two additions, both inherited by the dev variant:

```json
"android": {
  "package": "com.yashraj.messenger",
  "versionCode": 8,
  "googleServicesFile": "./google-services.json"
},
"plugins": [..., "expo-notifications"]
```

- The plugin is listed without options. On Android it only writes a default
  small icon, a colour and a default channel for notifications the OS renders
  from a notification message. This app renders every notification through
  `modules/system-notifications`, which owns the channels, so the plugin's
  defaults stay unused. Never add a second channel here.
- `enableBackgroundRemoteNotifications` is iOS only. A legacy top-level
  `notification` object is not used either.
- `scripts/android.mjs` re-runs prebuild only when its marker (variant,
  package, version name, version code, feed) changes. Each dev build gets a
  timestamp version code, so a dev build always re-runs prebuild; a production
  build that only adds `googleServicesFile` needs the version code bumped or
  `android/` deleted, because the marker does not hash `app.json`.

Dependencies: `expo-notifications@~57.0.24`, `expo-task-manager@~57.0.21` and,
on the server, `google-auth-library@^11.3.1`.

## 4. Keys and secrets

| Artifact | Lives in | Secret |
|---|---|---|
| `google-services.json` | repo root, copied into `android/app/`, bundled in the APK | no |
| Client API key | that file and the APK | no, but restrict it |
| Service-account JSON | Convex environment only | **yes** |
| FCM server key (legacy) | nowhere | never created |

The development deployment `striped-finch-559` carries:

```sh
npx convex env set FCM_PROJECT_ID    messenger-e9f54
npx convex env set FCM_CLIENT_EMAIL  firebase-adminsdk-fbsvc@messenger-e9f54.iam.gserviceaccount.com
npx convex env set FCM_PRIVATE_KEY   # literal \n escapes; convex/push.ts unescapes
npx convex env set PUSH_ALLOW_TEST_WAKE 1   # development only
```

`convex/push.ts` reads them per call and calls `.replace(/\\n/g, "\n")` on the
key. Values never go in the repo, `app.json` or an `EXPO_PUBLIC_*` variable,
because those are inlined into the JS bundle. The default
`firebase-adminsdk` account works; a dedicated account with
`roles/firebase.messagingAdmin` is the tighter option. Rotating the key means
generating a new one, setting it on each deployment, and deleting the old one;
device tokens stay valid because they are registrations, not credentials.

Verified without a device: with the service-account key, minting an access
token for `https://www.googleapis.com/auth/firebase.messaging` succeeds, and a
POST with a fabricated token answers `400 INVALID_ARGUMENT`, "The registration
token is not a valid FCM registration token". That proves the key, the project
and the enabled API; only a real token can prove delivery.

## 5. Token lifecycle

Client, in `src/services/pushTokens.ts`:

- `currentPushToken()` calls `Notifications.getDevicePushTokenAsync()` and
  returns `data` when its `type` is `android`. It runs on every launch, because
  rotation events are best effort. A missing Play service or a thrown native
  error becomes `null`, never a crash.
- `watchPushToken(listener)` wraps `addPushTokenListener` for rotation.
- `releasePushToken()` calls `Notifications.unregisterForNotificationsAsync()`,
  which is the only token delete API in SDK 57 (it calls
  `FirebaseMessaging.deleteToken()`). It runs after the server row is cleared.

Server, in `convex/devices.ts`, on the existing `devices` table:

- `registerPushToken({ token, platform })` writes `pushToken`,
  `pushPlatform`, `pushUpdatedAt` and clears `pushRevokedAt`. It also clears
  the same token from any other device row, because one FCM token names one
  install and must never stay attached to a previous account. It returns
  `null` when the device row does not exist yet, which the client retries.
- `clearPushToken({})` clears the token and stamps `pushRevokedAt`.
- `tokensForUser(userId)` returns at most 20 tokens, skipping rows with a
  revoked token or device and rows whose auth session expired.
- `clearDeadToken(token)` runs when FCM says the token is gone.
- `unregister`, the sign-out mutation, clears the token and stamps the revoke
  time in the same write that revokes the device.

Sign-out order in `src/features/profile/AccountSection.tsx` is
`clearPushToken`, then `unregister`, then `signOut`, then
`releasePushToken`. The server row must be cleared while the session is still
valid, and the local token is deleted only after the session is gone; a token
deleted first could never be cleared remotely.

`src/state/usePushRegistration.ts` registers on mount after login, retries a
`null` answer twice, and re-registers on rotation.

## 6. Wake contract

FCM `data` values must be strings:

```json
{ "v": "1", "type": "wake", "queueId": "<opaque id, at most 128 chars>" }
```

Nothing else goes in: no title, body, sender, preview, count or media URL. In
particular no key named `title`, `message` or `body`, because
`expo-notifications` reads those from the data map and presents its own
notification when they exist.

The message is data-only with `android.priority: "high"` and `ttl: "60s"`. A
stale wake adds nothing, because every foreground drain reads the queue. No
channel and no `collapse_key`: a data message names no channel, and a wake is
cheap enough that coalescing is not needed at this volume.

Delivery, verified in the SDK 57 docs and the installed library source:

| App state | What arrives |
|---|---|
| Foreground | the JS task runs; `addNotificationReceivedListener` also fires |
| Background, process alive | the JS task runs; the notification listener does not |
| Swiped from recents | the JS task runs in a headless JS process |
| Force-stopped | nothing, until the user opens the app |

`src/services/backgroundWake.ts` defines the task at module scope under
`messenger-push-wake`, and `index.ts` calls `registerBackgroundWake()` before
`registerComponent`. The task receives the serialized `RemoteMessage`, so the
wake fields sit at `payload.data.data` (FCM also injects a `dataString` key
there). `parseWake` accepts that shape and the plain data-map shape, rejects
everything else, and never throws.

Force-stop is an Android limit, not a bug: a broadcast intent cannot start a
stopped package. Doze can also delay a high-priority message, so a wake is a
hint, never proof of delivery. The proof is the queue row being acked after
the phone commits it to SQLite.

## 7. Server implementation

`convex/push.ts` (`"use node"`):

- `sendWake({ tokens, queueId })` is an internal action. It mints one OAuth
  token per invocation, sends one HTTP request per token with at most 10 in
  flight, and rejects a `queueId` that is empty or longer than 128 characters,
  which the client parser would silently drop.
- `wakeUser({ userId, queueId })` is an internal action that resolves tokens
  through `tokensForUser` and sends them. It is the seam R2 calls from the
  queue insert; nothing calls it yet.
- `sendTestWake({})` is a development aid: it wakes the caller's own devices
  with `queueId: "test"` and refuses unless `PUSH_ALLOW_TEST_WAKE=1` is set on
  the deployment. Delete it once `wakeUser` has a caller.

Retry classification, per token:

| Response | Action |
|---|---|
| 2xx | sent |
| 404 `UNREGISTERED`, 400 "not a valid registration token" | clear the token, do not retry |
| 403 `SENDER_ID_MISMATCH` | clear the token; it belongs to another project |
| 429 | log and stop; FCM's documented minimum backoff is one minute, too long inside an action |
| 5xx, network error | retry up to 3 attempts, 250 ms base with exponential backoff and jitter |
| 400 without a token message, 401, 403 other | log the status and stop |

A 2xx proves only that FCM accepted the request, not that the phone got it.

The queue write schedules the wake, so a failed send cannot roll back a
message. A wake that never arrives is recovered by the next foreground drain.

## 8. APK impact

The dev APK `0.1.1-dev.20261029.094425` (version code 1793247265) is
**14,047,427 bytes (13.40 MiB)**, up **429,915 bytes (+3.2%)** from the C4b
build at 13,617,512 bytes. Headroom under the 16 MiB gate is **2,729,789
bytes**, and under the 15 MiB shipping line **1,681,213 bytes**.

The growth came in two measured steps. Adding `expo-notifications` and the
Firebase Messaging libraries took the same source to 13,942,403 bytes
(+324,891). The only new native library is
`libdatastore_shared_counter.so`, 7,112 bytes on disk and 2,630 stored; the
rest is dex for Firebase and Play Services classes. Enabling
`googleServicesFile` and adding the client push code took the build to
14,047,427 bytes (+105,024): once an app id exists, R8 can no longer remove the
Firebase initialisation path, so classes and resources it previously shrank
away are kept.

The JavaScript bundle is 2,491,180 bytes (2.38 MiB) and stored uncompressed.
The APK keeps one ABI, 19 native libraries and one dex (8.71 MiB), and passes
all 11 slim-build checks.

## 9. What is verified, and what is not

Verified in this repo or against live docs:

- The service account authenticates and the project accepts the message shape
  (section 4).
- `expo-notifications` and Firebase Messaging compile, minify and package in
  this toolchain; the release APK still passes the slim-build gate.
- Expo's own ProGuard rules keep `expo.modules.notifications.**`, and the
  `MESSAGING_EVENT` service comes from the library manifest, so there is no
  conflict with `modules/system-notifications` and nothing to add to
  `extraProguardRules`.
- Android 13 `POST_NOTIFICATIONS` gates display, not token issuance. A denied
  permission still yields a token and still runs the wake task, but the app
  cannot post anything.
- The payload parser and its rejection cases, in
  `src/services/pushPayload.test.mjs`.
- The dev deployment runs `push:sendTestWake` and stops at `AUTH_REQUIRED`
  without a session, so the action, the env gate and the token query are
  deployed.

Not verified, and impossible to verify without the phone:

- A real wake in each app state, and the recorded `push/v1/lastWake` marker.
  The marker is written but has no reader in the UI yet; R2 makes wakes visible
  end to end, because a wake will then add a row to a thread.
- Wake latency per OEM; battery managers differ.
- That R8 kept the Firebase service classes on the installed build, which the
  first real wake proves.
- The dev keystore SHA-1, if client API key restrictions are added.

## 10. Device check plan

Two phones, different accounts, A sends to B.

1. Install the dev APK, sign in, and confirm `devices` has a `pushToken` for
   that row. Nothing is shown to the user.
2. Call `api.push.sendTestWake` from a signed-in dev build and expect
   `{ sent: 1, failed: 0 }`; `failed: 1` with a 404 in the Convex log means the
   token was already dead. Foreground, background and swiped-from-recents
   should each overwrite `push/v1/lastWake`; that key has no UI yet, so R2 is
   the first place a wake becomes visible as a new message row.
3. Force-stop the app and repeat: expect no wake for at least five minutes.
   That is Android behaving as documented.
4. Deny notification permission and repeat the wake: the marker still updates,
   nothing appears, nothing crashes.
5. Sign out: the row loses its token and gains `revokedAt`; a later wake for
   that user reaches no token.
6. Uninstall or rotate: FCM answers 404 and the action clears the token.
7. In-app notifications still work, and `npm run check` plus `npm test` pass.

## 11. Deliberately out of scope

- No content in the payload, encrypted or otherwise.
- No calls over push; calls stay in-app.
- No iOS, no APNs, no background remote notifications.
- No topics, device groups or console campaigns.
- No server key or service-account JSON in the repo or the APK.
- No visible notification posted by a wake; the local renderer owns every
  notification.
