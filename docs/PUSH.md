# Push wakes: Firebase Cloud Messaging plan

Plan only. Nothing here is implemented and no dependency is installed. The app has no push today: `docs/ARCHITECTURE.md` states there is no FCM or APNs integration, and notifications are posted only while the app runs, through `src/services/systemNotifications.ts`. This is the verified next step for relay phase R1 in `docs/RELAY.md`.

Checked against live docs on 2026-10-28: the Expo SDK 57 notifications reference, the Expo push setup / sending / FCM-credentials / notification-behaviour guides, FCM HTTP v1 send, FCM error codes, the FCM `AndroidConfigV2` preview, and the Convex environment-variable page. Anything not checked there is marked **unverified**.

Facts assumed: Expo SDK 57, React Native 0.86, one arm64-v8a APK of **13,617,512 B** (**3,159,704 B** under the 16 MiB gate), local builds through Continuous Native Generation (`android/` is generated and gitignored), `app.config.js` wrapping `app.json`, Convex backend, no EAS build pipeline.

## 1. Two routes, one recommendation

**Route A — Expo Push Service.** The app calls `Notifications.getExpoPushTokenAsync({ projectId })`; the server POSTs to `https://exp.host/--/api/v2/push/send`. It needs an Expo account and an EAS project id (the token is attributed to it; `eas init` creates one without an EAS build), and Expo needs the FCM V1 service-account JSON uploaded to that project's Android credentials, because Expo delivers to Android through FCM.

**Route B — FCM HTTP v1 directly.** The app calls `Notifications.getDevicePushTokenAsync()` and registers the FCM token in Convex; an action signs a JWT as the service account and POSTs one message per token to `https://fcm.googleapis.com/v1/projects/<project-id>/messages:send`.

- **Builds and identity**: A needs an EAS project id in the APK and a credential upload to Expo; B needs nothing outside Firebase and Convex.
- **Credential custody**: A hands the service account to Expo; B keeps it in Convex environment variables. Route A does not remove FCM, it moves the key.
- **Wake path**: A adds a hop and a third party (100 messages per request, 600 notifications/second per project, no SLA, receipts arrive about 15 minutes later and are cleared after 24 hours). B gets a synchronous per-token result.
- **Server work**: A must track tickets and receipts to learn about dead tokens; B can clear a `devices` row inside the same action on a 404.
- **APK size**: identical. Both routes need `expo-notifications` and the same Firebase Messaging dependency; neither puts a key in the APK.

**Recommendation: Route B.** The repo already owns its native modules and its Convex deployment, so the new pieces are a signed JWT and an HTTP POST. It keeps the sender key out of a third party, avoids an Expo project identifier in the APK, and turns FCM errors into immediate token cleanup. Route A would win if iOS arrived or if Expo's delivery telemetry replaced ours.

## 2. Firebase console steps

