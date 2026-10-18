# System notifications

Android-only local Expo module. Public TypeScript entry point is `src/services/systemNotifications.ts`. Rebuild the native app after adding the module. Expo's default local `modules/` discovery registers it; no config plugin or app.json changes are needed. Not supported in Expo Go, iOS, or web. Check `isSystemNotificationsAvailable` before use on shared screens. Unsupported calls throw instead of reporting fake success.

## Parent API contract

Named functions and the `systemNotifications` object expose the same API:

| Function | Contract |
| --- | --- |
| `requestPermission()` | Foreground Android 13+ POST_NOTIFICATIONS request, then returns status. Call from a user gesture after an explanation. |
| `getStatus()` | Creates channels idempotently and returns permissionGranted, notificationsEnabled, and enabled channel flags. |
| `openSettings(channel?)` | Opens app notification settings or incoming/calls/messages channel settings. |
| `showCall(call)` | Upserts by callId. Returns `{ posted: true }` or `{ posted: false, reason }`. |
| `dismissCall(callId)` | Removes native notification/state. Does not hang up the engine. |
| `showMessage(snapshot)` | Upserts by conversationId. Returns the same post result, including conversationMuted. |
| `dismissConversation(id)` | Removes native notification/state. Does not mark messages read on a server. |
| `setConversationMuted(id, muted)` | Persists local suppression, and dismisses when muting. Parent must also update its own preference. |
| `subscribeToActions(listener)` | Live events. Returns `{ remove() }`. Subscribe before loading the snapshot. |
| `getPendingActions()` | Non-destructive durable queue snapshot in creation order. |
| `acknowledgeActions(ids)` | Removes only named actions after durable parent handling. |

Invalid input, storage failures, and native posting errors reject promises. Permission/channel/mute suppression returns a post result instead of throwing. Channel flags describe channel settings independently of app-wide permission.

### Call payload

`CallNotification` requires `callId`, `person: { id, name, avatarUri? }`, and `state: 'incoming' | 'outgoing' | 'ongoing'`.

Optional fields are `video`, `connectedAt`, `muted`, `speaker`, `allowMute`, `allowSpeaker`, and `timeoutMs`. Ongoing calls require a positive Unix-millisecond `connectedAt`, no later than now. The Android chronometer displays connected duration without JS timers. Outgoing calls use the ongoing CallStyle template with hangup, but no duration until connected. Android has no separate outgoing CallStyle template. Incoming notifications expire after 60 seconds by default; timeoutMs accepts 1,000 to 300,000 milliseconds. Call showCall again only for a genuine update, not on a timer. Updating an incoming call restarts its expiry.

Mute/speaker buttons are opt-in and use confirmed payload state to choose their next requested value. CallStyle and OEM UI determine whether extra buttons are visible. Native does not alter microphone or audio routing. Parent must apply the requested state to the actual engine and publish confirmed state with showCall. Call IDs must identify a call session, not a contact. Dismiss on termination, disconnect, remote cancellation, or rejected setup. Reconcile engine state on startup; this module cannot know if a call survived process death.

### Message payload

`MessageNotification` requires `conversationId`, `self: NotificationPerson`, and an oldest-first `messages` snapshot. Each message has `text`, Unix-millisecond `timestamp`, and optional `sender: NotificationPerson`. Omit sender for self. Optional `isGroup` and `title` identify group conversations. Optional `silent` posts on the silent channel when the app's sound preference is off. Provide 1 to 100 messages; native stores/renders only the last 25. Text accepts 1 to 8,000 characters. IDs/names accept 1 to 256 characters, nonblank.

Avatars accept local `file://` and `content://` URIs. Image decoding is sampled to a thumbnail. Missing/inaccessible avatars fall back to names. No remote image downloads occur. The caller must retain local file/URI access for subsequent notification updates.

## Action delivery

Every action has a UUID `id`, Unix-millisecond `createdAt`, and a discriminated `type`:

| Types | Additional fields | Native behavior |
| --- | --- | --- |
| answer, openCall | callId | Persist and directly launch app through a private activity. |
| decline, hangup | callId | Persist and dismiss notification. Does not stop the engine. |
| setMuted, setSpeaker | callId, value: boolean | Persist a target-state request; no optimistic engine/audio mutation. |
| openConversation | conversationId | Persist and directly launch app. |
| reply | conversationId, text | Persist RemoteInput text and refresh notification as queued, not sent. |
| read | conversationId | Persist and dismiss; parent must update read state. |
| muteConversation | conversationId | Persist action, suppress future native notifications, dismiss. |

Native commits actions before emitting live events or exiting the receiver. Subscribe FIRST, then fetch pending actions. Events and snapshot may overlap. Serialize handling and deduplicate by action.id. Use that ID as a message transport idempotency key. Acknowledge only after saving work durably or completing it idempotently. A crash between handling and acknowledgement causes redelivery. Separate taps are separate action IDs. Validate call liveness and user authorization in the parent even when native accepted the action.

