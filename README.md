# Messenger

A clickable messenger prototype built with Expo SDK 57 and React Native 0.86. The interface uses warm ivory, coral accents, bundled DM Sans fonts, and Ionicons. Android is built locally as a standalone ARM64 APK. There is no Expo Go, development client, or running Metro server in the phone-testing workflow.

## Explore the prototype

- **Chats:** compact heading and private/group tabs, no Stories section heading, search, unread badges, online indicators, and seeded typing states. Typing a search query hides stories and tabs and searches all conversations. Emptying the query restores them. Open a chat to clear its unread count. Send a message to see a simulated reply after a short typing delay. Return to the list before the reply to see its unread badge.
- **Messages:** text, photos, videos, files, and voice notes. The plus beside the composer opens a compact attachment popover. Recording shows a metered animated waveform and duration. Long-press a bubble for anchored reactions, Reply, Forward, and Delete. Double-tap to react with 🤍. Reply snapshots also support replying to replies. Forward opens a searchable multi-recipient screen. Own messages support local delete-for-everyone tombstones; incoming messages can only be deleted for yourself. Tap media to view or play; files use the native sharing chooser.
- **Media albums:** select multiple photos/videos in one library session, or send consecutive media within two minutes. Matching-sender media forms a compact grid with at most four previews. For 50 items the fourth tile shows `+47`, counting that covered tile and the remaining items. Tap to browse every item or long-press an individual item for its actions. Text, different senders, replies to different messages, forwarded/deleted messages, and GIFs break the automatic grouping. Stored messages remain individual records for deletion, replies, and shared-media history.
- **Stories:** one ring per person, including one self ring for all your uploads. Indicators count items belonging to the current person, not all contacts. Tap to move between items, hold to pause, and swipe horizontally to switch people. Add multiple images/videos without forced cropping, with captions per item. Landscape media is contained rather than cropped. Open your own story to delete an item.
- **New conversation:** the plus button opens a compact anchored menu for a conversation, voice call, or video call. The conversation picker includes New contact and Create group actions. Voice/video call pickers show contacts only. There is no People tab. This does not query a real account directory or import the device address book.
- **Calls:** use the phone/video buttons in any conversation. Outgoing calls connect to a simulated screen after 2.5 seconds. Toggle video/microphone, open more controls, return to chat, or end the call. The ongoing call pill keeps its duration and returns to the call screen. Completed and declined calls appear in call history. Tap a call row to see all calls with that contact; only its trailing phone/video button starts another call.
- **Incoming call:** My Profile → Settings → Try an incoming call. A foreground banner lets you accept, decline, or open the full calling screen. Answer uses an upright handset; decline/end uses a rotated handset.
- **Profiles:** tap a chat’s name/avatar for a contact or group profile, shared media/docs/links, call history, dates, mutual groups, members/admins, mute/block, clear, and delete. Long-press a chat/group row for profile, mute, pin, and delete actions. Seeded membership and dates are mock data; newly created groups start with you as admin.
- **My Profile:** the avatar navigation opens your profile first, without a redundant page title. Edit photo, name, username, and bio in a keyboard-aware editor. Settings is a separate page for appearance, saved demo notification preferences, and an actual global haptics toggle. The bottom navigation is a rounded icon-only pill without individual active-icon boxes.

Conversations, stories, call history, profile, and appearance are saved in local, unencrypted app storage. Do not enter sensitive information. Notification sound/preview switches save preferences only. There are no push notifications, real users, real calls, live camera feeds on the call screen, or network messaging. Photo/video story uploads do not expire automatically in this prototype. Block, mute, forwarding, and deletion are local prototype operations, not requests to a messaging server. Mute saves the preference; no push service exists to suppress. Delete for everyone changes the local representation only. Group creation creates a local conversation, not invitations or a membership service.

Camera, photo, file, and microphone features use native Expo APIs and ask for permissions when needed. The video-call screen uses still photos instead of accessing the camera. Bundled fonts work offline; sample avatars, story photos, and chat photos load from Unsplash, which receives normal image requests. Picked media uses app-managed local/cache URIs and may be removed when the OS clears cache; this is not permanent media storage.

The composer uses your system keyboard rather than a custom emoji grid. React Native does not expose a portable command to open the keyboard’s emoji tab directly; use the keyboard’s own emoji key. Inputs use keyboard-avoiding layouts, with Android configured for resize. Verify keyboard behavior on a physical device and your chosen keyboard.

Android keyboards that implement rich-content insertion can send GIFs, images, and MP4 clips directly into the composer through the local `modules/keyboard-media` Expo module. Accepted files are limited to 25 MiB, copied unchanged into app-owned storage, and sent as image/video messages. `expo-image` renders animated GIFs. GIF insertion depends on the active keyboard; it is not universally supported on iOS or web. Library/file attachments remain available as a fallback. See `modules/keyboard-media/README.md` for source references and the device test checklist.

Rebuild the APK after adding native modules, including `expo-image` and the local keyboard-media bridge. An older APK and Expo Go cannot load the bridge. Native keyboard-module compilation has not yet been verified: a focused native build timed out after 180 seconds while compiling Expo core, before reaching the new module. JavaScript checks and bundle export do not establish native keyboard delivery. A physical Android keyboard/GIF test is required.

Keyboard media copies live in the app documents directory rather than temporary cache. They remain on this device until app data is cleared; automatic orphan-file cleanup is not implemented. Media selected through the regular picker retains the existing cache-lifetime limitation.

### Frontend checks

