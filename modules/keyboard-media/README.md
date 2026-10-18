# Android keyboard media

## Recommendation and source findings

Use a local Expo module to augment the existing RN TextInput. Do not replace it
with a separate EditText or depend on a clipboard polling workaround.

Inspected the installed React Native 0.86.3 sources:

- `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactEditText.kt`
  extends `AppCompatEditText` at line 101. Its `onCreateInputConnection` at line
  342 calls `super`, then optionally wraps key events. It does not advertise
  media types itself or install a media receiver.
- The same file's `onTextContextMenuItem` at line 366 converts paste to
  paste-as-plain-text and still delegates to AppCompat.
- `node_modules/react-native/Libraries/Components/TextInput/TextInput.js`
  has no `onPaste` handler. A JS paste callback is not the IME commitContent API.

AppCompat's `onCreateInputConnection` already handles MIME advertisement and
InputConnectionCompat wrapping on API 30 and below. Android's platform receive
content API handles API 31 and above. Registering a ViewCompat listener on the
actual ReactEditText therefore supports commitContent without patching RN,
reflection, observing global focus, replacing text watchers, or a new input view.
The installed Expo 57 APIs provide Fabric UIManager lookup and a main-thread
AsyncFunction queue. This module uses those, not the legacy bridge UIManager.

### Attach rejection on RN 0.86.3

The installed `ReactTextInputManager.kt` creates `ReactEditText` directly, and
`TextInput.js` forwards its host instance. There is no extra native container to
search for or reason to replace the TextInput ref.

`FabricUIManager.java:1072` resolves through a SurfaceMountingManager. It returns
null if the tag has no registered surface or the surface is stopped.
`SurfaceMountingManager.kt:1125` throws `IllegalViewOperationException` when a
surface exists but the native view is missing. A JS ref/effect does not wait for
that UI-thread mount transaction. The old single lookup converted null into
`Expected a mounted React Native TextInput`, incorrectly treating a not-yet-mounted
input as a type error.

Attach now retries only a missing native view, up to 60 lookups with 16 ms between
attempts. Wrong native types, unavailable React context/UIManager, and listener
conflicts still reject immediately with a specific diagnostic and the tag.
Detach, replacement of the same id, and module destruction cancel pending lookups
and settle their promises. A stopped surface or stale tag eventually times out;
it cannot keep a pending request alive indefinitely. Existing focused inputs still
get their IME connection restarted after successful registration.

The native regression reproduces lookup-before-mount ordering deterministically,
not a captured device trace. Without a connected device, the screenshot's exact
runtime ordering cannot be independently confirmed.

Official sources:

- https://developer.android.com/develop/ui/views/touch-and-input/image-keyboard
- https://developer.android.com/develop/ui/views/receive-rich-content
- https://developer.android.com/reference/android/view/inputmethod/InputContentInfo
- https://github.com/androidx/androidx/blob/androidx-main/appcompat/appcompat/src/main/java/androidx/appcompat/widget/AppCompatEditText.java
- https://github.com/androidx/androidx/blob/androidx-main/core/core/src/main/java/androidx/core/view/inputmethod/InputConnectionCompat.java

## Integration owned by the parent

```tsx
import { useRef } from 'react';
import { TextInput } from 'react-native';
import { KeyboardMediaInput } from './src/ui/KeyboardMediaInput';

const inputRef = useRef<TextInput>(null);

<KeyboardMediaInput
  ref={inputRef}
  value={text}
  multiline
  placeholder="Message"
  onChangeText={setText}
  onFocus={handleFocus}
  onMedia={(media) => handleAttachment(media)}
  onMediaError={({ message }) => showError(message)}
/>;

inputRef.current?.focus();
inputRef.current?.blur();
```

`KeyboardMediaInputProps` includes every `TextInputProps` property. The forwarded
ref is the real TextInput, not a partial focus/blur facade. Controlled text,
selection, multiline behavior, placeholder, styles, editable, onChangeText,
onFocus, clear, and setNativeProps continue through RN unchanged.

`onMedia` receives:

```ts
{
  uri: string; // file:// in the application's cache/keyboard-media directory
  mimeType: 'image/gif' | 'image/webp' | 'image/png' | 'image/jpeg' | 'video/mp4';
  width?: number;
  height?: number;
}
```

Image dimensions are populated when valid. Video dimensions are omitted.
Animated GIF/WebP bytes are copied without decoding/re-encoding animation.
The keyboard chooses which accepted format it sends, including MP4 for some
GIF search results. Sending, previewing, and playback remain the parent's job.

## Configuration and dependencies

No app config plugin, app.json edit, npm dependency, manual generated Android
edit, or storage permission is required. Expo's default `./modules` native
modules directory discovers `expo-module.config.json`. Confirm with:

```sh
node node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js resolve --platform android
```

Build a new Android binary using the existing project workflow. Metro reload
alone and Expo Go cannot install this module. Missing native code leaves an
ordinary usable TextInput and logs one console warning per JS runtime, including
across component remounts and Fast Refresh module re-evaluation. It does not call
`onMediaError` on mount, so old binaries do not show an Alert whenever a chat opens.
Actual attach/copy failures still call `onMediaError`.

```ts
import { keyboardMediaAvailable } from './src/ui/KeyboardMediaInput';
```

This exported readonly boolean is true only when the Android native module is
present in the current runtime. It is false on old binaries, Expo Go, iOS, and
web. It does not guarantee the active keyboard supports GIFs or that registration
succeeded. The UI can use it to hide or label keyboard-media instructions.