Answer and notification taps open the app using activity PendingIntents, not prohibited receiver/service notification trampolines. Other buttons never force-open an activity. If JS is dead, they queue until the app next runs. This is NOT background message transmission or guaranteed immediate engine control. The parent needs a native calling engine action handler if hangup/mute must execute when JS is unavailable. No headless JS task is registered here.

PendingIntent identity includes action, target, notification generation, and toggle value. Only RemoteInput uses mutable PendingIntents, with an explicit private receiver. Dismissal and call state changes invalidate old action generations. Incoming actions are rejected after timeout. Acknowledgements do not clear message/call presentation state; use dismiss APIs for that.

## Permissions and platform boundaries

The module manifest declares only POST_NOTIFICATIONS. All notifications respect app/channel settings; this module does not claim the self-managed Telecom permission exemption. Channels are incoming calls with HIGH importance, active calls with LOW importance, messages with HIGH importance, and silent messages: a HIGH-importance channel whose sound is explicitly cleared. Android fixes a channel's sound at creation, so the silent twin exists only to honour the app's message-sound preference after the loud channel has already been created. Android users own channel settings after creation. The module cannot override DND, guarantee heads-up display, or force lock-screen visibility. Content uses PRIVATE visibility.

No foreground service is needed to post/update notifications or render the system chronometer. This module does not keep a network connection, JS runtime, microphone, or call alive. It therefore does not declare an unused phoneCall/microphone foreground service or request MANAGE_OWN_CALLS. The parent calling implementation must separately satisfy Android Telecom, foreground-service type, audio permission, and background-start rules when it actually handles calls. Pre-Android-12 CallStyle uses AndroidX fallback rendering and lacks the higher ranking provided by a foreground service. There is no full-screen incoming activity or USE_FULL_SCREEN_INTENT permission.

This module is local presentation and action delivery only. It does not receive remote push, wake for remote messages/calls, register a push token, reconnect signaling, or bypass force-stop. Existing system notifications may deliver PendingIntents after ordinary process death. Force-stop, reboot, app uninstall, or OS policy can remove notifications or prevent delivery. The parent owns push/signaling, message sending/read receipts, call lifecycle, retry policy, and navigation.

Pending actions, message snapshots, and mute state live in app-private SharedPreferences. They are not encrypted and may be included by the parent's backup policy. Do not place credentials in payloads. Acknowledge processed actions promptly and dismiss obsolete notifications to remove stored snapshots. Pending actions are not silently evicted. On account switch/logout, the parent must drain/discard pending actions, dismiss its known call/conversation IDs, and clear native conversation mute preferences as appropriate.

## Validation

Focused Kotlin compilation: `gradlew.bat :system-notifications:compileDebugKotlin --console=plain --max-workers=2` from android. TypeScript: `npm run typecheck`. Expo autolinking must list system-notifications and expo.modules.systemnotifications.SystemNotificationsModule.

Device acceptance checklist, not yet verified on hardware:

1. Fresh Android 13+ install: deny permission, check suppressed result, grant permission, disable a channel, check channelBlocked, open its settings.
2. Incoming call: avatar/name, answer opens app, decline queues and dismisses. Expire notification and verify obsolete intents cannot answer.
3. Outgoing to ongoing: hangup, connected duration, opt-in mute/speaker requests. Republish confirmed engine state. Verify API 30 fallback and API 31+ native CallStyle.
4. Messaging: direct/group names and avatars, reply input updates to queued, read dismisses, mute persists across app restart, unmute permits later messages.
5. Kill process without force-stop while a notification exists. Tap answer/open and recover pending action at launch. Queue reply/read/hangup while JS is dead; verify recovery on next launch.
6. Subscribe while fetching pending actions, deliberately crash before acknowledgement, verify at-least-once recovery and parent deduplication. Check isolated actions for multiple conversations/calls.
7. Test locked/unlocked device, notification privacy, OEM layouts, and account-switch cleanup.

## Official Android references

- [CallStyle and pre-31 ranking](https://developer.android.com/develop/ui/views/notifications/call-style)
- [NotificationCompat.CallStyle](https://developer.android.com/reference/androidx/core/app/NotificationCompat.CallStyle)
- [Notifications, channels, direct reply, mutable RemoteInput PendingIntents](https://developer.android.com/develop/ui/compose/notifications/create-notification)
- [MessagingStyle, Person and conversation shortcuts](https://developer.android.com/reference/android/app/Notification.MessagingStyle)
- [Notification permission and self-managed-call exemption prerequisites](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
- [Foreground-service type permissions and prerequisites](https://developer.android.com/about/versions/14/changes/fgs-types-required)

MessagingStyle alone does not promise the dedicated Android conversation section. This module does not register long-lived sharing shortcuts. CallStyle alone does not register a Telecom call.