```sh
npm run check
npm test
npx expo export --platform android --output-dir artifacts/preview-bundle --max-workers 1
```

The model tests require Node 22.18+ or Node 24 for built-in TypeScript stripping. They cover unread counts, conversation ordering, read state, previews, duration formatting, story grouping, reply snapshots, forwarding payloads, deletion permissions, redaction, media-album boundaries, GIF exclusion, and overflow counts. They are not device interaction tests.

Expo uses Metro internally to bundle JavaScript during the release build. Avoiding Metro entirely would mean replacing Expo's supported bundling pipeline. The APK contains the bundle and runs without a connection to this computer.

## Build and install

From this directory on Windows:

```sh
npm ci
npm run check
npm run android:build
```

The build generates `android/` if necessary, builds the release variant for `arm64-v8a`, and copies the APK to `artifacts/messenger-local.apk`. First builds can take several minutes. Build again after editing the app; there is no hot reload.

Connect an ARM64 Android phone running Android 7.0 or newer. Enable developer options and USB debugging, accept the phone's authorization prompt, then run:

```sh
npm run android:install
```

This installs and opens `com.yashraj.messenger`. ADB does not need to be on PATH. Use the `ANDROID_SERIAL` environment variable if more than one device is connected. You can also copy the APK to the phone and install it manually.

## This machine

The build script respects `ANDROID_HOME` or `ANDROID_SDK_ROOT` and `JAVA_HOME`. When unset, it uses the tool locations found on this machine:

| Tool | Location or version |
| --- | --- |
| Android SDK | `P:\Applications\Android\Sdk` |
| JDK | `P:\Applications\jdk-17.0.17+10` |
| SDK platform / target | Android 36 |
| Build Tools | 36.0.0 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1 |

The Windows host is ARM64. The installed NDK uses Windows x86-64 host tools under Windows emulation. The APK's `arm64-v8a` ABI describes the Android phone, not the Windows toolchain.

The setup was compared with `../sosroad-rn`, `../famloc`, `../sosroad`, and `../cometchat-sample-app`. CometChat's recorded successful builds use `assembleRelease -PreactNativeArchitectures=arm64-v8a`. No custom AAPT2 override was found or added. Two Gradle workers limit concurrent native compilation.

SDK 57 matches those projects and the installed Android platform. The SDK 58 template requires platform 37, which was not installed when this project was created. Keep Expo and React Native versions aligned when upgrading.

`android/`, machine-specific `local.properties`, and build outputs are ignored by Git. Expo config is in `app.json`; regenerate native configuration with `npm run android:prebuild` after changing it. Do not put permanent manual changes in generated native files. Use an Expo config plugin for future native adjustments.

## Signing

This is a **local test build**, not a store release. Expo's generated release variant uses its debug signing key. Do not distribute this APK as a production release. Set up a private upload key and production signing before publishing. Regenerating the Android directory can change the test signing key; if Android reports a signature mismatch, uninstall the previous test app first, which deletes its app data.

## Checks and limitations

- `npm run check` passed TypeScript and Expo dependency compatibility checks during setup.
- `npm run android:build` completed successfully. Initial compilation exceeded the command time limit; cached follow-up builds completed the release tasks.
- APK inspection confirmed an embedded `assets/index.android.bundle` and 14 native libraries, all under `lib/arm64-v8a/`. The initial APK is about 26 MB.
- No phone was connected during initial setup, so installation and offline cold startup need a phone test.
- npm audit reports inherited Expo/React Native tooling advisories. Do not run `npm audit fix --force`: its proposed Expo/React Native downgrades are incompatible with this project. Recheck compatible upstream releases before production work.
- These build/install helpers target Windows and physical ARM64 Android phones. An x86-64 Android emulator needs its own ABI build. iOS native builds require macOS and Xcode.

## Source architecture

`App.tsx` handles screen composition and navigation, not feature markup or native media operations.

```text
src/
  domain/          Mock data, types, and pure conversation helpers
  state/           Persistent messenger state and simulated replies
  ui/              Shared controls, palette, navigation, quick actions
  features/
    chats/         Conversation list and stories strip
    conversations/ Messages, attachments, recording, reactions
    contacts/      New-conversation picker and contact/group editor
    calls/         Call state/timers, history, ringing and active screens
    profile/       Profile preferences, settings, and dialogs
    stories/       Story viewing, creation, and upload
```

Features depend on domain and shared UI modules, never on `App.tsx`. Native media operations are isolated in `useMessageMedia`; messaging persistence and reply timers are in `useMessenger`; call lifecycle timers are in `useCalls`. Call and conversation screens stay mounted while switching between a call and chat, preserving drafts and call controls. Read counts use conversation visibility rather than selection alone.

`npm test` enforces a 500-line limit on application source files, prevents imports back into `App.tsx`, and keeps domain modules independent of screens, storage, and React Native. Lockfiles and generated native files are not subject to source-file limits. `INSPIRATION/` is preserved.

For this frontend update, TypeScript, Expo dependency compatibility checks, model tests, and Android bundle export were verified. The full updated APK build passed native project configuration and reached compilation, but exceeded a four-minute command limit. Do not assume the existing APK contains this frontend until `npm run android:build` completes. Phone interaction, recording/playback, permission prompts, and Android visual layout still need device testing.

`expo-asset` is pinned to the SDK 57-compatible range explicitly because the unrestricted peer dependency from `expo-audio` otherwise allowed npm to select Expo 58's asset package, which fails SDK 57 native autolinking.