Verified against installed RN 0.86.3, Expo 57.0.30, and expo-modules-core 57.0.23:

- Expo's plugin `ProjectConfiguration.kt` adds core as `compileOnly`, applies
  Kotlin/Android plugins, and supplies SDK defaults.
- Core's `android/build.gradle` exports `androidx.core:core-ktx:1.17.0` via `api`,
  but declares React Android as `implementation`, so RN is not exported to this
  module's compile classpath by core.
- This module explicitly declares `implementation 'com.facebook.react:react-android'`,
  matching installed expo-font, expo-sharing, and other modules. RN's Gradle
  `DependencyUtils.kt` forces the installed RN version across projects.
- RN's `ReactAndroid/build.gradle.kts` exports AppCompat via `api`; its version
  catalog declares 1.7.0. Other dependencies may raise the final resolved version.

No new npm package or Android library coordinate was introduced; the explicit
RN declaration makes an already-installed dependency available for compilation.
These are source/declaration checks, not a new Gradle dependency-resolution run.

No iOS native module is registered. iOS/web render the unchanged RN TextInput;
`onMedia` is not promised there. iOS has no universal equivalent of Android's
IME commitContent contract. Clipboard/image paste is a separate integration.

## Permissions, safety, and lifetime

The receive-content path deliberately delegates grant handling to Android and
AppCompat. InputConnectionCompat checks INPUT_CONTENT_GRANT_READ_URI_PERMISSION
and requests the grant before calling the listener. Permission failure rejects
the commit before the module reads it. API 31+ handles this through the platform.
The module retains the complete accepted payload through async reads. Android
releases its grants after the payload is no longer retained. Explicit immediate
release is NOT implemented: AndroidX marks its grant-bearing extra private and
instructs apps not to access it. This is the documented receive-content ownership
model, not an independently implemented OnCommitContentListener.

Only content:// URIs with advertised supported media types enter the worker.
Resolver MIME types must also be supported. Copies reject empty streams, read
failures, SecurityExceptions, files larger than 25 MiB, image MIME/dimension
mismatches, and MP4 files without an ftyp header. MP4 validation is a header
check, not a full codec/container security validator. One worker and four queued
payloads bound parallel work. Provider reads can still block; there is no
hard I/O timeout against a malicious or stalled content provider.

JS receives the app-owned file only after streams close and validation finishes.
Partial files are deleted on failure. Unmounting removes the listener and drops
pending events, deleting completed files that no longer have a receiver.
Temporary native window detach does not unregister the input, so navigation
reattachment continues to work. Module destruction drains accepted copies,
clears bindings, and suppresses their events. Registration restarts an existing
focused input connection, covering autoFocus before asynchronous registration.

Successful files are caller-owned cache entries. Move them to durable storage
before persisting a message. Delete unused/sent entries according to the app's
attachment lifecycle. There is no automatic successful-file eviction, because
this module cannot know when the parent has finished with an attachment.

## Validation and device checklist

For the attach fix, the native regression failed against the original immediate
lookup with `Expected a mounted React Native TextInput`, then passed after adding
the bounded mount wait. All five `MountAwaiterTest` tests pass, covering eventual
mount, detach cancellation, timeout, non-retryable errors, replacement, and destroy
cleanup. The tests execute the Kotlin coordinator used by the native module with
a deterministic scheduler, without Android view mocks or a device.

Both debug and release native Kotlin compilation passed using the installed SDK
and JDK. These checks do not assemble an APK or exercise an actual Fabric renderer,
Android Handler timing, or IME content delivery. ADB was available but listed no
connected device. A rebuilt native binary is required for this fix.

Wrapper regression tests use the real transpiled component with mocked hooks
and native APIs to verify missing-binary warning deduplication across mounts and
module re-evaluation, availability on Android/iOS, ref/prop forwarding, and
attach/detach. They do not simulate React reconciliation or native IME delivery.

```sh
node --test modules/keyboard-media/KeyboardMediaInput.test.cjs
```

Native regression and compilation, from `android` with the project's JDK/SDK
configured:

```sh
gradlew.bat :keyboard-media:testDebugUnitTest --tests expo.modules.keyboardmedia.MountAwaiterTest :keyboard-media:compileReleaseKotlin --console=plain --max-workers=2
```

On a native rebuild, test with Gboard or another commitContent-capable keyboard:

1. On API 30 and API 31+, focus the field, open keyboard GIF search, select a GIF.
   Assert one event, a readable cache file, correct MIME, and animated playback.
2. Exercise GIF, animated WebP, PNG, JPEG, and MP4 through a test IME. Check
   commitContent both with and without the read-grant flag. Revoke access after
   delivery and confirm the cache copy remains readable.
3. Supply a denied URI, unsupported MIME, file:// URI, empty file, malformed
   image/video, and a stream over 25 MiB. No successful media event or partial
   cache file should remain. Grant failure may be rejected upstream without a
   JS error event. Queue overflow reports an error after accepting the payload.
4. Verify controlled text, composing text, emoji, multiline return, selection,
   plain-text paste, onFocus, ref.focus(), ref.blur(), clear(), and editable=false.
5. Switch between two inputs. Mount/unmount during copying, navigate away/back,
   background/foreground, and reload. Events must not reach a different input.
6. Paste an image where the keyboard/system supports it. This listener can also
   receive clipboard media, but clipboard behavior is not a universal onPaste API.

There is no automated device/IME test harness in this module. A Kotlin compile
or TypeScript check alone cannot verify keyboard interoperability.