1. <https://console.firebase.google.com> → **Create a project** (or pick one). Skip Google Analytics; nothing in the APK uses it.
2. **Project settings** (gear) → **General** → **Your apps** → **Add app** → Android. Package `com.yashraj.messenger`, nickname `Messenger`, leave **Debug signing certificate SHA-1** empty. SHA-1 is only needed for Google Sign-In, Phone Auth, App Check/Play Integrity and Dynamic Links, none of which this app uses (identity is `@convex-dev/auth`). **Register app**.
3. Add a second Android app for `com.yashraj.messenger.dev`, the package `app.config.js` gives the dev variant. Without its own entry the dev APK fails Firebase Installations and gets no token.
4. **Download google-services.json**. It holds one `client` entry per Android app in the project, so one download serves both packages; the Gradle google-services plugin selects the client by installed package name.
5. Put it at the repo root as `google-services.json`; `app.json` points at it with `android.googleServicesFile` (section 3). Commit it: it holds public identifiers, and `.github/workflows/release.yml` regenerates `android/` and builds on CI, so an untracked file means a CI release without FCM.
6. Fields that matter: `project_info.project_number` is the FCM sender id (a token is bound to its sender; the wrong one is `SENDER_ID_MISMATCH` or Expo's `MismatchSenderId`); `client[].client_info.android_client_info.package_name` must equal the installed package; `client[].api_key[].current_key` lets the app call Firebase Installations and FCM registration — not a secret because it ships in every APK, but it should be restricted (section 4). `mobilesdk_app_id`, `project_id`, `storage_bucket`, `client_type` and `certificate_hash` need no attention, and the file contains no private key.
7. Google Cloud console → **APIs & Services**: enable **Firebase Cloud Messaging API** (usually on already) and **Firebase Installations API**. Leave the legacy **Cloud Messaging API (Legacy)** off; nothing here uses a server key.
8. **Project settings** → **Service accounts** → **Generate new private key**. A dedicated account with `roles/firebase.messagingAdmin` (Firebase Cloud Messaging API Admin) is enough; the default `firebase-adminsdk` account carries broader roles. Keep the JSON out of the repo.
9. One Firebase project for production and dev is enough for R1. A separate dev project would isolate dev tokens and quota, at the cost of a second file and a second env set.

## 3. App configuration for CNG

Install `expo-notifications` with `npx expo install expo-notifications`, plus `expo-task-manager` only if R1 runs JavaScript while the app is not running. Both variants inherit this from `app.json`; `app.config.js` changes only identity and feed for `APP_VARIANT=dev`, so the edit belongs in `app.json`.

```json
"android": {
  "package": "com.yashraj.messenger",
  "googleServicesFile": "./google-services.json"
},
"plugins": [
  ["expo-notifications", {
    "icon": "./assets/notification-icon.png",
    "color": "#E6F4FE",
    "defaultChannel": "system_messages_v1"
  }]
]
```

- `icon` is the Android small icon: 96×96, all white with transparency. `defaultChannel` is used only if a notification message (title/body) ever arrives; point it at the channel the Kotlin module already creates (`NotificationRenderer.channels` → `system_messages_v1`) so Android does not gain a second "Messages" channel. A data-only wake names no channel.
- `enableBackgroundRemoteNotifications` exists in SDK 57 but is **iOS only** (`UIBackgroundModes`); there is no Android equivalent, so do not add it. Do not add a legacy top-level `notification` object either; the SDK 57 plugin owns icon and colour.
- `googleServicesFile` makes prebuild copy the file into the generated `android/app/` project and apply the google-services Gradle plugin. Regenerate with `npm run android:prebuild` or `npm run android:build`; never hand-edit `android/`.
- Android 13+ `POST_NOTIFICATIONS` is already requested by `requestPermission()` in `src/services/systemNotifications.ts`; keep that one prompt path. Expo requires a channel to exist before the system prompt appears, so call the native `getStatus()` (which creates channels) before `getDevicePushTokenAsync()`. `expo-notifications` adds `RECEIVE_BOOT_COMPLETED` through its own manifest.
- Expo Go is not a test target: remote push has been unavailable there on Android since SDK 53, so this needs a development/native build. The docs also allow an emulator with Google Play services, but test on a physical phone: the notification module is Android-only and OEM battery policy is part of what is being tested. `expo-device` is not needed for this — the old `Device.isDevice` guard predates the documented emulator support, and the real gate is a native build plus Play services. A de-Googled phone gets no token at all.

## 4. Keys and secrets

| Artifact | Lives in | Secret? | If leaked |
|---|---|---|---|
| `google-services.json` | repo root, copied into `android/app/` at prebuild, bundled in the APK | No | Calls as this app; no install compromise |
| Client API key (`api_key[].current_key`) | that file and the APK | No, but restrict | Quota abuse; rotate in Google Cloud console |
| FCM server key (legacy) | nowhere | Never create it | — |
| Service-account JSON (`project_id`, `client_email`, `private_key`) | Convex environment only | **Yes** | Can push to every install of the app |

Client API key restrictions: **API restrictions** → Firebase Installations API and FCM Registration API. **Application restrictions** → Android apps, with each package name and the SHA-1 of the certificate that actually signs the APK: the production release keystore (CI secret `ANDROID_KEYSTORE_BASE64`) and the dev key in `artifacts/messenger-dev-debug.keystore`. A mismatch yields `403 PERMISSION_DENIED: Requests from this Android client application are blocked` and the app never receives a token (documented by Expo).

Server secrets live in Convex, per deployment, because dev and prod are separate:

```sh
npx convex env set FCM_PROJECT_ID    <project-id>
npx convex env set FCM_CLIENT_EMAIL  <client_email from the JSON>
npx convex env set FCM_PRIVATE_KEY   "<private_key with real newlines>"
npx convex env list --names-only
```

Names match `docs/RELAY.md` §5; each value may be up to 8 KiB. Never put them in the repo, in `app.json`, or in an `EXPO_PUBLIC_*` variable, because those are inlined into the JS bundle. If the private key leaks, delete that key in Google Cloud, generate a new one, and set it on both deployments; existing device tokens stay valid because they are registrations, not credentials.

## 5. Token lifecycle

- **Obtain**: `Notifications.getDevicePushTokenAsync()` after a channel exists and permission has been requested. On Android it resolves to `{ type: "android", data: "<FCM registration token>" }`.
- **Register**: an authenticated mutation upserts the existing `devices` row through `by_user_device` (see `convex/devices.ts`), adding optional `fcmToken` and `fcmTokenUpdatedAt` alongside `platform`, `lastSeenAt` and `revokedAt`. That is `(userId, deviceId, platform, token, lastSeenAt, revokedAt)` mapped onto a table that already has one row per (user, device). A separate `pushTokens` table is only worth it if a token must outlive a revoked session, which R1 does not need.
- **Refresh**: `Notifications.addPushTokenListener(register)`. A rolled token makes the old one invalid, and sends to it fail.
- **Delete**: on sign-out clear `fcmToken` and set `revokedAt` (the existing revoke path already runs then); on `UNREGISTERED` (404) or `INVALID_ARGUMENT` ("not a valid FCM registration token") clear the column and never retry that token. Uninstalls cannot notify us; the first 404 is the signal.
- **Multiple devices**: one row per (user, device) already exists; iterate `by_user` and send one wake per live token. Nothing is per-conversation.

## 6. Relay wake-up contract

FCM `data` values must be strings, so the wire payload is:

```json
{ "v": "1", "type": "wake", "queueId": "<opaque id>" }
```

- `conversationId` is optional and only acceptable as an already-opaque id; it tells Google which conversation is busy. `docs/RELAY.md` R1 defines `{type:"wake", queueId}`; `v` is added so the shape can change later. Nothing else goes in: no title, body, sender, preview, count or media URL. The app wakes, fetches, saves to SQLite, then acks.
- **Data-only, not a notification message.** A notification message would be rendered by the OS with content we do not have, on a channel we do not control; MessagingStyle, mute state and local avatars live in the native module, so rendering must stay local.
- **Channel and priority are different things.** Data messages carry no channel; `channelId` applies only to notification messages, and our posted notification uses `system_messages_v1` from the native module. Promptness comes from `message.android.priority: "high"`. Keep `ttl` short, e.g. `"60s"`: a stale wake adds nothing because every foreground drains the queue.
- **Force-stopped** (`Settings → Apps → Messenger → Force stop`, or `adb shell am force-stop com.yashraj.messenger`): **nothing arrives** — no data message, task or notification — until the user opens the app. Android blocks the package. State this in release notes and never imply otherwise. Swiping from recents is not force-stop and still receives wakes. Doze can delay even high-priority data, so a wake is never delivery proof.
- **Retry**: 429 `QUOTA_EXCEEDED` → exponential backoff with a minimum initial delay of one minute (FCM's guidance); 503 `UNAVAILABLE` → honour `Retry-After`, then backoff with jitter; 500 `INTERNAL` → retry with backoff; 400/401/403 → fix the request or credentials, do not retry. Coalesce with `collapse_key` and rate-limit per device, because too many high-priority messages get deprioritised.
- **FCM accepting a request proves nothing.** A 200 returns only a message name. The only delivery evidence is the queue row being acked after the client saves it.

## 7. Convex implementation sketch

Sketch, not code to merge. Server dependency: `google-auth-library`, which mints and refreshes the OAuth token for `https://www.googleapis.com/auth/firebase.messaging`; the Firebase Admin SDK would work but is far larger than one endpoint needs. Signing the JWT with Web Crypto instead is possible but **unverified** on Convex's default runtime.

```ts
// convex/push.ts — SKETCH, not implemented
"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { GoogleAuth } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

async function accessToken() {
  const auth = new GoogleAuth({
    credentials: {
      project_id: process.env.FCM_PROJECT_ID,
      client_email: process.env.FCM_CLIENT_EMAIL,
      private_key: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [SCOPE],
  });
  return (await auth.getClient()).getAccessToken();
}

export const sendWake = internalAction({
  args: { tokens: v.array(v.string()), queueId: v.string() },
  handler: async (ctx, { tokens, queueId }) => {
    const projectId = process.env.FCM_PROJECT_ID!;
    const { token } = await accessToken();
    const body = (device: string) =>
      JSON.stringify({
        message: {
          token: device,
          data: { v: "1", type: "wake", queueId },
          android: { priority: "high", ttl: "60s", collapse_key: "wake" },
        },
      });
    // HTTP v1 takes ONE message per request; 500 is only the Admin SDK cap.
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      for (let j = 0; j < batch.length; j += 10) {
        await Promise.all(batch.slice(j, j + 10).map(async (device) => {
          const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
              },
              body: body(device),
            },
          );
          if (res.ok) return;
          if ((await res.text()).includes("registration token")) {
            await ctx.runMutation(internal.push.clearToken, { token: device });
          }
          // 429 / 5xx: retry policy in section 6.
        }));
      }
    }
  },
});
```

- The mutation that inserts a queue row schedules `internal.push.sendWake` with the recipient's live tokens, so a send failure cannot roll back the message. A wake is a hint; the next foreground drain recovers anything missed.
- Mint the access token per batch and do not cache it in module scope, because Convex isolates are not durable. The 500 above is the Admin SDK's `sendEach` cap, quoted only as a batch size: the REST endpoint has no multi-token request.

## 8. Cost and APK impact

- FCM has no charge, data messages included. Convex actions count against deployment usage: one action per recipient batch.
- Client cost is `expo-notifications` plus the Firebase Messaging and Play Services libraries it pulls, their dex, and google-services resources. **Growth is unknown until measured**; no byte number is claimed here.
- Budget: 16,777,216 B − 13,617,512 B = **3,159,704 B (3.01 MiB)**. Record the real delta in `docs/PERFORMANCE.md`, and in `CHANGELOG.md` for a release change. Measure with `npm run android:build` then `npm run release:check`; R8 and resource shrinking are on, so also confirm on a release install that a token is issued, because a stripped `FirebaseMessagingService` fails silently.

## 9. Test plan

Two physical Android phones, different accounts, A sends to B.

1. **Registration**: fresh install → a token appears in the dev log and `devices` has `fcmToken` for that row; nothing is shown to the user.
2. **Killed (swiped from recents)**: insert a queue row from A. Expect a wake in seconds; measure insert time → headless task start. The message appears, the ack lands, the queue row is gone.
3. **Force-stopped**: `Settings → Apps → Messenger → Force stop` (or `adb shell am force-stop com.yashraj.messenger`), insert a queue row. Expect **no** wake, task or notification for at least five minutes; open the app by hand and confirm the launch drain fetches it. That is Android behaving as documented, not a bug.
4. **No content**: capture the request body in Convex logs and the received data on device; confirm exactly `v`, `type`, `queueId` plus FCM internals — no text, sender or preview.
5. **Permission**: Android 13+ install, deny `POST_NOTIFICATIONS`, send a wake: no visible notification and no crash; grant it and repeat for exactly one notification from `system_messages_v1`.
6. **Sign-out**: the `devices` row loses `fcmToken` and gains `revokedAt`; a new queue row for that user sends nothing to that token.
7. **Dead token**: uninstall on B, send, and expect a 404 `UNREGISTERED` in the action log with the token cleared.
8. **Regression**: in-app notifications still work; `npm run check` and `npm test` pass.

## 10. What we deliberately do not do

- No content in the payload: no previews, sender names, counts or media URLs, and no message bodies through FCM, encrypted or otherwise.
- No calls over push: no call wake, no push-delivered notification actions. Calls stay in-app.
- No iOS; the app is Android-only, so APNs and background remote notifications stay out.
- No topics, no device groups (deprecated by FCM), no console campaigns.
- No server key or service-account JSON in the repo or the APK, and no push secret in any `EXPO_PUBLIC_*` variable.

## Unverified

- APK growth from `expo-notifications` plus Firebase Messaging.
- Signing the FCM JWT without `google-auth-library` on Convex's default runtime.
- Wake latency per OEM: battery managers differ and are only measurable on the test devices.
- The dev keystore SHA-1 (`artifacts/messenger-dev-debug.keystore`) if app restrictions are used; read it with `keytool -list -v` before restricting.
